"""Isolated browser rendering for the local discovery workflow."""

import http.client
import os
from pathlib import Path
from time import monotonic
from urllib.parse import urljoin

from .sources import MAX_BYTES, REDIRECTS, SourceError, public_url, remaining, request


DISABLE_BACKGROUND_NETWORK = [
    "--disable-background-networking", "--disable-quic", "--disable-extensions",
    "--disable-sync", "--no-pings",
]


def render(url, deadline, *, allow_navigation, cancelled):
    try:
        from playwright.sync_api import Error, TimeoutError as BrowserTimeout, sync_playwright
    except ImportError as exc:
        raise SourceError("Install the optional Playwright discovery support to render this page") from exc

    allowed_document = public_url(url).hostname.removeprefix("www.")
    navigation_failure = []
    requests_started = 0
    requested_bytes = 0

    def navigate(route):
        nonlocal requests_started, requested_bytes
        incoming = route.request
        target = incoming.url
        document = incoming.is_navigation_request()
        try:
            u = public_url(target)
            if (
                cancelled.is_set() or incoming.method != "GET" or remaining(deadline) < 0.2
                or incoming.resource_type in ("image", "font", "media")
                or requests_started >= 40 or requested_bytes >= MAX_BYTES
            ):
                route.abort()
                return
            if document and (
                u.hostname.removeprefix("www.") != allowed_document or not allow_navigation(target)
            ):
                raise SourceError("Rendered page redirected outside the allowed source")
            requests_started += 1
            upstream_deadline = min(deadline, monotonic() + 3)
            response = request(target, deadline=upstream_deadline, stop_at_redirect=True)
            requested_bytes += len(response.body)
            if requested_bytes > MAX_BYTES:
                raise SourceError("Rendered page exceeded its download limit")
            # The isolated browser receives bytes through the pinned fetcher.
            # Redirects require their own browser request before using the final origin.
            if response.status in REDIRECTS:
                destination = urljoin(target, response.headers["Location"])
                public_url(destination)
                if document and not allow_navigation(destination):
                    raise SourceError("Rendered page redirected outside the allowed source")
                route.fulfill(status=response.status, headers={"location": destination}, body=b"")
                return
            forward = {"content-type", "content-security-policy", "access-control-allow-origin",
                       "access-control-allow-credentials", "x-content-type-options"}
            route.fulfill(
                status=response.status, body=response.body,
                headers={key.lower(): value for key, value in response.headers.items() if key.lower() in forward},
            )
        except (ValueError, OSError, http.client.HTTPException) as exc:
            if document:
                navigation_failure.append(exc)
            route.abort()

    try:
        # Block even browser traffic that request routing does not expose.
        # Only the pinned Python fetcher opens network connections.
        with sync_playwright() as engine:
            channel = None if Path(engine.chromium.executable_path).is_file() else "chrome"
            browser = engine.chromium.launch(
                headless=True, channel=channel, timeout=max(1, int(remaining(deadline) * 1000)),
                chromium_sandbox=True,
                args=DISABLE_BACKGROUND_NETWORK + ["--proxy-bypass-list=<-loopback>"],
                proxy={"server": "http://127.0.0.1:1"},
                env={key: value for key, value in os.environ.items()
                     if key in ("HOME", "PATH", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR",
                                "USERPROFILE", "LOCALAPPDATA", "APPDATA", "LANG")},
            )
            try:
                context = browser.new_context(service_workers="block", accept_downloads=False)
                context.route("**/*", navigate)
                if hasattr(context, "route_web_socket"):
                    context.route_web_socket("**/*", lambda ws: ws.close())
                page = context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=max(1, int(remaining(deadline) * 1000)))
                try:
                    page.wait_for_load_state(
                        "networkidle", timeout=max(1, min(1800, int(remaining(deadline) * 1000))),
                    )
                except BrowserTimeout:
                    pass
                if not allow_navigation(page.url):
                    raise SourceError("Rendered page redirected outside the allowed source")
                result = page.content()
                if len(result) > MAX_BYTES:
                    raise SourceError("Rendered page exceeds the extraction limit")
                return result, page.url
            finally:
                browser.close()
    except BrowserTimeout as exc:
        raise TimeoutError("Local browser timed out") from exc
    except Error as exc:
        if navigation_failure:
            raise navigation_failure[0] from exc
        raise SourceError("Local browser could not render this page") from exc
