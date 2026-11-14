"""Check the cooldown requirement at the Codex tool boundary."""

import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import tomllib
import unittest
from unittest.mock import Mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "codex-job-research-gate.py"
SETUP = SCRIPT.with_name("setup-codex-job-research-gate.py")
SPEC = importlib.util.spec_from_file_location("job_research_gate", SCRIPT)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


class JobResearchGate(unittest.TestCase):
    workspace = Path("/work/fictional-career")

    def event(self, tool, turn="turn-one"):
        return {"hook_event_name": "PreToolUse", "tool_name": tool,
                "session_id": "fixture", "turn_id": turn}

    def test_rechecks_after_followups_and_on_the_same_turn(self):
        lookup = Mock(side_effect=[[], ValueError(), [], ValueError()])

        def assert_blocked(output):
            self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

        first = gate.check(self.event("mcp__search_service__web_run"), self.workspace, lookup=lookup)
        self.assertIn("GET /api/company-avoid", first["hookSpecificOutput"]["additionalContext"])
        assert_blocked(gate.check(self.event("mcp__cua_repl__js"), self.workspace, lookup=lookup))
        next_turn = self.event("mcp__cua_repl__js", "turn-two")
        self.assertIn("additionalContext", gate.check(next_turn, self.workspace, lookup=lookup)["hookSpecificOutput"])
        assert_blocked(gate.check(next_turn, self.workspace, lookup=lookup))
        self.assertEqual(lookup.call_count, 4)

    def test_plain_local_commands_can_repair_an_unavailable_workspace(self):
        lookup = Mock(side_effect=OSError())
        event = self.event("Bash")
        for command in (
            "git status",
            "curl -fsS --max-time 3 http://127.0.0.1:8766/api/company-avoid",
        ):
            self.assertEqual(gate.check({**event, "tool_input": {"command": command}},
                                        self.workspace, lookup=lookup), {})
        lookup.assert_not_called()
        for command in (
            "curl https://example.test/jobs",
            "firecrawl search 'developer'",
            "curl -fsS 123 http://127.0.0.1:8766/api/company-avoid",
            "curl -fsS http://127.0.0.1:8766/api/company-avoid && open https://example.test",
        ):
            value = gate.check({**event, "tool_input": {"command": command}}, self.workspace, lookup=lookup)
            self.assertEqual(value["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_prompt_context_contains_only_employer_names_and_aliases(self):
        lookup = Mock(return_value=[{"name": "Fictional Corp", "aliases": ["Fictional"]}])
        result = gate.check({"hook_event_name": "UserPromptSubmit", "prompt": "Two more"},
                            self.workspace, lookup=lookup)
        context = result["hookSpecificOutput"]["additionalContext"]
        self.assertIn("Fictional Corp", context)
        self.assertNotIn("Two more", context)
        failed = gate.check({"hook_event_name": "UserPromptSubmit"}, self.workspace, lookup=Mock(side_effect=OSError()))
        self.assertIn("systemMessage", failed)

    def test_live_http_contract_and_wrong_workspace(self):
        cases = [
            (200, {"result": {"workspace": str(self.workspace), "companies": []}}),
            (503, {}),
            (302, {}),
            (200, {"result": {"workspace": "/work/other", "companies": []}}),
            (200, {"result": {"workspace": str(self.workspace), "companies": None}}),
            (200, {"result": {"workspace": str(self.workspace),
                              "companies": [{"name": "Fixture", "aliases": [5]}]}}),
        ]
        calls = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.path)
                status, body = cases.pop(0)
                self.send_response(status)
                if status == 302:
                    self.send_header("Location", "/wrong")
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def log_message(self, *_):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                self.assertEqual(gate.company_avoid(self.workspace, port=server.server_port), [])
                for _ in range(len(cases)):
                    with self.assertRaises(ValueError):
                        gate.company_avoid(self.workspace, port=server.server_port)
            finally:
                server.shutdown()
                thread.join()
        self.assertEqual(calls, ["/api/company-avoid"] * 6)


class JobResearchGateSetup(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.workspace = (Path(temp.name) / "Private workspace's data").resolve()
        self.workspace.mkdir()
        (self.workspace / "workspace.sqlite3").touch()
        self.codex = self.workspace / ".codex"

    def install(self, *options, check=True):
        return subprocess.run(
            [sys.executable, str(SETUP), "--workspace", str(self.workspace), *options],
            cwd=self.workspace.parent, text=True, capture_output=True, timeout=10, check=check,
        )

    def test_configures_fresh_workspace_and_checks_its_custom_port(self):
        workspace = self.workspace
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                self.send_response(200 if len(requests) == 1 else 503)
                self.end_headers()
                self.wfile.write(json.dumps({"result": {"workspace": str(workspace), "companies": []}}).encode())

            def log_message(self, *_):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                self.install("--port", str(server.server_port))
                self.assertEqual(tomllib.loads((self.codex / "config.toml").read_text())["web_search"], "disabled")
                hooks = json.loads((self.codex / "hooks.json").read_text())["hooks"]
                self.assertEqual(set(hooks), {"UserPromptSubmit", "PreToolUse"})
                command = hooks["PreToolUse"][0]["hooks"][0]["command"]
                subdirectory = workspace / "Search notes"
                subdirectory.mkdir()
                shell = ["powershell.exe", "-NoProfile", "-Command"] if os.name == "nt" else ["/bin/sh", "-c"]
                for turn in ("initial", "follow-up"):
                    proc = subprocess.run([*shell, command], cwd=subdirectory, text=True, check=True,
                                          input=json.dumps({"hook_event_name": "PreToolUse", "turn_id": turn,
                                                            "tool_name": "mcp__cua_repl__js"}),
                                          capture_output=True, timeout=10)
                    decision = json.loads(proc.stdout)["hookSpecificOutput"]
                    if turn == "initial":
                        self.assertIn("additionalContext", decision)
                    else:
                        self.assertEqual(decision["permissionDecision"], "deny")
            finally:
                server.shutdown()
                thread.join()
        self.assertEqual(requests, ["/api/company-avoid", "/api/company-avoid"])

    def test_preserves_existing_hooks_and_updates_without_duplicates(self):
        self.codex.mkdir()
        preferences = '[features]\nstandalone_web_search = false\n'
        config = self.codex / "config.toml"
        config.write_text(preferences)
        hooks_path = self.codex / "hooks.json"
        other_hook = {"matcher": "Bash", "hooks": [{"type": "command", "command": "echo other"}]}
        hooks_path.write_text(json.dumps({"hooks": {"PreToolUse": [other_hook]}}))
        self.install()
        self.install("--port", "9876")
        hooks = json.loads(hooks_path.read_text())["hooks"]
        self.assertEqual(len(hooks["UserPromptSubmit"]), 1)
        self.assertEqual(len(hooks["PreToolUse"]), 2)
        self.assertEqual(hooks["PreToolUse"][0], other_hook)
        self.assertIn("9876", hooks["PreToolUse"][1]["hooks"][0]["command"])
        self.assertTrue(config.read_text().endswith(preferences))
        installed = hooks_path.read_bytes()
        self.install("--port", "9876")
        self.assertEqual(hooks_path.read_bytes(), installed)

    def test_does_not_overwrite_existing_config_with_a_conflicting_search_mode(self):
        self.codex.mkdir()
        config = self.codex / "config.toml"
        config.write_text('web_search = "live"\n')
        result = self.install(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('web_search = "disabled"', result.stderr)
        self.assertEqual(config.read_text(), 'web_search = "live"\n')
        self.assertFalse((self.codex / "hooks.json").exists())


if __name__ == "__main__":
    unittest.main()
