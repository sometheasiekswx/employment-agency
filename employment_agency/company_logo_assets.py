"""Bounded raster normalization for public company logo evidence."""

from http.client import HTTPException
from io import BytesIO
from queue import Empty, Queue
import re
import threading
from urllib.parse import unquote

from PIL import Image

from . import sources
from .store import atomic, digest
from .workspaces import inside


ASSET_FOLDER = 'records/company-logos'
SHA256 = re.compile(r'[a-f0-9]{64}')
FORMATS = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}
INPUT_LIMIT = 256 * 1024
ASSET_LIMIT = 160 * 1024
MAX_SIDE = 2048
MAX_PIXELS = 2_000_000
THUMBNAIL_SIDE = 192
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
NETWORK_SLOTS = threading.BoundedSemaphore(4)


class UnsupportedLogo(ValueError):
    pass


def asset_path(root, sha256):
    if not isinstance(sha256, str) or not SHA256.fullmatch(sha256):
        raise ValueError('Invalid company logo identifier')
    return inside(root, f'{ASSET_FOLDER}/{sha256}.png')


def normalized_png(data):
    if not data.startswith(PNG_SIGNATURE) or len(data) > ASSET_LIMIT:
        return False
    try:
        with Image.open(BytesIO(data), formats=['PNG']) as image:
            if (image.mode != 'RGBA' or min(image.size) < 1 or max(image.size) > THUMBNAIL_SIDE
                    or getattr(image, 'is_animated', False) or image.info):
                return False
            image.verify()
        with Image.open(BytesIO(data), formats=['PNG']) as image:
            image.load()
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return False
    return True


def read(root, sha256):
    """Only a regular, bounded PNG with its expected content hash can be served."""
    try:
        path = asset_path(root, sha256)
        if not path.is_file():
            return None
        with path.open('rb') as file:
            data = file.read(ASSET_LIMIT + 1)
    except (OSError, ValueError):
        return None
    if digest(data) == sha256 and normalized_png(data):
        return data
    return None


def persist(root, data):
    if not normalized_png(data):
        raise ValueError('Expected a normalized company logo')
    sha256 = digest(data)
    if read(root, sha256) is None:
        atomic(asset_path(root, sha256), data, staging=inside(root, '.runtime/company-logos'))
    return sha256


def normalize(body, media_type):
    kind = FORMATS.get(media_type)
    if not kind:
        raise UnsupportedLogo('The source did not return a supported raster format')
    if not 0 < len(body) <= INPUT_LIMIT:
        raise UnsupportedLogo('The logo exceeds its download size limit')
    try:
        with Image.open(BytesIO(body), formats=[kind]) as image:
            width, height = image.size
            if min(width, height) < 1 or max(width, height) > MAX_SIDE or width * height > MAX_PIXELS:
                raise UnsupportedLogo('The logo exceeds its decoded size limit')
            if getattr(image, 'is_animated', False):
                raise UnsupportedLogo('Animated logos are unsupported')
            image.verify()
        with Image.open(BytesIO(body), formats=[kind]) as image:
            thumbnail = image.convert('RGBA')
            thumbnail.thumbnail((THUMBNAIL_SIDE, THUMBNAIL_SIDE), Image.Resampling.LANCZOS)
            clean = Image.new('RGBA', thumbnail.size)
            clean.paste(thumbnail)
            output = BytesIO()
            clean.save(output, format='PNG')
            data = output.getvalue()
    except UnsupportedLogo:
        raise
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise UnsupportedLogo('The source image could not be decoded safely') from exc
    if len(data) > ASSET_LIMIT:
        raise UnsupportedLogo('The normalized logo exceeds its storage size limit')
    return data


def public_logo(url):
    try:
        parsed = sources.public_url(url)
    except ValueError as exc:
        raise UnsupportedLogo('A public HTTPS logo URL is required') from exc
    filename = unquote(parsed.path).rsplit('/', 1)[-1].casefold()
    if (not sources.public_logo_query(parsed.query) or parsed.fragment
            or 'favicon' in filename or filename.endswith('.ico')):
        raise UnsupportedLogo('The logo URL is not a supported public branding asset')
    return parsed


def same_host(a, b):
    return host_key(a) == host_key(b)


def host_key(host):
    return host.rstrip('.').removeprefix('www.')


def request(url, deadline, *, max_bytes, accept, redirect):
    """Give branding a wall-clock limit even if DNS or response headers stall."""
    if not NETWORK_SLOTS.acquire(timeout=sources.remaining(deadline)):
        raise TimeoutError('The branding network is busy')
    result = Queue(maxsize=1)

    def fetch():
        try:
            outcome = sources.request(url, deadline=deadline, max_bytes=max_bytes,
                                      headers={'Accept': accept}, allow_redirect=redirect)
        except RETRIEVAL_ERRORS as exc:
            outcome = exc
        finally:
            NETWORK_SLOTS.release()
        result.put(outcome)

    try:
        threading.Thread(target=fetch, daemon=True).start()
    except RuntimeError:
        NETWORK_SLOTS.release()
        raise OSError('Could not start branding retrieval') from None
    try:
        response = result.get(timeout=sources.remaining(deadline))
    except Empty:
        raise TimeoutError('Branding retrieval timed out') from None
    if isinstance(response, sources.ResponseTooLarge):
        raise UnsupportedLogo('The branding source exceeds its download size limit') from response
    if isinstance(response, Exception):
        raise response
    return response


def retrieve(url, deadline):
    host = public_logo(url).hostname

    def redirect(target):
        if not same_host(public_logo(target).hostname, host):
            raise UnsupportedLogo('The logo redirected outside its published asset host')

    response = request(url, deadline, max_bytes=INPUT_LIMIT, accept=', '.join(FORMATS), redirect=redirect)
    redirect(response.url)
    if response.headers.get('Content-Encoding', 'identity').casefold() != 'identity':
        raise UnsupportedLogo('The logo uses an unsupported HTTP content encoding')
    if len(response.headers.get_all('Content-Type', [])) != 1:
        raise UnsupportedLogo('The source did not identify a single raster media type')
    body = normalize(response.body, response.headers.get_content_type())
    return body, response.url


RETRIEVAL_ERRORS = (ValueError, OSError, HTTPException)
