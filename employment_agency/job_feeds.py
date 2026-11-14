"""Documented employer boards and public job feeds."""

import json
import re
from datetime import timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, quote

from lxml import etree

from .imports import plain
from .sources import SourceError, discover, normalized, public_url


EMPLOYER_BOARDS = frozenset(("greenhouse", "lever", "smartrecruiters", "ashby", "workable"))
RSS_PATHS = {
    "all": "/remote-jobs.rss",
    "programming": "/categories/remote-programming-jobs.rss",
    "full-stack": "/categories/remote-full-stack-programming-jobs.rss",
    "devops": "/categories/remote-devops-sysadmin-jobs.rss",
}
REMOTIVE_CATEGORIES = frozenset(("all", "software-dev", "devops", "product", "data", "qa"))


def validate_selector(kind, board):
    if not isinstance(kind, str) or not isinstance(board, str):
        raise ValueError("Choose a supported job feed")
    if kind in EMPLOYER_BOARDS and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", board):
        return
    if ((kind == "weworkremotely" and board in RSS_PATHS)
            or (kind == "remotive" and board in REMOTIVE_CATEGORIES)):
        return
    raise ValueError("Choose a supported feed and enter its board identifier or category")


def selector_for(url):
    u = public_url(url)
    host = u.hostname
    parts = u.path.strip("/").split("/")
    board = parts[0]
    if host in ("boards.greenhouse.io", "job-boards.greenhouse.io") and len(parts) == 1:
        kind = "greenhouse"
    elif host == "boards-api.greenhouse.io" and len(parts) == 4 and parts[:2] == ["v1", "boards"]:
        kind, board = "greenhouse", parts[2]
    elif host == "jobs.lever.co" and len(parts) == 1:
        kind = "lever"
    elif host == "api.lever.co" and len(parts) == 3 and parts[:2] == ["v0", "postings"]:
        kind, board = "lever", parts[2]
    elif host == "jobs.ashbyhq.com" and len(parts) == 1:
        kind = "ashby"
    elif host == "api.ashbyhq.com" and len(parts) == 3 and parts[:2] == ["posting-api", "job-board"]:
        kind, board = "ashby", parts[2]
    elif host in ("careers.smartrecruiters.com", "jobs.smartrecruiters.com") and len(parts) == 1:
        kind = "smartrecruiters"
    elif host == "api.smartrecruiters.com" and len(parts) == 4 and parts[:2] == ["v1", "companies"]:
        kind, board = "smartrecruiters", parts[2]
    elif host in ("apply.workable.com", "jobs.workable.com") and len(parts) == 1:
        kind = "workable"
    elif host in ("www.workable.com", "workable.com") and len(parts) == 3 and parts[:2] == ["api", "accounts"]:
        kind, board = "workable", parts[2]
    elif host in ("weworkremotely.com", "www.weworkremotely.com") and u.path in RSS_PATHS.values():
        kind, board = "weworkremotely", next(key for key, path in RSS_PATHS.items() if path == u.path)
    elif host in ("remotive.com", "www.remotive.com") and u.path == "/api/remote-jobs":
        kind, board = "remotive", parse_qs(u.query).get("category", ["all"])[0]
    else:
        return None
    try:
        validate_selector(kind, board)
    except ValueError:
        return None
    return kind, board


def listing(kind, board, posting, title, employer, location, description, url, **extra):
    public_url(url)
    return normalized(
        title or "", employer or "", location or "", description or "", url, f"{kind}:{board}",
        source_requisition=f"{kind}:{board}:{posting}" if posting else "", **extra,
    )


def json_at(fetch, url):
    return json.loads(fetch(url)[0])


def locations(values):
    return " / ".join(dict.fromkeys(part for part in values if isinstance(part, str) and part))


def ashby(board, fetch):
    data = json_at(fetch, f"https://api.ashbyhq.com/posting-api/job-board/{board}")
    if not isinstance(data["jobs"], list):
        raise SourceError("Ashby did not return a complete job board")
    for item in data["jobs"]:
        if item.get("isListed") is False:
            continue
        yield listing(
            "ashby", board, item.get("id"), item["title"], board,
            locations([item.get("location"), *(p.get("location") for p in item.get("secondaryLocations", []))]),
            item.get("descriptionHtml") or item.get("descriptionPlain"), item["jobUrl"],
            posted_at=item.get("publishedAt") or "",
            work_arrangement=item.get("workplaceType") or ("remote" if item.get("isRemote") else ""),
        )


def workable(board, fetch):
    data = json_at(fetch, f"https://www.workable.com/api/accounts/{board}?details=true")
    if not isinstance(data["jobs"], list):
        raise SourceError("Workable did not return a complete job board")
    for item in data["jobs"]:
        location = item.get("location") or {}
        if isinstance(location, dict):
            location = ", ".join(filter(None, (location.get("city"), location.get("region"), location.get("country"))))
        yield listing(
            "workable", board, item.get("shortcode") or item.get("id"), item["title"],
            item.get("company") or data.get("name") or board, location,
            item.get("description"), item.get("url") or item["application_url"],
            posted_at=item.get("published_on") or item.get("created_at") or "",
            work_arrangement=item.get("workplace") or ("remote" if item.get("telecommuting") else ""),
        )


