import json
import tempfile
import threading
import time
import unittest
from email.message import Message
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from reportlab.pdfgen.canvas import Canvas

from employment_agency import discovery, job_feeds, public_pages, sources
from employment_agency.discovery_fetch import Deferred, Fetch
from employment_agency.service import Service
from employment_agency.store import Workspace


def response(body, url, content="text/html", status=200, **headers):
    message = Message()
    message["Content-Type"] = content
    for name, value in headers.items():
        message[name] = value
    return sources.PublicResponse(body, url, message, status)


def job(url, key="", **values):
    return sources.normalized("Python Engineer", "Example Employer", "Phnom Penh",
                              "Build Python web apps.", url, "greenhouse:fixture",
                              source_requisition=key, **values)


def vacancy_pdf(*lines):
    output = BytesIO()
    canvas = Canvas(output)
    text = canvas.beginText(36, 800)
    for line in lines:
        text.textLine(line)
    canvas.drawText(text)
    canvas.showPage()
    canvas.save()
    return output.getvalue()


class PublicContentTests(unittest.TestCase):
    def test_metadata_uses_the_labelled_employer_when_it_repeats_the_role_title(self):
        url = "https://jobs.example.org/jobs/it-assistant"
        posting = {
            "@type": "JobPosting", "title": "IT Assistant | Phnom Penh",
            "hiringOrganization": {"name": "IT Assistant | Phnom Penh"},
            "description": "<p>Company:<br>Example Engineering Ltd.</p><p>Support internal applications.</p>",
            "validThrough": "November 18, 2026",
        }
        page = public_pages.html_page(
            f'<script type="application/ld+json">{json.dumps(posting)}</script>', url,
        )
        self.assertEqual(page["jobs"][0]["employer"], "Example Engineering Ltd.")
        self.assertEqual(page["jobs"][0]["closes"], "2026-11-18")

        posting["description"] = "<p>Support internal applications.</p>"
        page = public_pages.html_page(
            f'<script type="application/ld+json">{json.dumps(posting)}</script>'
            '<main><h1>IT Assistant</h1><p>Support internal applications.</p></main>', url,
        )
        self.assertFalse(page["jobs"])
        self.assertIn("Support internal applications.", page["text"])
        self.assertEqual(page["leads"][0]["title"], "IT Assistant | Phnom Penh")
        self.assertEqual(page["leads"][0]["employer"], "")

        posting["hiringOrganization"]["name"] = "Different Employer"
        posting["description"] = "<p>Hiring employer: Example Engineering Ltd.</p>"
        page = public_pages.html_page(
            f'<script type="application/ld+json">{json.dumps(posting)}</script>', url,
        )
        self.assertFalse(page["jobs"])
        self.assertEqual(page["leads"][0]["employer"], "")

    def test_pdf_with_explicit_identity_imports_and_a_scan_is_left_for_review(self):
        url = "https://careers.example.org/vacancies/view?id=12"
        data = vacancy_pdf(
            "Job Description", "Job Title: Application Engineer", "Employer: Example Engineering",
            "Location: Phnom Penh", "Closing Date: 30-Nov-2026", "Build internal services.",
            "Requirements:", "- Python", "- SQL", "How to Apply:", "Visit the employer site.",
        )
        pdf = response(data, url, "application/octet-stream")
        page = public_pages.extract(pdf.body, pdf.url, pdf.headers)
        listing, = page["jobs"]
        self.assertEqual((listing["title"], listing["employer"], listing["location"], listing["closes"]),
                         ("Application Engineer", "Example Engineering", "Phnom Penh", "2026-11-30"))
        self.assertEqual(listing["requirements"], ["Python", "SQL"])
        self.assertIn("Build internal services.", page["text"])

        empty = response(vacancy_pdf(), url, "application/pdf")
        unreadable = public_pages.extract(empty.body, empty.url, empty.headers)
        self.assertFalse(unreadable["jobs"])
        self.assertIn("text", unreadable["note"].lower())
        malformed = response(b"%PDF-1.4\ninvalid", url, "application/pdf")
        with self.assertRaisesRegex(sources.SourceError, "PDF could not be read"):
            public_pages.extract(malformed.body, malformed.url, malformed.headers)

    def test_a_pdf_without_an_employer_stays_a_lead(self):
        url = "https://example.org/files/engineer.pdf"
        pdf = response(vacancy_pdf("Job Title: Engineer", "Build services."), url, "application/pdf")
        page = public_pages.extract(pdf.body, url, pdf.headers)
        self.assertFalse(page["jobs"])
        self.assertEqual(page["leads"][0]["title"], "Engineer")

    def test_repeated_links_keep_the_job_title(self):
        url = "https://example.org/careers"
        page = public_pages.html_page(
            '<main><a href="/careers/engineer">Engineer</a>'
            '<a href="/careers/engineer">Apply Now</a></main>', url,
        )
        self.assertEqual(page["links"], [{"url": url + "/engineer", "title": "Engineer"}])

    def test_extracts_explicit_metadata_and_readable_ordinary_content(self):
        posting = {
            "@type": "JobPosting",
            "title": "Developer",
            "hiringOrganization": {"name": "Research Lab"},
            "description": "<p>Develop open software.</p><script>ignore()</script>",
            "datePosted": "2026-11-13",
            "jobLocationType": "TELECOMMUTE",
            "applicantLocationRequirements": [{"@type": "Country", "name": "Cambodia"}],
        }
        structured_data = json.dumps(posting).replace("<", r"\u003c")
        document = f"""
        <html><head><title>Engineering careers</title>
        <script type="application/ld+json">{structured_data}</script></head>
        <body><main><h1>Work with us</h1><p>Research in the open.</p>
        <a href="/careers/another">Another job</a><a href="javascript:exec()">Ignore</a>
        </main></body></html>
        """
        page = public_pages.html_page(document, "https://example.org/careers/developer")
        self.assertEqual(page["title"], "Engineering careers")
        self.assertIn("Research in the open.", page["text"])
        self.assertNotIn("ignore()", page["text"])
        self.assertEqual(page["links"], [{"title": "Another job", "url": "https://example.org/careers/another"}])
        self.assertEqual(page["jobs"][0]["posted_at"], "2026-11-13")
        self.assertEqual(page["jobs"][0]["eligibility"], "unknown")
        self.assertEqual(page["jobs"][0]["location"], "Remote — Cambodia")
        self.assertEqual(page["jobs"][0]["description"], "Develop open software.")

    def test_manual_access_challenge_does_not_trigger_a_render(self):
        page = public_pages.html_page("<title>Just a moment...</title><main>Confirm you are human</main>",
                                      "https://example.org/jobs")
        self.assertTrue(public_pages.challenge_page(page))
        self.assertEqual(job_feeds.selector_for("https://www.workable.com/api/accounts/sample?details=true"),
                         ("workable", "sample"))

    def test_sitemap_follows_job_links_and_recognised_boards(self):
        document = b"""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.org/careers/python</loc></url>
          <url><loc>https://example.org/help</loc></url>
          <url><loc>https://unrelated.org/careers/python</loc></url>
          <url><loc>https://jobs.ashbyhq.com/example-board</loc></url>
        </urlset>"""
        page = public_pages.sitemap_page(document, "https://example.org/sitemap.xml")
        self.assertEqual([link["url"] for link in page["links"]], [
            "https://example.org/careers/python", "https://jobs.ashbyhq.com/example-board",
        ])
        with self.assertRaisesRegex(ValueError, "XML declarations"):
            job_feeds.xml_root(b'<!DOCTYPE rss [<!ENTITY version "data">]><rss/>')

    def test_smartrecruiters_keeps_posting_identity_and_checks_detail(self):
        posting_id = "4a053eb6-3d38-4076-8616-7cd273f0d333"
        payload = {"content": [{
            "id": "1001", "uuid": posting_id, "name": "Engineer", "company": {"name": "Example"},
            "location": {"city": "Phnom Penh", "country": "KH"}, "defaultJobAd": True,
        }], "totalFound": 1}
        fetched = list(job_feeds.smartrecruiters("example", lambda _: (json.dumps(payload), "")))
        self.assertEqual(fetched[0]["description"], "")
        detail = {"active": True, "uuid": posting_id, "jobAd": {"sections": {
            "jobDescription": {"text": "<p>Develop APIs.</p>"},
            "qualifications": {"text": "<p>Python experience.</p>"},
        }}}
        result = job_feeds.enrich(fetched[0], lambda _: (json.dumps(detail), ""))
        self.assertIn("Python experience.", result["description"])
        detail["uuid"] = "different"
        with self.assertRaisesRegex(ValueError, "different"):
            job_feeds.enrich(fetched[0], lambda _: (json.dumps(detail), ""))

    def test_remote_feed_ids_match_across_categories_and_keep_attribution(self):
        xml = b"""<rss><channel><item><title>Employer: Engineer</title><guid>123</guid>
        <link>https://weworkremotely.com/remote-jobs/employer-engineer</link>
        <region>Anywhere</region><description>Build APIs</description>
        <pubDate>Fri, 13 Nov 2026 09:00:00 +0000</pubDate></item></channel></rss>"""
        rows = list(job_feeds.rss_jobs(xml))
        self.assertEqual(rows[0]["source"], "weworkremotely:all")
        self.assertEqual(rows[0]["source_requisition"], "weworkremotely:all:123")
        self.assertEqual(rows[0]["location"], "Remote — Anywhere")
        self.assertTrue(rows[0]["url"].startswith("https://weworkremotely.com/"))


