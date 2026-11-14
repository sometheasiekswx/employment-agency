"""Exercise action input using the public CLI in an isolated workspace."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ActionInput(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.command = [
            sys.executable, '-m', 'employment_agency',
            '--workspace', str(self.root / 'workspace'),
        ]
        self.environment = {**os.environ, 'EA_CONFIG_HOME': str(self.root / 'config')}
        self.run_cli('init', check=True, stdin=subprocess.DEVNULL)

    def run_cli(self, *args, **kwargs):
        return subprocess.run(
            [*self.command, *args], capture_output=True, encoding='utf-8', timeout=10,
            env=self.environment, **kwargs,
        )

    def test_status_actions_allow_empty_redirected_input(self):
        result = self.run_cli('action', 'snapshot-status', stdin=subprocess.DEVNULL, check=True)
        self.assertEqual(json.loads(result.stdout)['status'], 'current')
        result = self.run_cli('action', 'company-avoid', input='\n', check=True)
        self.assertEqual(json.loads(result.stdout)['companies'], [])

    @unittest.skipUnless(importlib.util.find_spec('pty') and os.name == 'posix', 'requires a Unix terminal')
    def test_status_action_does_not_wait_for_terminal_input(self):
        import pty

        terminal, stdin = pty.openpty()
        try:
            result = self.run_cli('action', 'snapshot-status', stdin=stdin, check=True)
            self.assertEqual(json.loads(result.stdout)['status'], 'current')
        finally:
            os.close(stdin)
            os.close(terminal)

    def test_pipe_and_input_file_supply_explicit_action_payload(self):
        result = self.run_cli('action', 'identity', input='{"name":"Alex Morgan"}', check=True)
        self.assertEqual(json.loads(result.stdout)['name'], 'Alex Morgan')

        source = self.root / 'identity.json'
        source.write_text('{"name":"Émile Morgan"}', encoding='utf-8')
        result = self.run_cli('action', 'identity', '--input', str(source), input='{', check=True)
        self.assertEqual(json.loads(result.stdout)['name'], 'Émile Morgan')

        result = self.run_cli('action', 'identity', stdin=subprocess.DEVNULL)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Provide a JSON object', result.stderr)
        result = self.run_cli('state', stdin=subprocess.DEVNULL, check=True)
        self.assertEqual(json.loads(result.stdout)['identity']['name'], 'Émile Morgan')

    def test_bad_input_has_cli_error_instead_of_traceback(self):
        for source, message in (
            ('{malformed', 'Invalid action JSON at line 1, column 2'),
            ('[]', 'Expected a JSON object'),
        ):
            with self.subTest(source=source):
                result = self.run_cli('action', 'snapshot-status', input=source)
                self.assertEqual(result.returncode, 2)
                self.assertIn(message, result.stderr)
                self.assertNotIn('Traceback', result.stderr)

        source = self.root / 'empty.json'
        source.touch()
        result = self.run_cli('action', 'snapshot-status', '--input', str(source), stdin=subprocess.DEVNULL)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Invalid action JSON at line 1, column 1', result.stderr)