def smartrecruiters(board, fetch):
    endpoint = f"https://api.smartrecruiters.com/v1/companies/{board}/postings"
    seen = set()
    total = None
    for offset in range(0, 1500, 100):
        data = json_at(fetch, f"{endpoint}?offset={offset}&limit=100")
        if (not isinstance(data["content"], list) or type(data["totalFound"]) is not int
                or data["totalFound"] < 0 or data.get("offset", offset) != offset):
            raise SourceError("SmartRecruiters did not return an expected board page")
        if total is not None and data["totalFound"] != total:
            raise SourceError("The SmartRecruiters board changed during pagination")
        total = data["totalFound"]
        for item in data["content"]:
            key = item["id"]
            if key in seen:
                raise SourceError("The SmartRecruiters board returned overlapping pages")
            seen.add(key)
            location = item.get("location") or {}
            url = f"https://jobs.smartrecruiters.com/{board}/{quote(str(key), safe='')}"
            yield listing(
                "smartrecruiters", board, item.get("uuid") or key, item["name"],
                (item.get("company") or {}).get("name") or board,
                location.get("fullLocation") or ", ".join(filter(None, (location.get("city"), location.get("country")))),
                "", url, posted_at=item.get("releasedDate") or "",
                work_arrangement="remote" if location.get("remote") else "hybrid" if location.get("hybrid") else "",
                vacancy_requisition=item.get("refNumber") or "",
                detail_url=f"{endpoint}/{quote(str(key), safe='')}",
            )
        if len(seen) == total:
            return
        if len(data["content"]) != 100:
            break
    raise SourceError("The SmartRecruiters board returned an incomplete job list")


def enrich(job, fetch):
    if not job.get("detail_url"):
        return job
    data = json_at(fetch, job["detail_url"])
    if data.get("active") is not True:
        raise SourceError("The employer feed does not show an active advert")
    identifier = data.get("uuid") or data.get("id")
    if not identifier or job["source_requisition"].rsplit(":", 1)[-1] != str(identifier):
        raise SourceError("The employer returned a different posting")
    sections = data["jobAd"]["sections"]
    description = "\n\n".join(
        part.get("text") or "" for part in sections.values() if isinstance(part, dict)
    )
    result = {**job, "description": plain(description)[:40000]}
    if data.get("jobId"):
        result["vacancy_requisition"] = result.get("vacancy_requisition") or str(data["jobId"])
    return result


def xml_root(data):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=False)
    root = etree.fromstring(data, parser=parser)
    if root.getroottree().docinfo.doctype:
        raise SourceError("XML declarations with entities are unsupported")
    return root


def date(value):
    if not value:
        return ""
    try:
        parsed = parsedate_to_datetime(value)
        return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).isoformat()
    except (TypeError, ValueError, OverflowError):
        return value[:100]


def rss_jobs(data):
    root = xml_root(data)
    if root.tag != "rss" or root.find("channel") is None:
        raise SourceError("Source did not return an RSS job feed")
    for entry in root.findall("./channel/item"):
        label = entry.findtext("title") or ""
        employer, separator, title = label.partition(": ")
        if not separator:
            employer, title = "", label
        url = entry.findtext("link") or ""
        if public_url(url).hostname not in ("weworkremotely.com", "www.weworkremotely.com"):
            raise SourceError("We Work Remotely returned an unexpected listing URL")
        yield listing(
            "weworkremotely", "all", entry.findtext("guid") or url, title, employer,
            "Remote — " + entry.findtext("region", "Location unspecified"),
            entry.findtext("description"), url, posted_at=date(entry.findtext("pubDate")),
            closes=entry.findtext("expires_at", ""), work_arrangement="remote",
        )


def remotive(board, fetch):
    query = "" if board == "all" else f"?category={board}"
    payload = json_at(fetch, "https://remotive.com/api/remote-jobs" + query)
    if not isinstance(payload["jobs"], list):
        raise SourceError("Remotive did not return a job list")
    for item in payload["jobs"]:
        url = item["url"]
        if public_url(url).hostname not in ("remotive.com", "www.remotive.com"):
            raise SourceError("Remotive returned an unexpected listing URL")
        yield listing(
            "remotive", "all", item["id"], item["title"], item["company_name"],
            "Remote — " + (item.get("candidate_required_location") or "Location unspecified"),
            item.get("description"), url, posted_at=item.get("publication_date") or "",
            work_arrangement="remote",
        )


def fetch_jobs(kind, board, fetch, fetch_bytes):
    validate_selector(kind, board)
    if kind in ("greenhouse", "lever"):
        return discover(kind, board, fetch=fetch)
    if kind == "weworkremotely":
        data, _, _ = fetch_bytes("https://weworkremotely.com" + RSS_PATHS[board])
        return list(rss_jobs(data))
    adapter = {"smartrecruiters": smartrecruiters, "ashby": ashby, "workable": workable, "remotive": remotive}[kind]
    return list(adapter(board, fetch))
