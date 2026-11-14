"""Opt-in public-site verification using a disposable SQLite workspace.

Run from the shared checkout with its normal test interpreter and the
Playwright discovery extra installed. No provider key or private workspace is used.
"""

from datetime import datetime
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from employment_agency.service import Service
from employment_agency.store import Workspace


# Verify extracted source facts and visible text, rather than a successful HTTP status alone.
# Feed expectations are deliberately stable because individual postings change.
CASES = (
    ("Greenhouse board", "https://boards-api.greenhouse.io/v1/boards/mongodb/jobs", "feed", "greenhouse:mongodb"),
    ("Lever board", "https://jobs.lever.co/truezerotech", "feed", "lever:truezerotech"),
    ("SmartRecruiters board", "https://careers.smartrecruiters.com/MangoByteTechnologyCoLtd", "feed", "smartrecruiters:MangoByteTechnologyCoLtd"),
    ("Ashby board", "https://jobs.ashbyhq.com/linear", "feed", "ashby:linear"),
    ("Workable board", "https://apply.workable.com/hustler-marketing/", "feed", "workable:hustler-marketing"),
    ("We Work Remotely RSS", "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss", "feed", "weworkremotely:all"),
    ("Remotive API", "https://remotive.com/api/remote-jobs?category=software-dev", "feed", "remotive:all"),
    ("JobNet search", "https://www.jobnet.com.kh/job", "page", "Jobs in Cambodia"),
    ("JobNet landing", "https://www.jobnet.com.kh/", "page", "Jobs in Cambodia"),
    ("Jobify vacancy", "https://jobify.works/jobs/1289", "page", "Business Analyst"),
    ("Jobify start page", "https://jobify.works/", "page", "Jobify"),
    ("CamHR landing", "https://www.camhr.com/", "page", "Job"),
    ("CamHR vacancy", "https://www.camhr.com/a/job/10642470", "page", "Job Description"),
    ("BongThom Phnom Penh", "https://www.bongthom.com/job_location-12.html", "page", "Phnom Penh"),
    ("Canadia Bank careers", "https://www.canadiabank.com.kh/careers", "page", "open positions"),
    ("Canadia Bank vacancy", "https://www.canadiabank.com.kh/careers/career-23", "page", "Customer Service Officer"),
    ("Vattanac Bank careers", "https://careers.vattanacbank.com/", "page", "Vacancies"),
    ("HubKore careers", "https://www.hubkore.com/careers", "page", "Full-Stack"),
    ("HubKore structured vacancy", "https://www.hubkore.com/careers/senior-fullstack-ai-agent-engineer", "job", "Senior Full-Stack & AI Agent Engineer"),
    ("Allweb careers", "https://www.allweb.com.kh/career", "access", ""),
    ("HTML reference page", "https://docs.python.org/3/library/html.parser.html", "page", "HTMLParser"),
    ("HTTP specification", "https://www.rfc-editor.org/rfc/rfc9110.html", "page", "HTTP Semantics"),
    ("Public domain registry", "https://www.iana.org/domains/reserved", "page", "Reserved Domains"),
    ("GNU licence page", "https://www.gnu.org/licenses/gpl-3.0.en.html", "page", "GNU General Public License"),
    ("W3C Recommendation", "https://www.w3.org/TR/2023/REC-wot-architecture11-20231205/", "page", "Web of Things"),
    ("Mozilla about page", "https://www.mozilla.org/en-US/about/", "page", "Mozilla"),
    ("Wikipedia article", "https://en.wikipedia.org/wiki/Phnom_Penh", "page", "Phnom Penh"),
    ("Plain static website", "https://example.com/", "page", "Example Domain"),
    ("Static book catalogue", "https://books.toscrape.com/", "page", "Books to Scrape"),
    ("Static book detail", "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html", "page", "A Light in the Attic"),
    ("JavaScript quotes", "https://quotes.toscrape.com/js/", "browser", "Albert Einstein"),
    ("JavaScript quotes AJAX", "https://quotes.toscrape.com/scroll", "browser", "Albert Einstein"),
    ("Plain response example", "https://httpbingo.org/html", "page", "Herman Melville"),
    ("Native-only search", "https://www.linkedin.com/jobs/", "access", ""),
    ("Wing Bank careers", "https://www.wingbank.com.kh/en/careers", "page", "Job Close"),
    ("Wing Bank vacancy", "https://www.wingbank.com.kh/en/careers/senior-specialist-treasury-operation", "page", "Senior Specialist, Treasury Operation"),
)


