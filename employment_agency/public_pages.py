"""Extract evidence from public HTML, PDFs, text, and sitemaps."""

import ipaddress
import json
import os
import re
import subprocess
import sys
from html import escape
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin

from lxml import etree, html

from .job_feeds import selector_for, xml_root
from .public_pdf import PDF_BYTE_LIMIT, TEXT_LIMIT
from .sources import (
    SourceError, decode, hiring_employer, labelled_values, normalized, posting_date,
    public_address, public_url, structured_job, walk,
)


JOB_PATH = re.compile(
    r"/(?:careers?|jobs?|job[_-]details?|vacanc(?:y|ies)|positions?|opportunit(?:y|ies)|recruitment)(?:[/_.-]|$)",
    re.I,
)
JOB_ROOT = re.compile(r"/(?:careers?|jobs?|vacanc(?:y|ies)|positions?|recruitment)/?$", re.I)
NAVIGATION = frozenset(("careers", "jobs", "view all jobs", "find jobs", "join us", "apply", "apply now"))
GENERIC_LINK_LABELS = NAVIGATION | {"view", "view job", "read more", "more details", "ដាក់ពាក្យ"}
LINK_LIMIT = 40
PDF_VACANCY_PATH = re.compile(r"(?:\.pdf$|/viewfilevacancy/?$)", re.I)


def pdf_vacancy_url(url):
    return bool(PDF_VACANCY_PATH.search(unquote(public_url(url).path)))


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


def same_site(url, original):
    candidate = public_url(url).hostname.removeprefix("www.")
    origin = public_url(original).hostname.removeprefix("www.")
    return candidate == origin


def allowed_link(url, original):
    return same_site(url, original) or selector_for(url) is not None


def job_link(url, name):
    path = unquote(public_url(url).path)
    return (
        selector_for(url) is not None
        or JOB_PATH.search(path) is not None
        or pdf_vacancy_url(url)
        or re.search(r"(?:job|career|vacanc)[^/]*sitemap|sitemap[^/]*(?:job|career|vacanc)", path, re.I) is not None
        or name.casefold() in NAVIGATION - {"apply", "apply now"}
    )


