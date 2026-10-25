"""Public read-only sources; addresses are validated and pinned per connection."""

import http.client
import ssl
import socket
import ipaddress
import json
import re
from urllib.parse import urlsplit, urljoin
from html.parser import HTMLParser
from .imports import plain
from .store import now, digest


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=15, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def get(url, redirects=0):
    u = urlsplit(url)
    if (
        u.scheme != "https"
        or not u.hostname
        or u.username
        or u.password
        or u.port not in (None, 443)
    ):
        raise ValueError("Only public HTTPS URLs on port 443 are supported")
    if redirects > 3:
        raise ValueError("Too many redirects")
    addresses = {
        a[4][0] for a in socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    }
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise ValueError("Private or reserved network destination blocked")
    conn = PinnedHTTPS(u.hostname, sorted(addresses)[0])
    try:
        conn.request(
            "GET",
            (u.path or "/") + ("?" + u.query if u.query else ""),
            headers={
                "User-Agent": "EmploymentAgency/0.1 (public job metadata)",
                "Accept": "application/json,text/html",
            },
        )
        r = conn.getresponse()
        if r.status in (301, 302, 303, 307, 308):
            return get(urljoin(url, r.getheader("Location", "")), redirects + 1)
        if r.status != 200:
            raise ValueError("Source returned HTTP " + str(r.status))
        body = r.read(10 * 1024 * 1024 + 1)
        if len(body) > 10 * 1024 * 1024:
            raise ValueError("Source exceeds 10 MB")
        return body.decode("utf-8"), url
    finally:
        conn.close()


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
        "title": str(title)[:300],
        "employer": str(employer)[:300],
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


def url_job(url):
    body, final = get(url)
    parser = LinkedData()
    parser.feed(body)
    jobs = [j for v in parser.values for j in walk(v)]
    if not jobs:
        raise ValueError(
            "No supported JobPosting structured data. Paste the advert instead; availability is unverified."
        )
    j = jobs[0]
    loc = j.get("jobLocation", {})
    loc = loc[0] if isinstance(loc, list) and loc else loc
    addr = loc.get("address", {}) if isinstance(loc, dict) else {}
    location = ", ".join(
        str(addr[k])
        for k in ("addressLocality", "addressRegion", "addressCountry")
        if isinstance(addr, dict) and k in addr
    )
    return normalized(
        j.get("title", "Untitled"),
        j.get("hiringOrganization", {}).get("name", "Unknown"),
        location,
        j.get("description", ""),
        final,
        "JobPosting JSON-LD",
        closes=j.get("validThrough", "")[:10],
    )


def discover(kind, board):
    if not re.fullmatch("[A-Za-z0-9_-]{1,100}", board):
        raise ValueError("Use the employer board identifier, not a URL")
    if kind == "greenhouse":
        body, _ = get(
            "https://boards-api.greenhouse.io/v1/boards/" + board + "/jobs?content=true"
        )
        return [
            normalized(
                j["title"],
                board,
                j.get("location", {}).get("name", ""),
                j.get("content", ""),
                j["absolute_url"],
                "greenhouse:" + board,
            )
            for j in json.loads(body)["jobs"][:1000]
        ]
    if kind == "lever":
        body, _ = get("https://api.lever.co/v0/postings/" + board + "?mode=json")
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
                work_arrangement=j.get("workplaceType", "unknown"),
            )
            for j in json.loads(body)[:1000]
        ]
    raise ValueError("Supported adapters: greenhouse, lever")
