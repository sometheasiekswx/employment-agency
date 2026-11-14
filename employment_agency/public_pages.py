"""Extract evidence from public HTML, text, and sitemaps."""

import ipaddress
import json
import re
from urllib.parse import unquote, urldefrag, urljoin

from lxml import etree, html

from .job_feeds import selector_for, xml_root
from .sources import SourceError, decode, public_address, public_url, structured_job, walk


JOB_PATH = re.compile(
    r"/(?:careers?|jobs?|job[_-]details?|vacanc(?:y|ies)|positions?|opportunit(?:y|ies)|recruitment)(?:[/_.-]|$)",
    re.I,
)
JOB_ROOT = re.compile(r"/(?:careers?|jobs?|vacanc(?:y|ies)|positions?|recruitment)/?$", re.I)
NAVIGATION = frozenset(("careers", "jobs", "view all jobs", "find jobs", "join us", "apply", "apply now"))
TEXT_LIMIT = 12_000
LINK_LIMIT = 40


def clean_url(value, base=""):
    url = urldefrag(urljoin(base, value)).url
    parsed = public_url(url)
    return parsed._replace(netloc=parsed.netloc.lower(), path=parsed.path or "/").geturl()


def safe_link(value, base=""):
    url = clean_url(value, base)
    host = public_url(url).hostname
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if ((address is not None and not public_address(address))
            or (address is None and ("." not in host or host.endswith((".local", ".localhost", ".internal"))))):
        raise SourceError("Local page links are unsupported")
    return url


def label(text):
    return " ".join(text.split())


def allowed_link(url, original):
    candidate = public_url(url).hostname.removeprefix("www.")
    origin = public_url(original).hostname.removeprefix("www.")
    return candidate == origin or selector_for(url) is not None


def job_link(url, name):
    path = unquote(public_url(url).path)
    return (
        selector_for(url) is not None
        or JOB_PATH.search(path) is not None
        or re.search(r"(?:job|career|vacanc)[^/]*sitemap|sitemap[^/]*(?:job|career|vacanc)", path, re.I) is not None
        or name.casefold() in NAVIGATION - {"apply", "apply now"}
    )


def job_hint(url, title):
    path = unquote(public_url(url).path).rstrip("/")
    return bool(
        title and label(title).casefold() not in NAVIGATION
        and JOB_PATH.search(path) and "/" in path[1:]
    )


def challenge_page(page):
    text = page["text"][:1500].casefold()
    title = page["title"].casefold()
    return not page["jobs"] and (
        title in ("just a moment...", "access denied", "request blocked", "attention required!")
        or "verify that you are human" in text or "checking if the site connection is secure" in text
        or "enable javascript and cookies to continue" in text or "confirm you are human" in text
    )


def sitemap_page(body, url):
    root = xml_root(body)
    tag = etree.QName(root).localname
    if tag not in ("urlset", "sitemapindex"):
        raise SourceError("Unsupported XML document. Supply a public HTML page or a recognised job feed.")
    links = []
    for value in root.xpath('./*/*[local-name()="loc"]/text()'):
        try:
            destination = safe_link(value.strip(), url)
            if allowed_link(destination, url) and job_link(destination, ""):
                links.append({"url": destination, "title": ""})
                if len(links) == LINK_LIMIT:
                    break
        except (TypeError, ValueError):
            continue
    return {"url": url, "title": "Sitemap", "text": "", "links": links, "jobs": []}


def first_text(tree, xpath):
    return next(iter(tree.xpath(xpath)), "")


def listing_url(posting, url, multiple):
    candidate = posting.get("url")
    if isinstance(candidate, str):
        try:
            target = safe_link(candidate, url)
            if allowed_link(target, url):
                return target
        except ValueError:
            pass
    return None if multiple else url


def html_page(body, url, charset=None):
    tree = html.fromstring(body, parser=html.HTMLParser(encoding=charset, no_network=True))
    snippets = tree.xpath('//script[starts-with(@type, "application/ld+json")]/text()')
    postings = []
    for snippet in snippets[:50]:
        try:
            postings.extend(walk(json.loads(snippet)))
        except (ValueError, RecursionError):
            continue
    jobs = {}
    for posting in postings[:40]:
        target = listing_url(posting, url, len(postings) > 1)
        if not target:
            continue
        job = structured_job(posting, target)
        if job["title"] and job["employer"] and job["description"]:
            jobs[target] = job

    page_title = label(first_text(tree, "//title/text()") or first_text(tree, "//h1/text()"))[:300]
    for element in tree.xpath("//script|//style|//noscript|//template|//svg|//*[@hidden]"):
        if element.getparent() is not None:
            element.drop_tree()
    candidates = tree.xpath('//main|//*[@role="main"]|//article|//body')
    main = next((el for el in candidates if el.tag == "main" or el.get("role") == "main"),
                next((el for el in candidates if el.tag == "body"), candidates[0] if candidates else tree))
    links = {}
    for anchor in tree.xpath("//a[@href]|//iframe[@src]")[:1200]:
        if len(links) >= LINK_LIMIT * 4:
            break
        try:
            destination = safe_link(anchor.get("href") or anchor.get("src") or "", url)
        except ValueError:
            continue
        name = label(anchor.get("aria-label") or anchor.get("title") or anchor.text_content())[:180]
        if destination != url and (name or job_link(destination, name)):
            links[destination] = {"url": destination, "title": name}
    for element in main.xpath(".//nav|.//footer"):
        if element.getparent() is not None:
            element.drop_tree()
    for node in main.xpath(".//p|.//li|.//h1|.//h2|.//h3|.//br"):
        node.tail = "\n" + (node.tail or "")
    main_text = "\n".join(part for line in main.text_content().splitlines() if (part := label(line)))
    ordered = sorted(links.values(), key=lambda link: not job_link(link["url"], link["title"]))
    return {"url": url, "title": page_title, "text": main_text[:TEXT_LIMIT],
            "links": ordered[:LINK_LIMIT], "jobs": list(jobs.values())}


def extract(body, url, headers):
    content_type = headers.get_content_type()
    if not body.strip():
        raise SourceError("Source returned an empty page")
    normalized = body.lstrip()[:128].lower()
    if content_type in ("text/html", "application/xhtml+xml") or normalized.startswith((b"<!doctype html", b"<html")):
        return html_page(body, url, headers.get_content_charset())
    if content_type.endswith("xml") or public_url(url).path.endswith(".xml"):
        return sitemap_page(body, url)
    if content_type == "text/plain":
        return {"url": url, "title": "", "text": decode(body, headers.get_content_charset())[:TEXT_LIMIT],
                "links": [], "jobs": []}
    raise SourceError("Source did not return a supported public page")


def needs_browser(page):
    if page["jobs"] or page["title"] == "Sitemap":
        return False
    path = public_url(page["url"]).path
    if JOB_PATH.search(path) and not JOB_ROOT.search(path) and len(page["text"]) < 480:
        return True
    return len(page["text"]) < 120 and not any(
        job_link(link["url"], link["title"]) for link in page["links"]
    )
