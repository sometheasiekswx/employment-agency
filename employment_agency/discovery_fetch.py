"""Fetch a public discovery target without using workspace data or credentials."""

import http.client
import json
import os
import sys
import threading
from collections import OrderedDict
from pathlib import Path
from time import monotonic
from urllib.parse import urlunsplit

from lxml import etree
from protego import Protego

from . import job_feeds, public_pages, render_public_page, sources


REQUEST_SECONDS = 6
FIRECRAWL_SECONDS = 10
FIRECRAWL_LIMIT = 2
FIRECRAWL_API = "https://api.firecrawl.dev"
EXCLUDED_HOSTS = ("linkedin.com", "indeed.com")
TRANSIENT = (429, 500, 502, 503, 504)
FETCH_FAILURES = (ValueError, OSError, http.client.HTTPException, etree.Error)
SOURCE_BUDGET = 18


class Deferred(sources.SourceError):
    pass


def firecrawl_api_key():
    if key := os.environ.get("FIRECRAWL_API_KEY", "").strip():
        return key
    # Reuse the local Firecrawl CLI sign-in for the same cloud endpoint.
    if sys.platform == "darwin":
        config = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        config = Path.home() / "AppData" / "Roaming"
    else:
        config = Path.home() / ".config"
    try:
        saved = json.loads((config / "firecrawl-cli" / "credentials.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ""
    if not isinstance(saved, dict) or saved.get("apiUrl") not in (None, "", FIRECRAWL_API, FIRECRAWL_API + "/"):
        return ""
    key = saved.get("apiKey")
    return key.strip() if isinstance(key, str) else ""


class ResponseCache:
    def __init__(self):
        self.lock = threading.Lock()
        self.entries = OrderedDict()
        self.bytes = 0
        self.backoff = {}

    def get(self, url):
        with self.lock:
            if url in self.entries:
                self.entries.move_to_end(url)
                return self.entries[url]
        return None

    def remember(self, url, response):
        with self.lock:
            previous = self.entries.pop(url, None)
            if previous:
                self.bytes -= len(previous[1].body)
            if response.url != url or len(response.body) > 6 * 1024 * 1024:
                return
            self.entries[url] = (monotonic(), response)
            self.bytes += len(response.body)
            while len(self.entries) > 64 or self.bytes > 24 * 1024 * 1024:
                _, (_, removed) = self.entries.popitem(last=False)
                self.bytes -= len(removed.body)

    def blocked_until(self, host):
        with self.lock:
            deadline = self.backoff.get(host, 0)
            if deadline <= monotonic():
                self.backoff.pop(host, None)
                return 0
            return deadline

    def defer(self, host, seconds):
        deadline = monotonic() + (seconds if seconds is not None else 60)
        with self.lock:
            self.backoff[host] = max(deadline, self.backoff.get(host, 0))


def require_public_site(url):
    u = sources.public_url(url)
    if any(u.hostname.removesuffix(".") == host or u.hostname.removesuffix(".").endswith("." + host)
           for host in EXCLUDED_HOSTS):
        raise sources.SourceError("Use the site's native search or alerts and import the employer's listing")
    return u


def label_error(exc):
    if isinstance(exc, TimeoutError):
        return "timed_out", "Source timed out"
    if isinstance(exc, Deferred):
        return "deferred", str(exc)
    if isinstance(exc, sources.SourceError):
        if exc.status == 402:
            return "deferred", "Firecrawl credits are unavailable"
        if exc.status in (401, 403, 451) or "robots.txt" in str(exc) or "native search" in str(exc):
            return "blocked", str(exc)
        return "failed", str(exc)
    return "failed", "Source could not be reached or its response could not be read"


class Fetch:
    def __init__(self, cancelled, deadline, *, allow_firecrawl=False, force_browser=False, cache=None):
        self.cancelled = cancelled
        self.deadline = deadline
        self.firecrawl_key = firecrawl_api_key() if allow_firecrawl else ""
        self.firecrawl_remaining = FIRECRAWL_LIMIT
        self.force_browser = force_browser
        self.cache = cache if cache is not None else ResponseCache()
        self.lock = threading.Lock()
        self.robots = {}
        self.browsers = threading.BoundedSemaphore(2)

    def ensure_active(self):
        if self.cancelled.is_set():
            raise Deferred("Search was stopped")
        return sources.remaining(self.deadline)

    def rules_for(self, url):
        u = require_public_site(url)
        key = u.hostname
        with self.lock:
            cached = self.robots.get(key)
        if self.cache.blocked_until(key):
            raise Deferred("Source asked to retry later")
        if cached is not None:
            return cached
        self.ensure_active()
        robot_url = urlunsplit(("https", u.netloc, "/robots.txt", "", ""))
        try:
            response = sources.request(
                robot_url, deadline=min(self.deadline, monotonic() + 3),
                allow_redirect=require_public_site,
            )
            rules = Protego.parse(sources.decode(
                response.body[:512 * 1024], response.headers.get_content_charset(),
            ))
        except sources.SourceError as exc:
            if exc.status in (404, 410):
                rules = Protego.parse("")
            else:
                if exc.status == 429:
                    self.cache.defer(key, exc.retry_after)
                if exc.status in (401, 403, 451):
                    raise sources.SourceError("Access to robots.txt was blocked", status=exc.status) from exc
                raise Deferred("Source robots.txt is unavailable") from exc
        except (OSError, http.client.HTTPException) as exc:
            raise Deferred("Source robots.txt is unavailable") from exc
        with self.lock:
            self.robots[key] = rules
        return rules

    def allows(self, url):
        if not self.rules_for(url).can_fetch(url, "EmploymentAgency"):
            raise sources.SourceError("Source robots.txt disallows automated access")

    def bytes(self, url, *, documented=False, source_deadline=None):
        u = require_public_site(url)
        self.ensure_active()
        if not documented:
            self.allows(url)
        deadline = min(source_deadline or self.deadline, self.deadline, monotonic() + REQUEST_SECONDS)
        redirect = require_public_site if documented else self.allows
        cached = self.cache.get(url)
        headers = {}
        if cached and monotonic() - cached[0] < 86400:
            saved = cached[1]
            if etag := saved.headers.get("ETag"):
                headers["If-None-Match"] = etag
            if modified := saved.headers.get("Last-Modified"):
                headers["If-Modified-Since"] = modified
        for attempt in range(2):
            blocked_until = self.cache.blocked_until(u.hostname)
            pause = max(0, blocked_until - monotonic())
            if pause > max(0, deadline - monotonic() - 0.75) or self.cancelled.wait(pause):
                raise Deferred("Source asked to retry later")
            try:
                response = sources.request(
                    url, deadline=deadline, headers=headers, allow_redirect=redirect,
                    accept_not_modified=bool(headers),
                )
                if response.status == 304 and cached:
                    response = cached[1]
                self.cache.remember(url, response)
                return response.body, response.url, response.headers
            except sources.SourceError as exc:
                if exc.status == 429:
                    self.cache.defer(u.hostname, exc.retry_after)
                    if attempt or exc.retry_after is None or exc.retry_after > deadline - monotonic() - 0.75:
                        raise Deferred("Source asked to retry later") from exc
                elif exc.status not in TRANSIENT or attempt or deadline - monotonic() <= 1:
                    raise
                elif exc.retry_after is not None:
                    self.cache.defer(u.hostname, exc.retry_after)
                    if exc.retry_after > deadline - monotonic() - 0.75:
                        raise Deferred("Source asked to retry later") from exc
                elif self.cancelled.wait(0.20):
                    raise Deferred("Search was stopped") from exc
            except (ConnectionError, http.client.RemoteDisconnected) as exc:
                if attempt or deadline - monotonic() <= 1 or self.cancelled.wait(0.20):
                    raise exc

    def feed(self, kind, board):
        deadline = min(self.deadline, monotonic() + SOURCE_BUDGET)

        def get_bytes(url):
            return self.bytes(url, documented=True, source_deadline=deadline)

        def get_text(url):
            body, final, headers = get_bytes(url)
            return sources.decode(body, headers.get_content_charset()), final

        return job_feeds.fetch_jobs(kind, board, get_text, get_bytes)

    def enrich(self, job):
        def get_text(url):
            body, final, headers = self.bytes(url, documented=True)
            return sources.decode(body, headers.get_content_charset()), final

        return job_feeds.enrich(job, get_text)

    def firecrawl(self, url):
        self.ensure_active()
        self.allows(url)
        source = sources.public_url(url)
        sources.public_addresses(source.hostname)
        # Query strings occasionally contain access or reset tokens.
        # The local HTTPS fetcher still accepts queries on public URLs.
        if source.query:
            raise sources.SourceError("Firecrawl fallback requires a public URL without a query string")
        if self.cache.blocked_until("api.firecrawl.dev"):
            raise Deferred("Firecrawl asked to retry later")
        with self.lock:
            if not self.firecrawl_key or not self.firecrawl_remaining:
                raise sources.SourceError("Firecrawl fallback is unavailable or its per-search limit was reached")
            self.firecrawl_remaining -= 1
        deadline = min(self.deadline, monotonic() + FIRECRAWL_SECONDS)
        timeout = int(sources.remaining(deadline) * 1000) - 500
        if timeout < 1000:
            raise TimeoutError("Firecrawl fallback timed out")
        body = json.dumps({
            "url": url, "formats": ["rawHtml", "markdown"], "timeout": timeout,
            "onlyMainContent": True, "maxAge": 0, "storeInCache": False, "proxy": "basic",
        }).encode()
        try:
            response = sources.request(
                FIRECRAWL_API + "/v2/scrape", deadline=deadline,
                data=body, headers={"Authorization": f"Bearer {self.firecrawl_key}", "Content-Type": "application/json"},
            )
        except sources.SourceError as exc:
            if exc.status == 429:
                self.cache.defer("api.firecrawl.dev", exc.retry_after)
            if exc.status in (401, 402, 403, 429):
                with self.lock:
                    self.firecrawl_remaining = 0
            raise
        result = json.loads(response.body)
        data = result.get("data") or {}
        metadata = data.get("metadata") or {}
        status = metadata.get("statusCode")
        if not result.get("success") or (isinstance(status, int) and status >= 400):
            raise sources.SourceError("Firecrawl could not retrieve this page", status=status)
        destination = public_pages.clean_url(metadata.get("url") or metadata.get("sourceURL") or url)
        if not public_pages.allowed_link(destination, url):
            raise sources.SourceError("Firecrawl returned a page outside the requested site")
        self.allows(destination)
        html = data.get("rawHtml")
        if html:
            page = public_pages.html_page(html, destination)
            if public_pages.challenge_page(page):
                raise sources.SourceError("Source requires a manual access check", status=403)
            return page
        markdown = data.get("markdown") or ""
        if not markdown.strip():
            raise sources.SourceError("Firecrawl did not return readable page content")
        return {"url": destination, "title": str(metadata.get("title") or "")[:300],
                "text": markdown[:public_pages.TEXT_LIMIT], "links": [], "jobs": []}

    def page(self, url, *, allow_firecrawl=False, vacancy=None):
        use_firecrawl = allow_firecrawl and bool(self.firecrawl_key)
        try:
            body, target, headers = self.bytes(url)
        except (TimeoutError, ConnectionError, http.client.RemoteDisconnected, sources.SourceError) as exc:
            if not use_firecrawl or (
                isinstance(exc, sources.SourceError) and exc.status not in (500, 502, 503, 504)
            ):
                raise
            # The provider independently rechecks access and the public address.
            # Preserve the direct failure if the provider also could not retrieve content.
            try:
                return "firecrawl", self.fallback_page(url)
            except FETCH_FAILURES as fallback_error:
                raise exc from fallback_error
        # A cross-site redirect may be legitimate, but its contents do not inherit
        # the original employer's identity.
        context = vacancy if vacancy and public_pages.same_site(target, url) else None
        page = public_pages.extract(body, target, headers, vacancy=context, pdf_timeout=min(5, self.ensure_active()))
        if public_pages.challenge_page(page):
            raise sources.SourceError("Source requires a manual access check", status=403)
        if page.get("format") == "pdf" or not (self.force_browser or public_pages.needs_browser(page)):
            return "http", page
        error = None
        if self.browsers.acquire(timeout=min(2, self.ensure_active())):
            try:
                def allows_navigation(target):
                    self.ensure_active()
                    if not public_pages.allowed_link(target, url):
                        return False
                    self.allows(target)
                    return True

                html, final = render_public_page.render(
                    target, min(self.deadline, monotonic() + 9), allow_navigation=allows_navigation,
                    cancelled=self.cancelled,
                )
                rendered = public_pages.html_page(html, final)
                if public_pages.challenge_page(rendered):
                    raise sources.SourceError("Source requires a manual access check", status=403)
                if not public_pages.needs_browser(rendered):
                    return "browser", rendered
            except FETCH_FAILURES as exc:
                if isinstance(exc, sources.SourceError) and exc.status in (401, 403, 451):
                    raise
                error = exc
            finally:
                self.browsers.release()
        if use_firecrawl:
            try:
                return "firecrawl", self.fallback_page(target)
            except FETCH_FAILURES as exc:
                error = exc
        _, message = label_error(error) if error else ("failed", "No additional content could be rendered")
        return "http", {**page, "note": message}

    def fallback_page(self, url):
        page = self.firecrawl(url)
        if public_pages.needs_browser(page):
            raise sources.SourceError("Firecrawl did not return the full page content")
        return page
