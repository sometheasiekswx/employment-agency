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
from urllib.parse import urljoin, urlsplit

import truststore

from .imports import plain
from .store import digest, now


USER_AGENT = "EmploymentAgency/0.6 (public job metadata)"
MAX_BYTES = 10 * 1024 * 1024
REDIRECTS = (301, 302, 303, 307, 308)
TLS_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


class SourceError(ValueError):
    def __init__(self, message, *, status=None, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


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
            accept_not_modified=False, stop_at_redirect=False):
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
                               allow_redirect=allow_redirect, accept_not_modified=accept_not_modified)
            if r.status == 304 and accept_not_modified:
                return PublicResponse(b"", url, r.headers, r.status)
            if r.status != 200:
                raise SourceError(f"Source returned HTTP {r.status}", status=r.status,
                                  retry_after=retry_delay(r.getheader("Retry-After")))
            body = bytearray()
            while not r.isclosed() and len(body) <= MAX_BYTES:
                transport.settimeout(remaining(deadline))
                block = r.read1(min(65536, MAX_BYTES + 1 - len(body)))
                if not block:
                    break
                body.extend(block)
            if len(body) > MAX_BYTES:
                raise SourceError("Source exceeds 10 MB")
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


def structured_job(j, url):
    location = listing_locations(j.get("jobLocation", []))
    remote = j.get("jobLocationType") == "TELECOMMUTE"
    if remote and (areas := listing_locations(j.get("applicantLocationRequirements", []))):
        location = "Remote — " + areas
    organization = j.get("hiringOrganization")
    employer = organization.get("name") if isinstance(organization, dict) else organization
    return normalized(
        j.get("title") or "",
        employer or "",
        location,
        j.get("description") or "",
        url,
        "JobPosting JSON-LD",
        closes=str(j.get("validThrough") or ""),
        posted_at=str(j.get("datePosted") or ""),
        work_arrangement="remote" if remote else "unknown",
    )


def url_job(url):
    body, final = get(url)
    parser = LinkedData()
    parser.feed(body)
    for value in parser.values:
        for posting in walk(value):
            job = structured_job(posting, final)
            if job["title"] and job["description"]:
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
