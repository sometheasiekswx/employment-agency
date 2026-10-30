"""Serve the same Next.js static export in local and hosted editions."""
from pathlib import Path
import base64
import hashlib
import re
from .workspaces import inside


ROOT = Path(__file__).parent / 'web'


class MissingFrontendError(ValueError):
    pass


def asset(path):
    """Resolve only packaged frontend assets, never workspace or source files."""
    if not (ROOT / 'index.html').is_file():
        raise MissingFrontendError('Frontend assets are missing. Run npm ci and npm run build in frontend/ before starting the source installation.')
    relative = path.lstrip('/')
    if not relative or path.endswith('/'):
        relative += 'index.html'
    elif relative in ('career', 'search', 'settings', 'history'):
        relative += '/index.html'
    result = inside(ROOT, relative)
    return result if result.is_file() else None


def script_policy(html):
    """Allow exact build-generated bootstrap scripts without unsafe-inline."""
    hashes = []
    for attributes, source in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, re.I | re.S):
        if not re.search(r'\bsrc\s*=', attributes, re.I):
            digest = base64.b64encode(hashlib.sha256(source.encode()).digest()).decode()
            hashes.append("'sha256-" + digest + "'")
    return "script-src 'self'" + ((' ' + ' '.join(hashes)) if hashes else '')
