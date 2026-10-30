"""Demonstrations must never overwrite or select a real workspace."""
from pathlib import Path
import json
import os
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

from employment_agency import demo, packages
from employment_agency.store import Workspace


class DemoContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ea-demo-test-')
        self.root = Path(self.temp.name)
        self.config = self.root / 'config'
        self.config.mkdir()
        self.sentinel = b'{"path":"unchanged remembered workspace"}\n'
        (self.config / 'location.json').write_bytes(self.sentinel)
        self.env = patch.dict(os.environ, {'EA_CONFIG_HOME': str(self.config)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_demo_is_populated_offline_and_does_not_select_or_write_global_permissions(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('Demo must be offline')):
            result = demo.create(self.root / 'example')
        self.assertEqual(result['applications'], 10)
        self.assertGreaterEqual(result['facts'], 12)
        state = json.loads((self.root / 'example/state.json').read_text())
        self.assertEqual(len(state['jobs']), 13)
        self.assertEqual(len(state['profiles']), 3)
        self.assertFalse(any(a['status'] == 'submitted' for a in state['applications']))
        for application in state['applications']:
            self.assertEqual(packages.changed(self.root / 'example', application), [])
        config = json.loads((self.root / 'example/workspace.json').read_text())
        self.assertTrue(config['demo'])
        self.assertEqual((self.config / 'location.json').read_bytes(), self.sentinel)
        self.assertEqual(sorted(p.name for p in self.config.iterdir()), ['location.json'])
        self.assertIn('fictional', (self.root / 'example/master/main.txt').read_text())

    def test_existing_destination_and_symlink_are_rejected_without_changes(self):
        target = self.root / 'personal'
        target.mkdir()
        (target / 'state.json').write_bytes(b'original')
        with self.assertRaisesRegex(ValueError, 'new destination'):
            demo.create(target)
        self.assertEqual((target / 'state.json').read_bytes(), b'original')
        if os.name != 'nt':
            alias = self.root / 'alias'
            alias.symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                demo.create(alias)

    def test_reopen_rejects_real_data_before_opening_a_store(self):
        folder = self.root / 'personal'
        folder.mkdir()
        (folder / 'state.json').write_bytes(b'original')
        with patch('employment_agency.demo.Workspace', side_effect=AssertionError('Must not open real data')):
            with self.assertRaises(ValueError):
                demo.open_existing(folder)
        self.assertEqual((folder / 'state.json').read_bytes(), b'original')

    def test_cli_existing_destination_has_an_actionable_error_without_traceback(self):
        result = subprocess.run([sys.executable, '-m', 'employment_agency', 'demo', str(self.root)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('existing folders are never overwritten', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_reopen_missing_state_does_not_silently_initialize_an_empty_workspace(self):
        target = self.root / 'damaged-demo'
        (target / 'records').mkdir(parents=True)
        (target / 'workspace.json').write_text('{"demo":true}')
        (target / 'records/demo.json').write_text('{"fictional_candidate":true}')
        with self.assertRaises(ValueError):
            demo.open_existing(target)
        self.assertFalse((target / 'state.json').exists())

    def test_failed_generation_does_not_publish_partial_workspace(self):
        with patch('employment_agency.service.Service.prepare', side_effect=ValueError('Fixture validation failure')):
            with self.assertRaisesRegex(ValueError, 'validation failure'):
                demo.create(self.root / 'failed')
        self.assertFalse((self.root / 'failed').exists())
        self.assertEqual((self.config / 'location.json').read_bytes(), self.sentinel)

    def test_demo_serve_restores_configuration_after_startup_failure(self):
        with patch('employment_agency.server.server', side_effect=OSError('Fixture occupied port')):
            with self.assertRaises(OSError):
                demo.serve(self.root / 'new-demo', 0)
        self.assertEqual(os.environ['EA_CONFIG_HOME'], str(self.config))
        self.assertEqual((self.config / 'location.json').read_bytes(), self.sentinel)
