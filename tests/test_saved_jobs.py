"""Saved roles are durable user choices independent of listing refreshes."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from employment_agency.service import Service
from employment_agency.store import Workspace


class SavedJobs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ea-saved-jobs-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        config = patch.dict("os.environ", {"EA_CONFIG_HOME": str(self.root / "config")})
        config.start()
        self.addCleanup(config.stop)
        self.workspace = Workspace(self.root / "workspace")
        self.addCleanup(self.workspace.close)
        self.service = Service(self.workspace)
        self.job = self.service.action("job", {
            "title": "Software Engineer",
            "employer": "Fictional Systems",
            "location": "Toronto",
            "description": "Build Python services.",
            "url": "https://example.test/roles/engineer",
        })

    def test_save_and_unsave_survive_reopening_the_workspace(self):
        result = self.service.action("save-job", {"id": self.job["id"], "saved": True})
        self.assertEqual(result, {"id": self.job["id"], "saved": True})
        self.workspace.close()
        reopened = Workspace(self.root / "workspace")
        self.addCleanup(reopened.close)
        service = Service(reopened)
        self.assertTrue(service.state()["jobs"][0]["saved"])
        service.action("save-job", {"id": self.job["id"], "saved": False})
        self.assertFalse(reopened.read()["jobs"][0]["saved"])

    def test_listing_updates_cannot_remove_or_inject_a_bookmark(self):
        self.service.action("save-job", {"id": self.job["id"], "saved": True})
        refreshed = self.service.action("job", {
            **self.job, "title": "Cloud Software Engineer", "saved": False,
        })
        self.assertTrue(refreshed["saved"])
        self.assertEqual(refreshed["title"], "Cloud Software Engineer")
        self.service.action("save-job", {"id": self.job["id"], "saved": False})
        refreshed = self.service.action("job", {**refreshed, "saved": True})
        self.assertFalse(refreshed["saved"])

    def test_invalid_updates_leave_the_saved_choice_unchanged(self):
        self.service.action("save-job", {"id": self.job["id"], "saved": True})
        for value in ("false", "true", 0, 1, None, [], {}):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "true or false"):
                    self.service.action("save-job", {"id": self.job["id"], "saved": value})
                self.assertTrue(self.workspace.read()["jobs"][0]["saved"])
        with self.assertRaises(ValueError):
            self.service.action("save-job", {"id": "missing", "saved": False})
        self.assertTrue(self.workspace.read()["jobs"][0]["saved"])


if __name__ == "__main__":
    unittest.main()