def job_hint(url, title):
    path = unquote(public_url(url).path).rstrip("/")
    return bool(
        title and label(title).casefold() not in NAVIGATION
        and (pdf_vacancy_url(url) or JOB_PATH.search(path) and "/" in path[1:])
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


def vacancy_table(main, url, page_text):
    """Use a vacancy row to identify its linked PDF and preserve its published dates."""
    owners = re.findall(
        r"(?im)^Copyright\s*(?:©|\(c\))?\s*(?:20\d\d(?:[–-]20\d\d)?\s+)?([^|\n]+?)"
        r"\s*(?:\||[.,]?\s*All rights reserved\b|$)", page_text,
    )
    # A footer can name a board publisher. Require the employer to be named
    # elsewhere on the page before treating it as the operator of this index.
    owner = owners[0].strip() if len(owners) == 1 else ""
    if owner and owner.casefold() not in page_text.casefold().split("copyright", 1)[0]:
        owner = ""
    head_office = re.search(
        r"\bhead office is (?:located )?(?:at|in)\b[^\n]{0,180}\b(Phnom Penh)\b",
        page_text, flags=re.I,
    )
    listings = {}
    for table in main.xpath(".//table[thead]")[:8]:
        headers = [label(cell.text_content()).casefold() for cell in table.xpath("./thead/tr[1]/th")]
        if "job title" not in headers or not {"location", "opening date", "closing date"}.intersection(headers):
            continue
        for row in table.xpath("./tbody/tr")[:LINK_LIMIT]:
            cells = row.xpath("./td")
            if len(cells) != len(headers):
                continue
            values = dict(zip(headers, cells))
            link = next(iter(values["job title"].xpath(".//a[@href]")), None)
            if link is None:
                continue
            try:
                target = safe_link(link.get("href"), url)
            except ValueError:
                continue
            if not pdf_vacancy_url(target) or not same_site(target, url):
                continue
            fields = {key: label(cell.text_content()) for key, cell in values.items()}
            title = label(link.text_content())[:300]
            if not title:
                continue
            explicit_employer = fields.get("hiring employer") or fields.get("employer") or fields.get("company")
            employer = hiring_employer(title, explicit_employer or owner, "")
            location = fields.get("location", "")
            if head_office and location.casefold() == "head office":
                location += ", " + head_office[1]
            listings[target] = {
                "title": title, "employer": employer, "location": location, "careers_url": url,
                "posted_at": posting_date(fields.get("opening date")),
                "closes": posting_date(fields.get("closing date")),
            }
    return listings


def html_page(body, url, charset=None):
    tree = html.fromstring(body, parser=html.HTMLParser(encoding=charset, no_network=True))
    snippets = tree.xpath('//script[starts-with(@type, "application/ld+json")]/text()')
    postings = []
    for snippet in snippets[:50]:
        try:
            postings.extend(walk(json.loads(snippet)))
        except (ValueError, RecursionError):
            continue
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
        previous = links.get(destination)
        if previous and previous["title"] and (not name or name.casefold() in GENERIC_LINK_LABELS):
            continue
        if destination != url and (name or job_link(destination, name)):
            links[destination] = {"url": destination, "title": name}
    listings = {}
    if main.xpath(".//table[thead]"):
        raw_text = tree.text_content()
        excerpt = raw_text if len(raw_text) < TEXT_LIMIT * 2 else raw_text[:TEXT_LIMIT] + "\n" + raw_text[-TEXT_LIMIT:]
        page_text = "\n".join(part for line in excerpt.splitlines() if (part := label(line)))
        listings = vacancy_table(main, url, page_text)
    for element in main.xpath(".//nav|.//footer"):
        if element.getparent() is not None:
            element.drop_tree()
    for node in main.xpath(".//p|.//li|.//h1|.//h2|.//h3|.//br|.//dt|.//dd"):
        node.tail = "\n" + (node.tail or "")
    main_text = "\n".join(part for line in main.text_content().splitlines() if (part := label(line)))
    jobs, leads = {}, []
    for posting in postings[:40]:
        target = listing_url(posting, url, len(postings) > 1)
        if not target:
            continue
        job = structured_job(posting, target, advert=main_text[:TEXT_LIMIT] if len(postings) == 1 else "")
        if job["title"] and job["employer"] and job["description"]:
            jobs[target] = job
        elif job["title"] and job["description"]:
            leads.append(job)
    ordered = sorted(links.values(), key=lambda link: (link["url"] not in listings,
                                                      not job_link(link["url"], link["title"])))
    result = {"url": url, "title": page_title, "text": main_text[:TEXT_LIMIT],
              "links": ordered[:LINK_LIMIT], "jobs": list(jobs.values())}
    if listings:
        result["vacancies"] = listings
    if leads:
        result["leads"] = leads
        result["note"] = "Some listings need review to confirm the hiring employer"
    return result


def read_pdf(body, timeout):
    if len(body) > PDF_BYTE_LIMIT:
        raise SourceError("Job description PDF exceeds 4 MiB")
    try:
        result = subprocess.run(
            [sys.executable, "-I", str(Path(__file__).with_name("public_pdf.py"))],
            input=body, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=timeout, env={key: os.environ[key] for key in ("SYSTEMROOT",) if key in os.environ},
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Job description PDF extraction timed out") from exc
    if result.returncode != 0:
        raise SourceError("Job description PDF could not be read")
    text, note = json.loads(result.stdout)
    return text, note


def pdf_requirements(text):
    match = re.search(
        r"(?im)^(?:job |key |minimum |qualification[s]? )?(?:requirements?|qualifications?)(?: requirements)?\s*:?\s*$",
        text,
    )
    if not match:
        return []
    section = re.split(r"(?im)^(?:how to apply|application procedure|contact(?: info| us)?|benefits|email)\b",
                       text[match.end():], maxsplit=1)[0]
    requirements = re.findall(r"(?m)^[•●▪♦–\-]\s+([^\n]+(?:\n(?![•●▪♦–\-]\s)[^\n]+)*)", section)
    return [label(item)[:450] for item in requirements[:60]]


def pdf_page(body, url, vacancy, timeout):
    text, note = read_pdf(body, timeout)
    details = vacancy or {}
    titles = labelled_values(text, ("Job Title", "Role Title", "Job Titile", "Position Title", "Position"))
    title = details.get("title") or (titles[0] if len(titles) == 1 else "")
    employer = hiring_employer(title, details.get("employer", ""), text)
    locations = labelled_values(text, ("Job Location", "Role Location", "Location"))
    location = details.get("location") or (locations[0] if len(locations) == 1 else "")
    result = {"url": url, "title": title, "text": text, "links": [], "jobs": [], "format": "pdf"}
    if note:
        result["note"] = note
    if not (title and employer and text):
        result.setdefault("note", "PDF needs review to confirm the vacancy title or hiring employer")
        if title:
            result["leads"] = [{"url": url, "title": title, "employer": employer, "location": location}]
        return result
    dates = labelled_values(text, ("Closing Date", "Application Deadline", "Deadline"))
    fields = {
        "posted_at": details.get("posted_at") or posting_date(next(iter(labelled_values(text, ("Posted Date", "Opening Date"))), "")),
        "closes": details.get("closes") or posting_date(next(iter(dates), "")),
        "requirements": pdf_requirements(text),
        "employer_evidence": {"name": employer, "url": url, "source": "published-hiring-employer"},
    }
    if details.get("careers_url"):
        fields["careers_url"] = details["careers_url"]
    result["jobs"] = [normalized(title, employer, location, escape(text), url, "Job description PDF", **fields)]
    return result


def extract(body, url, headers, *, vacancy=None, pdf_timeout=5):
    content_type = headers.get_content_type()
    if not body.strip():
        raise SourceError("Source returned an empty page")
    signature = body[:1024].lstrip()
    if signature.startswith(b"%PDF-") or content_type == "application/pdf":
        return pdf_page(body, url, vacancy, pdf_timeout)
    if content_type in ("text/html", "application/xhtml+xml") or signature.lower().startswith((b"<!doctype html", b"<html")):
        return html_page(body, url, headers.get_content_charset())
    if content_type.endswith("xml") or public_url(url).path.endswith(".xml"):
        return sitemap_page(body, url)
    if content_type == "text/plain":
        return {"url": url, "title": "", "text": decode(body, headers.get_content_charset())[:TEXT_LIMIT],
                "links": [], "jobs": []}
    raise SourceError("Source did not return a supported public page")


def needs_browser(page):
    if page["jobs"] or page["title"] == "Sitemap" or page.get("format") == "pdf":
        return False
    path = public_url(page["url"]).path
    if JOB_PATH.search(path) and not JOB_ROOT.search(path) and len(page["text"]) < 480:
        return True
    return len(page["text"]) < 120 and not any(
        job_link(link["url"], link["title"]) for link in page["links"]
    )
