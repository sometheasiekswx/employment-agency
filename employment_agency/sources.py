"""Public read-only sources, with a pinned address for every HTTPS hop."""

import http.client
import ipaddress
import json
import re
import socket
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import Message
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from time import monotonic
from unicodedata import normalize
from urllib.parse import parse_qsl, urljoin, urlsplit

import truststore

from .imports import plain
from .store import digest, now


USER_AGENT = "EmploymentAgency/0.6 (public job metadata)"
MAX_BYTES = 10 * 1024 * 1024
REDIRECTS = (301, 302, 303, 307, 308)
TLS_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
LOGO_QUERY_KEYS = frozenset({
    'v', 'ver', 'version', 'rev', 'cache', 'cb',
    'format', 'fm', 'auto', 'fit', 'crop', 'q', 'quality',
    'w', 'width', 'h', 'height', 'dpr', 'resize', 'size',
})


class SourceError(ValueError):
    def __init__(self, message, *, status=None, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


class ResponseTooLarge(SourceError):
    pass


@dataclass(frozen=True)
class PublicResponse:
    body: bytes
    url: str
    headers: Message
    status: int


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout):
        super().__init__(host, timeout=timeout, context=TLS_CONTEXT)
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


def public_url(url):
    if (not isinstance(url, str) or not url or len(url) > 2000
            or "\\" in url or any(char.isspace() or ord(char) < 32 for char in url)):
        raise SourceError("Enter a public HTTPS URL")
    u = urlsplit(url)
    if (u.scheme != "https" or not u.hostname or not u.hostname.isascii()
            or "%" in u.hostname or u.username is not None or u.port not in (None, 443)):
        raise SourceError("Only public HTTPS URLs on port 443 are supported")
    return u


