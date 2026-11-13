import unittest
import json
import tempfile
import io
from pathlib import Path
from unittest.mock import patch
from employment_agency import imports, sources, providers, documents, matching
from employment_agency.store import Workspace


class Boundaries(unittest.TestCase):
    def setUp(self):
        config = tempfile.TemporaryDirectory()
        self.addCleanup(config.cleanup)
        environment = patch.dict('os.environ', {'EA_CONFIG_HOME': config.name})
        environment.start()
        self.addCleanup(environment.stop)

    def test_jsonld_import(self):
        html = (
            '<script type="application/ld+json">'
            + json.dumps(
                {
                    "@type": "JobPosting",
                    "title": "Engineer",
                    "description": "<p>Python</p>",
                    "hiringOrganization": {"name": "Example"},
                    "jobLocation": {"address": {"addressLocality": "Toronto"}},
                    "validThrough": "2099-12-31",
                }
            )
            + "</script>"
        )
        with patch(
            "employment_agency.sources.get",
            return_value=(html, "https://example.test/job"),
        ):
            j = sources.url_job("https://example.test/job")
            self.assertEqual(j["location"], "Toronto")
            self.assertEqual(j["closes"], "2099-12-31")

    def test_pdf_docx_import_and_unicode_failure(self):
        from docx import Document

        d = Document()
        d.add_paragraph("Built software")
        buf = io.BytesIO()
        d.save(buf)
        self.assertIn("Built software", imports.extract("x.docx", buf.getvalue()))
        with tempfile.TemporaryDirectory() as tmp:
            facts = [{"id": "a", "text": "Built software", "confirmed": True}]
            job = {"title": "Engineer", "employer": "Example"}
            p = Path(tmp) / "p"
            documents.render(p, {"name": "Alex"}, job, facts, {})
            self.assertIn(
                "Built software",
                imports.extract("x.pdf", (p / "resume.pdf").read_bytes()),
            )
            with self.assertRaisesRegex(ValueError, "font"):
                documents.render(Path(tmp) / "bad", {"name": "សួស្តី"}, job, facts, {})

    def test_paid_interruption_not_retried(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Workspace(tmp)
            with w.edit() as s:
                s["runs"].append(
                    {
                        "id": "run",
                        "status": "running",
                        "inflight": "job",
                        "done": [],
                        "errors": [],
                        "reserved": 0.1,
                    }
                )
            w.close()
            w = Workspace(tmp)
            try:
                r = w.read()["runs"][0]
                self.assertEqual(r["status"], "paused")
                self.assertIn("job", r["done"])
                self.assertEqual(r["reserved"], 0.1)
            finally:
                w.close()

    def test_advertised_salary_only(self):
        result = matching.salary_expectation(
            {
                "salary": {
                    "max": 5000,
                    "min": 3000,
                    "currency": "USD",
                    "period": "month",
                    "basis": "gross_base",
                },
                "url": "https://example.test/job",
            },
            {"stretch": True},
        )
        self.assertIn("5000", result["target"])
        self.assertEqual(result["confidence"], "low")
        self.assertIn(
            "Unresolved", matching.salary_expectation({}, {"stretch": False})["target"]
        )

    def test_provider_exact_request_and_selection(self):
        facts = [{"id": "a", "text": "Python", "confirmed": True}]
        config = {"model": "example", "input_per_million": 1, "output_per_million": 2}
        body = providers.request_body({"title": "Engineer"}, facts, config)
        self.assertFalse(body["store"])
        self.assertEqual(body["text"]["format"]["type"], "json_schema")
        self.assertGreater(providers.reserve(body, config), 0)
        self.assertEqual(providers.selection({"fact_ids": ["a"]}, facts), ["a"])
        for response in [
            {"fact_ids": ["a", "a"]},
            {"fact_ids": ["a"], "prose": "invented"},
            {"fact_ids": ["b"]},
        ]:
            with self.assertRaises(ValueError):
                providers.selection(response, facts)

    def test_greenhouse_lever_normalization(self):
        with patch(
            "employment_agency.sources.get",
            return_value=(
                json.dumps(
                    {
                        "jobs": [
                            {
                                "title": "Engineer",
                                "location": {"name": "Toronto"},
                                "content": "Python",
                                "absolute_url": "https://example.test/job",
                            }
                        ]
                    }
                ),
                "unused",
            ),
        ):
            self.assertEqual(
                sources.discover("greenhouse", "example")[0]["source"],
                "greenhouse:example",
            )
        with patch(
            "employment_agency.sources.get",
            side_effect=[
                (json.dumps([{
                    "text": "Engineer",
                    "categories": {"location": "Toronto"},
                    "descriptionPlain": "Python",
                    "hostedUrl": "https://example.test/job",
                    "workplaceType": "remote",
                }]), "unused"),
                ("[]", "unused"),
            ],
        ):
            self.assertEqual(
                sources.discover("lever", "example")[0]["work_arrangement"], "remote"
            )


    def test_greenhouse_board_returns_every_posting_or_reports_a_partial_feed(self):
        postings = [{
            "id": index, "title": "Engineer", "content": "Python",
            "absolute_url": f"https://example.test/role/{index}",
        } for index in range(1001)]
        with patch("employment_agency.sources.get", return_value=(
            json.dumps({"jobs": postings, "meta": {"total": 1001}}), "unused",
        )):
            self.assertEqual(len(sources.discover("greenhouse", "example")), 1001)
        with patch("employment_agency.sources.get", return_value=(
            json.dumps({"jobs": postings, "meta": {"total": 1002}}), "unused",
        )):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                sources.discover("greenhouse", "example")

    def test_lever_reads_later_pages_and_reports_an_ignored_offset(self):
        postings = [{
            "id": str(index), "text": "Engineer", "descriptionPlain": "Python",
            "hostedUrl": f"https://example.test/role/{index}",
        } for index in range(104)]
        first, last = json.dumps(postings[:100]), json.dumps(postings[100:])
        with patch("employment_agency.sources.get", side_effect=[(first, "unused"), (last, "unused"), ("[]", "unused")]) as fetch:
            result = sources.discover("lever", "example")
            self.assertEqual(len(result), 104)
            self.assertIn("skip=100", fetch.call_args_list[1].args[0])
            self.assertIn("skip=104", fetch.call_args.args[0])
        with patch("employment_agency.sources.get", return_value=(first, "unused")):
            with self.assertRaisesRegex(ValueError, "without new postings"):
                sources.discover("lever", "example")


if __name__ == "__main__":
    unittest.main()


class History(unittest.TestCase):
    def test_prior_submission_excluded(self):
        result = matching.match({"prior_application": "submitted"}, {}, [])
        self.assertIn(
            "Prior application recorded as submitted", result["hard_conflicts"]
        )
