import unittest
import tempfile
import json
import base64
import zipfile
import email
import threading
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
from employment_agency.store import Workspace, restore
from employment_agency.service import Service
from employment_agency import matching, documents, sources, providers, imports, packages
from employment_agency.server import server


class Workflow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.w = Workspace(self.root / "private")
        self.s = Service(self.w)

    def tearDown(self):
        if self.s.worker:
            self.s.worker.join(5)
        self.w.close()
        self.tmp.cleanup()

    def seed(self):
        self.s.action(
            "identity",
            {
                "name": "Alex Morgan",
                "email": "alex@example.test",
                "phone": "+1 555 0100",
                "location": "Toronto",
                "languages": "English",
            },
        )
        f = self.s.action(
            "fact",
            {
                "text": "Built Python APIs and automated integration tests.",
                "association": "Example Labs",
                "dates": "2022–2025",
                "category": "experience",
            },
        )
        self.s.action("confirm", {"id": f["id"]})
        p = self.s.action(
            "profile",
            {
                "name": "Engineering",
                "roles": ["Engineer"],
                "locations": ["Toronto"],
                "hard": ["roles", "locations"],
                "include_unknown": True,
                "include_stretch": True,
            },
        )
        j = self.s.action(
            "job",
            {
                "title": "Software Engineer",
                "employer": "Fictional Systems",
                "location": "Toronto",
                "description": "Build Python APIs and integration tests.",
                "requirements": ["Python APIs"],
                "url": "https://example.test/job",
                "email": "jobs@example.test",
                "availability": "retrieved",
            },
        )
        return f, p, j

    def test_unconfirmed_and_conflict(self):
        f, p, j = self.seed()
        self.s.action(
            "fact", {"id": f["id"], "text": "Changed claim", "claim_key": "role"}
        )
        self.assertEqual(matching.available(self.s.state()["facts"]), [])
        g = self.s.action("fact", {"text": "Different claim", "claim_key": "role"})
        with self.assertRaises(ValueError):
            self.s.action("confirm", {"id": g["id"]})
        self.s.action("retire", {"id": f["id"]})
        self.s.action("confirm", {"id": g["id"]})
        self.assertEqual(len(matching.available(self.s.state()["facts"])), 1)

    def test_imports_no_confirmation(self):
        result = self.s.action(
            "import",
            {
                "name": "resume.txt",
                "data": base64.b64encode(b"Built software\nLed a team").decode(),
            },
        )
        self.assertEqual(result["candidates"], 2)
        self.assertFalse(any(f["confirmed"] for f in self.s.state()["facts"]))
        self.assertIn(
            "Hello",
            imports.extract(
                "x.tex", b"\\begin{document}Hello \\input{/etc/passwd}\\end{document}"
            ),
        )
        with self.assertRaises(ValueError):
            imports.extract("x.exe", b"data")

    def test_run_documents_and_restore(self):
        f, p, j = self.seed()
        self.s.action("run", {"profile_id": p["id"], "count": 2, "discover": False})
        self.s.worker.join(10)
        state = self.s.state()
        self.assertEqual(state["runs"][0]["status"], "complete")
        self.assertEqual(len(state["applications"]), 1)
        app = state["applications"][0]
        folder = self.w.path / app['folder']
        self.assertEqual(packages.changed(self.w.path, app), [])
        self.assertFalse((self.w.path / 'packages').exists())
        from pypdf import PdfReader

        self.assertIn(
            "Python", PdfReader(folder / app["documents"]["resume.pdf"]).pages[0].extract_text()
        )
        from docx import Document

        self.assertIn(
            "Python",
            " ".join(p.text for p in Document(folder / app["documents"]["resume.docx"]).paragraphs),
        )
        msg = email.message_from_bytes((folder / app["documents"]["application.eml"]).read_bytes())
        parts = [p for p in msg.walk() if p.get_content_type() == "application/pdf"]
        self.assertEqual(len(parts), 2)
        for part in parts:
            self.assertEqual(
                part.get_payload(decode=True),
                (folder / part.get_filename()).read_bytes(),
            )
        self.s.action(
            "review", {"id": app["id"], "status": "reviewed", "comment": "Checked"}
        )
        self.s.action("review", {"id": app["id"], "status": "submitted"})
        with self.assertRaises(ValueError):
            self.s.action("review", {"id": app["id"], "status": "draft"})
        self.s.action(
            "consent",
            {
                "provider": "agent",
                "grant": True,
                "purpose": providers.PURPOSE,
                "categories": providers.CATEGORIES,
            },
        )
        archive = self.w.export(self.root / "backup.zip")
        restore(archive, self.root / "restored")
        with WorkspaceContext(self.root / "restored") as other:
            self.assertEqual(other.read()["consents"], {})
            self.assertEqual(other.read()["applications"][0]["status"], "submitted")

    def test_hard_conflicts_and_unknowns(self):
        f, p, j = self.seed()
        j["eligibility"] = "conflict"
        self.assertFalse(
            matching.match(j, p, self.s.state()["facts"])["eligible_for_preparation"]
        )
        j["eligibility"] = "unknown"
        p["include_unknown"] = False
        self.assertFalse(
            matching.match(j, p, self.s.state()["facts"])["eligible_for_preparation"]
        )
        p["include_unknown"] = True
        p.update(minimum=3000, currency="USD", period="month")
        j["salary"] = {
            "max": 2000,
            "currency": "USD",
            "period": "month",
            "basis": "gross_base",
        }
        self.assertIn(
            "Advertised maximum below private minimum",
            matching.match(j, p, [])["hard_conflicts"],
        )

    def test_unknown_fact_ids_rejected(self):
        f, p, j = self.seed()
        with self.assertRaises(ValueError):
            self.s.action(
                "agent-package",
                {
                    "profile_id": p["id"],
                    "job_id": j["id"],
                    "selection": {"fact_ids": ["invented"]},
                },
            )

    def test_provider_consent_and_budget(self):
        f, p, j = self.seed()
        with self.assertRaises(ValueError):
            self.s.action("handoff", {"job_id": j["id"]})
        self.s.action(
            "consent",
            {
                "provider": "openai",
                "grant": True,
                "purpose": providers.PURPOSE,
                "categories": providers.CATEGORIES,
            },
        )
        with patch("employment_agency.providers.openai_select") as call:
            self.s.action(
                "run",
                {
                    "profile_id": p["id"],
                    "mode": "openai",
                    "model": "test-model",
                    "input_per_million": 10,
                    "output_per_million": 20,
                    "budget": 0.000001,
                    "approve_budget": True,
                    "discover": False,
                },
            )
            self.s.worker.join(5)
            call.assert_not_called()
            self.assertEqual(self.s.state()["runs"][0]["status"], "paused")

    def test_provider_handoff_omits_contact_and_minimum(self):
        f, p, j = self.seed()
        result = providers.handoff(j, self.s.state()["facts"])
        raw = json.dumps(result)
        self.assertNotIn("alex@example.test", raw)
        self.assertNotIn("minimum", raw)

    def test_resume_cancelled_run(self):
        f, p, j = self.seed()
        with patch.object(self.s, "launch"):
            r = self.s.start({"profile_id": p["id"], "count": 1, "discover": False})
        self.s.action("cancel", {"id": r["id"]})
        self.s.run(r["id"])
        self.assertEqual(self.s.state()["runs"][0]["status"], "cancelled")
        self.s.action("resume", {"id": r["id"]})
        self.s.worker.join(10)
        self.assertEqual(len(self.s.state()["applications"]), 1)

    def test_source_failure_not_success(self):
        src = self.s.action("source", {"kind": "lever", "board": "fictional"})
        with patch(
            "employment_agency.sources.discover",
            side_effect=ValueError("secret response"),
        ):
            self.s.refresh(src["id"])
        state = self.s.state()
        self.assertEqual(state["sources"][0]["status"], "failed")
        self.assertNotIn("secret response", json.dumps(state))

    def test_closed_source_job_retained(self):
        f, p, j = self.seed()
        src = self.s.action("source", {"kind": "lever", "board": "fictional"})
        with self.w.edit() as state:
            state["jobs"][0]["source"] = "lever:fictional"
        with patch("employment_agency.sources.discover", return_value=[]):
            self.s.refresh(src["id"])
        self.assertEqual(self.s.state()["jobs"][0]["availability"], "closed")

    def test_ssrf(self):
        for url in [
            "file:///etc/passwd",
            "http://127.0.0.1",
            "https://user:pass@example.com",
            "https://example.com:444",
        ]:
            with self.assertRaises(ValueError):
                sources.get(url)
        with patch(
            "socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]
        ):
            with self.assertRaises(ValueError):
                sources.get("https://example.com")

    def test_bad_archive(self):
        archive = self.root / "evil.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("../outside", "bad")
            z.writestr("checksums.json", "{}")
        with self.assertRaises(ValueError):
            restore(archive, self.root / "restored")
        self.assertFalse((self.root / "outside").exists())
        self.assertFalse((self.root / "restored").exists())

    def test_workspace_lock(self):
        with self.assertRaises(ValueError):
            Workspace(self.w.path)

    def test_api_boundaries(self):
        http = server(self.s, 0)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{http.server_port}"
        try:
            with urllib.request.urlopen(base + "/api/state") as r:
                token = json.load(r)["token"]
            for origin, key in [("https://evil.test", token), (base, "bad")]:
                req = urllib.request.Request(
                    base + "/api/identity",
                    data=b'{"name":"Changed"}',
                    headers={
                        "Origin": origin,
                        "X-Workspace-Token": key,
                        "Content-Type": "application/json",
                    },
                )
                with self.assertRaises(urllib.error.HTTPError) as e:
                    urllib.request.urlopen(req)
                self.assertEqual(e.exception.code, 403)
            self.assertEqual(self.s.state()["identity"], {})
            with self.w.edit() as state:
                state["applications"].append({"id": ".."})
            (self.w.path / "resume.pdf").write_bytes(b"private root file")
            with self.assertRaises(urllib.error.HTTPError) as blocked:
                urllib.request.urlopen(base + "/files/../resume.pdf")
            self.assertEqual(blocked.exception.code, 404)
            req = urllib.request.Request(
                base + "/api/state", headers={"Host": "evil.test"}
            )
            with self.assertRaises(urllib.error.HTTPError):
                urllib.request.urlopen(req)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


class WorkspaceContext:
    def __init__(self, path):
        self.w = Workspace(path)

    def __enter__(self):
        return self.w

    def __exit__(self, *args):
        self.w.close()


if __name__ == "__main__":
    unittest.main()