def public_addresses(host):
    addresses = {a[4][0] for a in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    if not addresses or any(not public_address(ipaddress.ip_address(a)) for a in addresses):
        raise SourceError("Private or reserved network destination blocked")
    return sorted(addresses, key=lambda address: (":" in address, address))


def public_address(address):
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return address.is_global and not address.is_multicast and not address.is_reserved


def remaining(deadline):
    seconds = deadline - monotonic()
    if seconds <= 0:
        raise TimeoutError("Source request timed out")
    return seconds


def request(url, *, deadline, headers=None, redirects=0, data=None, allow_redirect=None,
            accept_not_modified=False, stop_at_redirect=False, max_bytes=MAX_BYTES):
    """Read a bounded public HTTPS response with one budget across redirects."""
    u = public_url(url)
    if redirects > 3:
        raise SourceError("Too many redirects")
    remaining(deadline)
    addresses = public_addresses(u.hostname)
    conn = None
    last_error = None
    for address in addresses[:4]:
        candidate = PinnedHTTPS(u.hostname, address, min(2.5, remaining(deadline)))
        try:
            candidate.connect()
        except OSError as exc:
            candidate.close()
            last_error = exc
        else:
            conn = candidate
            break
    if conn is None:
        raise last_error
    try:
        target = (u.path or "/") + ("?" + u.query if u.query else "")
        conn.request("POST" if data is not None else "GET", target, body=data,
                     headers={"User-Agent": USER_AGENT, "Accept": "*/*", **(headers or {})})
        transport = conn.sock
        transport.settimeout(remaining(deadline))
        r = conn.getresponse()
        with r:
            if data is None and r.status in REDIRECTS:
                location = r.getheader("Location")
                if not location:
                    raise SourceError("Source returned an incomplete redirect")
                destination = urljoin(url, location)
                if allow_redirect is not None:
                    allow_redirect(destination)
                if stop_at_redirect:
                    return PublicResponse(b"", url, r.headers, r.status)
                return request(destination, deadline=deadline, redirects=redirects + 1,
                               allow_redirect=allow_redirect, accept_not_modified=accept_not_modified,
                               max_bytes=max_bytes)
            if r.status == 304 and accept_not_modified:
                return PublicResponse(b"", url, r.headers, r.status)
            if r.status != 200:
                raise SourceError(f"Source returned HTTP {r.status}", status=r.status,
                                  retry_after=retry_delay(r.getheader("Retry-After")))
            limit_message = "Source exceeds 10 MB" if max_bytes == MAX_BYTES else "Source exceeds its download size limit"
            if r.length is not None and r.length > max_bytes:
                raise ResponseTooLarge(limit_message)
            body = bytearray()
            while not r.isclosed() and len(body) <= max_bytes:
                transport.settimeout(remaining(deadline))
                block = r.read1(min(65536, max_bytes + 1 - len(body)))
                if not block:
                    break
                body.extend(block)
            if len(body) > max_bytes:
                raise ResponseTooLarge(limit_message)
            if r.length:
                raise SourceError("Source returned an incomplete response")
            return PublicResponse(bytes(body), url, r.headers, r.status)
    finally:
        conn.close()


def retry_delay(value):
    if not value:
        return None
    if value.isdigit():
        return min(int(value[:9]), 31_536_000)
    try:
        return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
    except (ValueError, TypeError, OverflowError):
        return None


def decode(body, charset=None):
    try:
        return body.decode(charset or "utf-8-sig", errors="replace")
    except LookupError:
        return body.decode("utf-8-sig", errors="replace")


def get(url, redirects=0):
    response = request(url, deadline=monotonic() + 15, redirects=redirects)
    return decode(response.body, response.headers.get_content_charset()), response.url


class LinkedData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.chunks = []
        self.values = []

    def handle_starttag(self, t, a):
        if t == "script" and dict(a).get("type") == "application/ld+json":
            self.capture = True
            self.chunks = []

    def handle_data(self, d):
        if self.capture:
            self.chunks.append(d)

    def handle_endtag(self, t):
        if t == "script" and self.capture:
            self.capture = False
            try:
                self.values.append(json.loads("".join(self.chunks)))
            except ValueError:
                pass


def walk(v):
    if isinstance(v, list):
        for x in v:
            yield from walk(x)
    elif isinstance(v, dict):
        if v.get("@type") == "JobPosting" or "JobPosting" in (
            v.get("@type") if isinstance(v.get("@type"), list) else []
        ):
            yield v
        if "@graph" in v:
            yield from walk(v["@graph"])


def normalized(title, employer, location, description, url, source, **extra):
    return {
        "id": digest(url.encode())[:24],
        "title": " ".join(str(title or "").split())[:300],
        "employer": " ".join(str(employer or "").split())[:300],
        "location": str(location)[:500],
        "description": plain(str(description))[:40000],
        "url": url,
        "source": source,
        "checked_at": now(),
        "availability": "retrieved",
        "requirements": [],
        "eligibility": "unknown",
        "work_arrangement": "unknown",
        "seniority": "unknown",
        **extra,
    }


def listing_locations(values):
    if not isinstance(values, list):
        values = [values]
    locations = []
    for place in values:
        if isinstance(place, str):
            locations.append(place)
        elif isinstance(place, dict):
            address = place.get("address") or {}
            if not isinstance(address, dict):
                address = {"addressLocality": address}
            parts = [address.get(key) for key in ("addressLocality", "addressRegion", "addressCountry")]
            locations.append(", ".join(part for part in parts if isinstance(part, str) and part) or place.get("name", ""))
    return " / ".join(dict.fromkeys(loc for loc in locations if isinstance(loc, str) and loc))


def labelled_values(text, labels):
    pattern = rf"(?im)^[ \t]*(?:{'|'.join(map(re.escape, labels))})[ \t]*:[ \t]*(?:\n[ \t\n]*)?([^\n:]+)$"
    return list(dict.fromkeys(" ".join(value.split()) for value in re.findall(pattern, text) if value.strip()))


def same_label(a, b):
    def key(value):
        return "".join(c for c in normalize("NFKC", value).casefold() if c.isalnum())

    return key(a) == key(b)


def hiring_employer(title, metadata, advert):
    def before_separator(value):
        return re.split(r"\s*\|\s*|\s+[-–—]\s+", value, maxsplit=1)[0]

    def usable(value):
        if not isinstance(value, str) or not 1 < len(value.strip()) <= 150:
            return False
        if value.casefold().strip() in (
            "unknown", "confidential", "undisclosed", "n/a", "not specified",
            "company", "hiring company", "confidential company",
        ):
            return False
        return any(c.isalpha() for c in value) and not any(
            same_label(value, role) for role in (title, before_separator(title))
        ) and not same_label(before_separator(value), title)

    labels = ("Hiring Employer", "Hiring Company", "Employer Name", "Employer", "Company Name", "Company")
    named = [value for value in labelled_values(advert, labels) if usable(value)]
    if usable(metadata):
        named.append(" ".join(metadata.split()))
    if named and all(same_label(value, named[0]) for value in named):
        return named[0]
    return ""


def posting_date(value):
    value = str(value or "").strip()
    for form in ("%d-%b-%Y", "%B %d, %Y", "%b %d, %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, form).date().isoformat()
        except ValueError:
            continue
    return value


def public_logo_query(query):
    """Accept bounded public version and raster presentation options."""
    if not query:
        return True
    if len(query) > 256:
        return False
    try:
        pairs = parse_qsl(query, strict_parsing=True, keep_blank_values=True,
                          max_num_fields=8, errors='strict')
    except ValueError:
        return False
    keys = set()
    for name, value in pairs:
        key = name.casefold()
        if (key not in LOGO_QUERY_KEYS or key in keys
                or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._,-]{0,63}', value)):
            return False
        keys.add(key)
    return bool(keys)


def logo_candidate(value, page_url):
    """Read an explicit schema.org logo URL or ImageObject."""
    if isinstance(value, dict):
        value = value.get("contentUrl") or value.get("url")
    if (not isinstance(value, str) or not value or "\\" in value
            or any(c.isspace() or ord(c) < 32 for c in value)):
        return None
    try:
        parsed = public_url(urljoin(page_url, value))
    except ValueError:
        return None
    if not public_logo_query(parsed.query):
        return None
    return parsed._replace(fragment="").geturl()


def structured_job(j, url, *, advert="", page_url=None):
    location = listing_locations(j.get("jobLocation", []))
    remote = j.get("jobLocationType") == "TELECOMMUTE"
    if remote and (areas := listing_locations(j.get("applicantLocationRequirements", []))):
        location = "Remote — " + areas
    organization = j.get("hiringOrganization")
    published = organization.get("name") if isinstance(organization, dict) else organization
    title = str(j.get("title") or "")
    description = str(j.get("description") or "")
    employer = hiring_employer(title, published, plain(description) + "\n" + advert)
    evidence = {}
    if employer:
        identifier = j.get('identifier')
        requisition = identifier.get('value') if isinstance(identifier, dict) else ''
        evidence = {'name': employer, 'url': url, 'source': 'published-hiring-employer',
                    'requisition': str(requisition or '')[:200]}
        if isinstance(organization, dict) and isinstance(published, str) and same_label(published, employer):
            page = page_url or url
            if logo := logo_candidate(organization.get("logo"), page):
                evidence["logo"] = {"url": logo, "page_url": page}
    return normalized(
        title,
        employer,
        location,
        description,
        url,
        "JobPosting JSON-LD",
        closes=posting_date(j.get("validThrough")),
        posted_at=posting_date(j.get("datePosted")),
        work_arrangement="remote" if remote else "unknown",
        employer_evidence=evidence,
    )


def url_job(url):
    body, final = get(url)
    parser = LinkedData()
    parser.feed(body)
    for value in parser.values:
        for posting in walk(value):
            job = structured_job(posting, final)
            if job["title"] and job["description"] and job["employer"]:
                return job
    raise SourceError(
        "No supported JobPosting structured data. Paste the advert instead; availability is unverified."
    )


def discover(kind, board, *, fetch=None):
    fetch = fetch or get
    if not re.fullmatch("[A-Za-z0-9_-]{1,100}", board):
        raise ValueError("Use the employer board identifier, not a URL")
    if kind == "greenhouse":
        body, _ = fetch(
            "https://boards-api.greenhouse.io/v1/boards/" + board + "/jobs?content=true"
        )
        payload = json.loads(body)
        postings = payload["jobs"]
        total = payload.get("meta", {}).get("total")
        if not isinstance(postings, list) or (type(total) is int and total != len(postings)):
            raise SourceError("The Greenhouse board returned an incomplete job list")
        return [
            normalized(
                j["title"],
                board,
                j.get("location", {}).get("name", ""),
                j.get("content", ""),
                j["absolute_url"],
                "greenhouse:" + board,
                source_requisition=f"greenhouse:{board}:{j['id']}" if j.get("id") is not None else "",
                vacancy_requisition=str(j.get("requisition_id") or j.get("internal_job_id") or ""),
            )
            for j in postings
        ]
    if kind == "lever":
        endpoint = "https://api.lever.co/v0/postings/" + board + "?mode=json"
        postings = []
        seen = set()
        for _ in range(20):
            body, _ = fetch(f"{endpoint}&skip={len(postings)}&limit=100")
            page = json.loads(body)
            if not isinstance(page, list):
                raise SourceError("Invalid Lever job list")
            urls = {item["hostedUrl"] for item in page}
            if not urls:
                break
            if urls <= seen:
                raise SourceError("Lever returned a page without new postings")
            if (urls & seen) or len(urls) != len(page):
                raise SourceError("The Lever board returned overlapping pages")
            seen.update(urls)
            postings.extend(page)
        else:
            raise SourceError("The Lever board exceeded the pagination limit")
        return [
            normalized(
                j["text"],
                board,
                j.get("categories", {}).get("location", ""),
                j.get("descriptionPlain", "")
                + "\n"
                + "\n".join(plain(x.get("content", "")) for x in j.get("lists", [])),
                j["hostedUrl"],
                "lever:" + board,
                source_requisition=f"lever:{board}:{j['id']}" if j.get("id") else "",
                work_arrangement=j.get("workplaceType", "unknown"),
            )
            for j in postings
        ]
    raise ValueError("Supported adapters: greenhouse, lever")
