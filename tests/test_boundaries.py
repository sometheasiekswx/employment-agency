import unittest
import json
import tempfile
import io
from pathlib import Path
from unittest.mock import patch
from employment_agency import imports, sources, providers, documents, matching
from employment_agency.store import Workspace


class Boundaries(unittest.TestCase):
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
            return_value=(
                json.dumps(
                    [
                        {
                            "text": "Engineer",
                            "categories": {"location": "Toronto"},
                            "descriptionPlain": "Python",
                            "hostedUrl": "https://example.test/job",
                            "workplaceType": "remote",
                        }
                    ]
                ),
                "unused",
            ),
        ):
            self.assertEqual(
                sources.discover("lever", "example")[0]["work_arrangement"], "remote"
            )


if __name__ == "__main__":
    unittest.main()


class History(unittest.TestCase):
    def test_prior_submission_excluded(self):
        result = matching.match({"prior_application": "submitted"}, {}, [])
        self.assertIn(
            "Prior application recorded as submitted", result["hard_conflicts"]
        )