def verify(service, cases):
    service.action("discovery-start", {"urls": [row[1] for row in cases]})
    result = service.discovery.wait()
    jobs = service.w.read()["jobs"]
    pages = {page["url"]: page for page in result["pages"]}
    outcomes = result["sources"][:len(cases)]
    rows = []
    for (label, url, kind, needle), outcome in zip(cases, outcomes):
        status = outcome["status"]
        note = outcome.get("note", "")
        method = outcome.get("method", "")
        page = pages.get(outcome.get("final_url", url))
        if kind == "feed":
            related = [job for job in jobs if job["source"] == needle and job.get("source_requisition")]
            passed = status in ("retrieved", "partial") and bool(related) and all(
                all(job.get(key) for key in ("employer", "title", "url", "description"))
                for job in related
            )
            evidence = f"{len(related)} postings with title, employer, original link and source ID" if passed else note
        elif kind == "job":
            related = [job for job in jobs if job["url"] == url and needle in job["title"]]
            passed = status == "retrieved" and bool(related) and all(
                job["employer"] and job["description"] and job["location"] for job in related
            )
            evidence = f"{len(related)} exact title/URL match with employer, location and description"
        elif kind == "access":
            passed = status == "blocked"
            evidence = note
        else:
            passed = bool(page and needle.casefold() in (page["title"] + page["text"]).casefold())
            if kind == "browser":
                passed = passed and method == "browser"
            evidence = f"Matched {needle!r}" if passed else note or "Expected content unavailable"
        rows.append((label, url, status, method, bool(passed), evidence))
    if len(rows) != len(cases) or result["elapsed_seconds"] > 92:
        raise RuntimeError("Search missed its verification deadline")
    return rows, result["elapsed_seconds"]


def main():
    rows, durations = [], []
    with tempfile.TemporaryDirectory(prefix="agency-live-discovery-") as temp:
        workspace = Workspace(Path(temp) / "workspace", sqlite=True)
        service = Service(workspace)
        try:
            for offset in range(0, len(CASES), 9):
                batch, seconds = verify(service, CASES[offset:offset + 9])
                rows.extend(batch)
                durations.append(seconds)
                print(f"Checked {len(rows)} of {len(CASES)} sources", file=sys.stderr, flush=True)
        finally:
            if service.discovery:
                service.discovery.close()
            workspace.close()
    print(f"# Live discovery check — {datetime.now(ZoneInfo('Australia/Melbourne')).date().isoformat()} Melbourne")
    print()
    print("| Check | Outcome | Method | Evidence |")
    print("| --- | --- | --- | --- |")
    for label, url, status, method, passed, evidence in rows:
        print(f"| [{label}]({url}) | {status} | {method or '—'} | {('Verified: ' if passed else '') + evidence} |")
    print()
    sites = {urlsplit(row[1]).hostname.removeprefix("www.") for row in rows}
    content = sum(row[4] and row[2] != "blocked" for row in rows)
    restrictions = sum(row[4] and row[2] == "blocked" for row in rows)
    print(f"Checked {len(rows)} URLs across {len(sites)} sites. "
          f"Verified content from {content} URLs and expected access restrictions on {restrictions}. "
          f"Batch wall times in seconds: {', '.join(map(str, durations))}.")
    if not all(any(row[0] == label and row[4] for row in rows)
               for label in ("Greenhouse board", "Lever board", "SmartRecruiters board",
                             "Ashby board", "Workable board", "We Work Remotely RSS",
                             "Remotive API", "HubKore structured vacancy", "JavaScript quotes")):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