class FetchPolicyTests(unittest.TestCase):
    def setUp(self):
        self.fetch = Fetch(threading.Event(), time.monotonic() + 10)
        self.url = "https://example.org/jobs"

    def test_robots_denial_stops_before_request_or_any_fallback(self):
        with patch("employment_agency.sources.request", return_value=response(
            b"User-agent: *\nDisallow: /jobs", "https://example.org/robots.txt", "text/plain",
        )) as request, patch("employment_agency.render_public_page.render") as browser:
            with self.assertRaisesRegex(ValueError, "disallows"):
                self.fetch.page(self.url, allow_firecrawl=True)
        self.assertEqual(request.call_count, 1)
        browser.assert_not_called()

    def test_resolved_addresses_must_all_be_public_unicast(self):
        answer = lambda host: (None, None, None, "", (host, 443))
        for unacceptable in ("127.0.0.1", "::ffff:127.0.0.1", "224.0.0.1", "ff02::1"):
            with self.subTest(address=unacceptable), patch(
                "employment_agency.sources.socket.getaddrinfo",
                return_value=[answer("1.1.1.1"), answer(unacceptable)],
            ):
                with self.assertRaisesRegex(ValueError, "Private or reserved"):
                    sources.public_addresses("example.org")

    def test_conditional_request_reuses_verified_body_on_304(self):
        content = b"<html><title>Example</title><body>Some readable text.</body></html>"
        with patch("employment_agency.sources.request", side_effect=[
            response(content, self.url, ETag='"revision-1"'),
            response(b"", self.url, status=304),
        ]) as request:
            self.assertEqual(self.fetch.bytes(self.url, documented=True)[0], content)
            self.assertEqual(self.fetch.bytes(self.url, documented=True)[0], content)
        self.assertEqual(request.call_args.kwargs["headers"], {"If-None-Match": '"revision-1"'})

    def test_transient_errors_get_one_retry_and_long_rate_limit_is_deferred(self):
        with patch("employment_agency.sources.request", side_effect=[
            sources.SourceError("HTTP 503", status=503),
            response(b"ok", self.url),
        ]) as request:
            self.assertEqual(self.fetch.bytes(self.url, documented=True)[0], b"ok")
            self.assertEqual(request.call_count, 2)
        with patch("employment_agency.sources.request", side_effect=sources.SourceError(
            "HTTP 429", status=429, retry_after=60,
        )) as request:
            for _ in range(2):
                with self.assertRaises(Deferred):
                    self.fetch.bytes(self.url, documented=True)
            self.assertEqual(request.call_count, 1)
            following = Fetch(threading.Event(), time.monotonic() + 10, cache=self.fetch.cache)
            with self.assertRaises(Deferred):
                following.bytes(self.url, documented=True)
            self.assertEqual(request.call_count, 1)

    def test_firecrawl_needs_opt_in_and_caps_public_page_calls(self):
        with patch.dict("os.environ", {"FIRECRAWL_API_KEY": "fixture-key"}):
            enabled = Fetch(threading.Event(), time.monotonic() + 10, allow_firecrawl=True)
            self.assertEqual(self.fetch.firecrawl_key, "")
        reply = json.dumps({"success": True, "data": {
            "rawHtml": "<html><title>Example</title><body>Public page.</body></html>",
            "metadata": {"statusCode": 200, "sourceURL": self.url},
        }}).encode()
        with patch.object(enabled, "allows"), patch("employment_agency.sources.public_addresses"), patch(
            "employment_agency.sources.request", return_value=response(reply, "https://api.firecrawl.dev/v2/scrape"),
        ) as request:
            self.assertIn("Public page.", enabled.firecrawl(self.url)["text"])
            enabled.firecrawl(self.url)
            self.assertRaisesRegex(ValueError, "per-search limit", enabled.firecrawl, self.url)
            self.assertRaisesRegex(ValueError, "query string", enabled.firecrawl, self.url + "?token=private")
            self.assertEqual(request.call_count, 2)
            payload = json.loads(request.call_args.kwargs["data"])
            self.assertEqual(payload["url"], self.url)
            self.assertEqual(payload["formats"], ["rawHtml", "markdown"])
            self.assertFalse(payload["storeInCache"])
            self.assertEqual(payload["maxAge"], 0)
            self.assertNotIn("headers", payload)

    def test_search_opt_in_reuses_cloud_cli_sign_in_and_honors_an_explicit_key(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "employment_agency.discovery_fetch.Path.home", return_value=Path(directory),
        ), patch("employment_agency.discovery_fetch.sys.platform", "darwin"), patch.dict(
            "os.environ", {"FIRECRAWL_API_KEY": ""},
        ):
            credentials = Path(directory) / "Library" / "Application Support" / "firecrawl-cli" / "credentials.json"
            credentials.parent.mkdir(parents=True)
            credentials.write_text(json.dumps({"apiKey": "fixture-cli-key"}))
            disabled = Fetch(threading.Event(), time.monotonic() + 10)
            enabled = Fetch(threading.Event(), time.monotonic() + 10, allow_firecrawl=True)
            self.assertFalse(disabled.firecrawl_key)
            self.assertEqual(enabled.firecrawl_key, "fixture-cli-key")
            credentials.write_text(json.dumps({"apiKey": "custom-server-key", "apiUrl": "https://example.org"}))
            self.assertFalse(Fetch(threading.Event(), time.monotonic() + 10, allow_firecrawl=True).firecrawl_key)
            credentials.write_text("damaged credentials")
            self.assertFalse(Fetch(threading.Event(), time.monotonic() + 10, allow_firecrawl=True).firecrawl_key)
            with patch.dict("os.environ", {"FIRECRAWL_API_KEY": "fixture-env-key"}):
                self.assertEqual(Fetch(threading.Event(), time.monotonic() + 10,
                                       allow_firecrawl=True).firecrawl_key, "fixture-env-key")

    def test_firecrawl_can_recover_direct_timeout_but_never_an_access_denial(self):
        with patch.dict("os.environ", {"FIRECRAWL_API_KEY": "fixture-key"}):
            enabled = Fetch(threading.Event(), time.monotonic() + 10, allow_firecrawl=True)
        fallback = {"jobs": [job(self.url)], "url": self.url, "title": "Python Engineer",
                    "text": "Develop Python services.", "links": []}
        with patch.object(enabled, "bytes", side_effect=TimeoutError), \
                patch.object(enabled, "firecrawl", return_value=fallback) as provider:
            self.assertEqual(enabled.page(self.url, allow_firecrawl=True), ("firecrawl", fallback))
            provider.assert_called_once_with(self.url)
        with patch.object(enabled, "bytes", side_effect=sources.SourceError("Denied", status=403)), \
                patch.object(enabled, "firecrawl") as provider:
            with self.assertRaisesRegex(ValueError, "Denied"):
                enabled.page(self.url, allow_firecrawl=True)
            provider.assert_not_called()


class DiscoveryRunTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = Workspace(Path(self.temp.name) / "workspace", sqlite=True)
        self.addCleanup(self.workspace.close)
        self.service = Service(self.workspace)
        self.addCleanup(lambda: self.service.discovery and self.service.discovery.close())
        self.profile = self.service.action("profile", {"name": "Engineering", "roles": ["Engineer"]})

    def test_reads_linked_pdf_with_employer_and_dates_from_the_same_site_vacancy_index(self):
        index = "https://careers.example.org/"
        pdf_url = index + "Vacancy/ViewFileVacancy?fid=fixture"
        index_html = b"""
        <html><title>E-Recruitment | Vacancies</title><body>
        <p>Example Bank is a commercial bank. Its head office is in Phnom Penh.</p>
        <table><thead><tr><th>Job Title</th><th>Location</th>
        <th>Opening Date</th><th>Closing Date</th></tr></thead>
        <tbody><tr><td><a href="/Vacancy/ViewFileVacancy?fid=fixture">Platform Engineer</a></td>
        <td>Head Office</td><td>05-Nov-2026</td><td>30-Nov-2026</td></tr></tbody></table>
        <div>Copyright &copy; Example Bank | All Rights Reserved.</div></body></html>
        """
        pdf = vacancy_pdf("Job Description", "Job Title: Platform Engineer",
                          "Keep shipping pipelines reliable.", "Requirements:", "- CI/CD")
        bodies = {
            index: response(index_html, index),
            pdf_url: response(pdf, pdf_url, "application/pdf"),
        }

        def fetch_bytes(_, url):
            result = bodies[url]
            return result.body, result.url, result.headers

        with patch.object(Fetch, "bytes", fetch_bytes):
            self.service.action("discovery-start", {"urls": [index], "profile_id": self.profile["id"]})
            result = self.service.discovery.wait()

        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["sources"][1]["status"], "retrieved")
        listing, = self.workspace.read()["jobs"]
        self.assertEqual((listing["employer"], listing["title"]), ("Example Bank", "Platform Engineer"))
        self.assertEqual((listing["location"], listing["posted_at"], listing["closes"]),
                         ("Head Office, Phnom Penh", "2026-11-05", "2026-11-30"))
        self.assertEqual((listing["url"], listing["careers_url"]), (pdf_url, index))
        self.assertEqual(listing["requirements"], ["CI/CD"])

        with patch.object(self.workspace.database, "employers_to_avoid", return_value=[
            {"name": "Example Banking Ltd.", "aliases": ["Example Bank"]},
        ]), patch.object(Fetch, "bytes", side_effect=lambda url: fetch_bytes(None, url)) as grab:
            self.service.action("discovery-start", {"urls": [index]})
            paused = self.service.discovery.wait()
        grab.assert_called_once_with(index)
        self.assertEqual(paused["sources"][1]["status"], "skipped")

    def test_each_discovery_queries_the_current_sqlite_avoid_list_before_fetching(self):
        url = "https://example.org/careers/engineer"
        page = {"url": url, "title": "Engineer", "text": "Build services.",
                "links": [], "jobs": [job(url)]}
        calls = []

        def lookup():
            calls.append("avoid")
            return []

        def fetch(*_, **__):
            calls.append("fetch")
            return "http", page

        with patch.object(self.workspace.database, "employers_to_avoid", side_effect=lookup), patch.object(
            Fetch, "page", side_effect=fetch,
        ):
            for _ in range(2):
                self.service.action("discovery-start", {"urls": [url]})
                self.assertEqual(self.service.discovery.wait()["status"], "complete")
        self.assertEqual(calls, ["avoid", "fetch", "avoid", "fetch"])

    def test_index_follows_one_result_dedupes_and_leaves_drafts_untouched(self):
        url = "https://example.org/careers"
        listing = url + "/python"

        def get(fetch, target, **_):
            return "http", {
                "url": target, "title": "Careers" if target == url else "Python Engineer",
                "text": "Public employer careers page", "jobs": [] if target == url else [job(listing)],
                "links": [{"url": listing, "title": "Python Engineer"}] if target == url else [],
            }

        with patch.object(Fetch, "page", get):
            options = {"urls": [url, url + "#details"], "profile_id": self.profile["id"]}
            self.service.action("discovery-start", options)
            first = self.service.discovery.wait()
            self.service.action("save-job", {"id": first["jobs"][0]["job"]["id"], "saved": True})
            self.service.action("discovery-start", options)
            second = self.service.discovery.wait()
        self.assertEqual(len(first["sources"]), 2)
        self.assertEqual(first["new_job_count"], 1)
        self.assertEqual(first["sources"][1]["job_ids"], [first["jobs"][0]["job"]["id"]])
        self.assertEqual(second["new_job_count"], 0)
        self.assertTrue(second["jobs"][0]["job"]["saved"])
        self.assertEqual(self.workspace.read()["applications"], [])

    def test_partial_results_and_stop_discard_late_responses(self):
        release = threading.Event()
        slow_entered = threading.Event()
        self.addCleanup(release.set)
        fast, slow = "https://fast.example.org/job/one", "https://slow.example.org/job/two"

        def fetch_page(fetch, url, **_):
            if url == slow:
                slow_entered.set()
                release.wait(5)
            return "http", {"url": url, "title": "Engineer", "text": "Developer",
                            "links": [], "jobs": [job(url)]}

        with patch.object(Fetch, "page", fetch_page), patch.object(discovery, "EARLY_SECONDS", 0.1):
            started = self.service.action("discovery-start", {"urls": [fast, slow]})
            self.assertTrue(slow_entered.wait(2))
            end = time.monotonic() + 3
            while time.monotonic() < end:
                partial = self.service.action("discovery-status", {"id": started["id"]})
                if partial["jobs"] and partial["early_results"]:
                    break
                time.sleep(0.02)
            self.assertEqual(partial["status"], "running")
            self.assertTrue(partial["early_results"])
            self.assertEqual(partial["jobs"][0]["job"]["url"], fast)
            self.service.action("discovery-stop", {"id": started["id"]})
            release.set()
            stopped = self.service.discovery.wait()
        self.assertEqual(stopped["status"], "stopped")
        self.assertEqual([row["url"] for row in self.workspace.read()["jobs"]], [fast])

    def test_global_deadline_does_not_wait_for_a_stuck_source(self):
        blocked = threading.Event()
        self.addCleanup(blocked.set)
        with patch.object(Fetch, "page", side_effect=lambda *args, **kwargs: blocked.wait(5)), patch.object(
            discovery, "RUN_SECONDS", 0.2,
        ):
            begin = time.monotonic()
            self.service.action("discovery-start", {"urls": ["https://example.org/careers"]})
            result = self.service.discovery.wait()
            blocked.set()
        self.assertEqual(result["status"], "timed_out")
        self.assertEqual(result["sources"][0]["status"], "timed_out")
        self.assertLess(time.monotonic() - begin, 1.5)

    def test_failed_and_partial_checks_keep_the_last_good_records(self):
        src = self.service.action("source", {"kind": "greenhouse", "board": "fixture"})
        listing = job("https://example.org/careers/python", "posting-1")
        self.service.import_discovery([listing], source_id=src["id"], full_snapshot=True)
        previous = self.workspace.read()
        with patch.object(Fetch, "feed", side_effect=sources.SourceError("Source returned HTTP 403", status=403)):
            self.service.action("discovery-start", {"source_ids": [src["id"]]})
            result = self.service.discovery.wait()
        self.assertEqual(result["sources"][0]["status"], "blocked")
        failed = self.workspace.read()
        self.assertEqual(failed["jobs"], previous["jobs"])
        self.assertEqual(failed["sources"][0]["checked_at"], previous["sources"][0]["checked_at"])
        self.assertIn("attempted_at", failed["sources"][0])
        self.service.import_discovery([], source_id=src["id"], full_snapshot=False)
        self.assertEqual(self.workspace.read()["jobs"][0]["availability"], "retrieved")
        self.service.import_discovery([], source_id=src["id"], full_snapshot=True)
        self.assertEqual(self.workspace.read()["jobs"][0]["availability"], "closed")

    def test_public_page_refresh_preserves_confirmed_employer_name(self):
        url = "https://example.org/careers/python"
        verified = self.service.action("job", {**job(url), "employer": "Confirmed Employer"})
        self.service.action("company-map", {"job_id": verified["id"], "confirmed": True})
        page = {"url": url, "title": "Python Engineer", "text": "Build Python web apps.",
                "links": [], "jobs": [job(url)]}
        with patch.object(Fetch, "page", return_value=("http", page)):
            self.service.action("discovery-start", {"urls": [url]})
            result = self.service.discovery.wait()
        self.assertEqual(result["sources"][0]["job_ids"], [verified["id"]])
        self.assertEqual(result["new_job_count"], 0)
        self.assertEqual(self.workspace.read()["jobs"][0]["employer"], "Confirmed Employer")

    def test_missing_optional_provider_keeps_local_results_available(self):
        url = "https://example.org/careers/python"
        with patch("employment_agency.discovery_fetch.firecrawl_api_key", return_value=""), patch.object(
            Fetch, "page", return_value=("http", {
                "jobs": [job(url)], "title": "Python Engineer", "url": url, "text": "Python", "links": [],
            }),
        ):
            self.service.action("discovery-start", {"urls": [url], "firecrawl": True})
            final = self.service.discovery.wait()
        self.assertEqual(final["new_job_count"], 1)
        self.assertIn("FIRECRAWL_API_KEY", final["notice"])

    def test_confirmed_employer_cooldown_skips_source_before_fetch(self):
        source = self.service.action("source", {"kind": "greenhouse", "board": "fixture"})
        with self.workspace.edit() as state:
            state["employers"] = [{"id": "example", "name": "Example Employer", "aliases": [],
                                   "source_ids": [source["id"]]}]
        with patch("employment_agency.companies.source_cooldown", return_value=True), patch.object(Fetch, "feed") as grab:
            self.service.action("discovery-start", {"source_ids": [source["id"]]})
            result = self.service.discovery.wait()
        grab.assert_not_called()
        self.assertEqual(result["sources"][0]["status"], "skipped")

    def test_recognised_board_from_careers_page_respects_saved_research_employer(self):
        source = self.service.action("source", {"kind": "greenhouse", "board": "fixture"})
        with self.workspace.edit() as state:
            state["sources"][0]["research_name"] = "Example Employer"
        careers = "https://example.org/careers"
        page = {"url": careers, "title": "Careers", "text": "Open jobs", "jobs": [],
                "links": [{"title": "Our jobs", "url": "https://boards.greenhouse.io/fixture"}]}
        with patch.object(Fetch, "page", return_value=("http", page)), patch.object(
            Fetch, "feed", return_value=[job("https://example.org/careers/python", "posting-1")],
        ) as grab, patch("employment_agency.companies.research_employer", return_value={"remaining": 0}):
            self.service.action("discovery-start", {"urls": [careers]})
            result = self.service.discovery.wait()
        grab.assert_not_called()
        self.assertEqual(result["sources"][1]["status"], "skipped")
        self.assertTrue(any(entry["id"] == source["id"] for entry in self.workspace.read()["sources"]))
