import json
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from employment_agency.folders import choose_folder
from employment_agency.server import server
from employment_agency.store import Workspace
import test_workflow


class NativeFolders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'Career café'
        self.path.mkdir()

    def test_platform_adapters_return_the_full_path_without_shell_interpolation(self):
        for platform, executable in [('darwin', '/usr/bin/osascript'), ('win32', 'powershell.exe'), ('linux', '/usr/bin/zenity')]:
            with self.subTest(platform=platform), patch('employment_agency.folders.sys.platform', platform), patch('employment_agency.folders.shutil.which', return_value=executable), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=0, stdout=str(self.path) + '\n')) as run:
                self.assertEqual(choose_folder(), self.path.resolve())
                self.assertEqual(run.call_args.args[0][0], executable)
                self.assertNotIn('shell', run.call_args.kwargs)
                self.assertEqual(run.call_args.kwargs['timeout'], 180)
                self.assertNotIn(str(self.path), run.call_args.args[0])

    def test_kdialog_fallback(self):
        with patch('employment_agency.folders.sys.platform', 'linux'), patch('employment_agency.folders.shutil.which', side_effect=[None, '/usr/bin/kdialog']), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=0, stdout=str(self.path) + '\n')) as run:
            self.assertEqual(choose_folder(), self.path.resolve())
            self.assertIn('--getexistingdirectory', run.call_args.args[0])

    def test_cancel_is_not_an_error(self):
        for platform, code, output in [('darwin', 0, '\n'), ('win32', 0, ''), ('linux', 1, '')]:
            with self.subTest(platform=platform), patch('employment_agency.folders.sys.platform', platform), patch('employment_agency.folders.shutil.which', return_value='/usr/bin/zenity'), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=code, stdout=output, stderr='')):
                self.assertIsNone(choose_folder())

    def test_linux_display_error_is_not_reported_as_cancellation(self):
        with patch('employment_agency.folders.sys.platform', 'linux'), patch('employment_agency.folders.shutil.which', return_value='/usr/bin/zenity'), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=1, stdout='', stderr='Cannot open display')):
            with self.assertRaisesRegex(ValueError, 'could not open'):
                choose_folder()

    def test_unavailable_or_failed_picker_has_an_actionable_error(self):
        with patch('employment_agency.folders.sys.platform', 'linux'), patch('employment_agency.folders.shutil.which', return_value=None):
            with self.assertRaisesRegex(ValueError, 'Zenity or KDialog'):
                choose_folder()
        for failure in [OSError('private path'), subprocess.TimeoutExpired('osascript', 180)]:
            with patch('employment_agency.folders.sys.platform', 'darwin'), patch('employment_agency.folders.subprocess.run', side_effect=failure):
                with self.assertRaises(ValueError) as error:
                    choose_folder()
                self.assertNotIn('private path', str(error.exception))
        with patch('employment_agency.folders.sys.platform', 'darwin'), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=2, stdout='private output')):
            with self.assertRaisesRegex(ValueError, 'could not open'):
                choose_folder()

    def test_invalid_folder_output_is_rejected(self):
        for output in ['relative\n', str(self.path / 'missing') + '\n']:
            with patch('employment_agency.folders.sys.platform', 'darwin'), patch('employment_agency.folders.subprocess.run', return_value=Mock(returncode=0, stdout=output)):
                with self.assertRaisesRegex(ValueError, 'existing folder'):
                    choose_folder()


class FolderSwitching(unittest.TestCase):
    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.http = server(self.s, 0)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.http.server_port)
        self.initial = self.state()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        test_workflow.Workflow.tearDown(self)

    def state(self):
        with urllib.request.urlopen(self.url + '/api/state', timeout=5) as response:
            return json.load(response)

    def request(self, action='workspace-browse', data=None, token=None, origin=None):
        req = urllib.request.Request(self.url + '/api/' + action, data=json.dumps(data or {}).encode(), headers={
            'Origin': origin or self.url, 'Content-Type': 'application/json',
            'X-Workspace-Token': self.initial['token'] if token is None else token,
        })
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.load(response)['result']
        except urllib.error.HTTPError as error:
            error.close()
            raise

    def test_cancellation_preserves_state_token_and_remembered_location(self):
        before = (self.w.path / 'state.json').read_bytes()
        config = self.root / 'config/location.json'
        config.parent.mkdir(exist_ok=True)
        config.write_text(json.dumps({'path': str(self.w.path)}))
        selection = config.read_bytes()
        with patch('employment_agency.server.choose_folder', return_value=None):
            self.assertEqual(self.request(), {'cancelled': True})
        self.assertEqual(self.state(), self.initial)
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        self.assertEqual(config.read_bytes(), selection)

    def test_choose_empty_folder_then_reopen_preserves_original_records(self):
        self.s.action('identity', {'name': 'Original person'})
        target = self.root / 'New workspace'; target.mkdir()
        with patch('employment_agency.server.choose_folder', return_value=target):
            self.assertTrue(self.request()['reload'])
        after = self.state()
        self.assertEqual(after['state']['identity'], {})
        self.assertNotEqual(after['token'], self.initial['token'])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('identity', {'name': 'Stale tab'})
        self.assertEqual(error.exception.code, 403)
        with patch('employment_agency.server.choose_folder', return_value=self.w.path):
            self.request(token=after['token'])
        self.assertEqual(self.state()['state']['identity']['name'], 'Original person')
        self.assertEqual(json.loads((self.root / 'config/location.json').read_text())['path'], str(self.w.path))

    def test_picker_error_and_non_workspace_folder_keep_current_workspace(self):
        target = self.root / 'unrelated'; target.mkdir()
        (target / 'notes.txt').write_text('Keep this file')
        for value in [ValueError('Folder chooser unavailable'), target]:
            kwargs = {'side_effect': value} if isinstance(value, Exception) else {'return_value': value}
            with patch('employment_agency.server.choose_folder', **kwargs), self.assertRaises(urllib.error.HTTPError) as error:
                self.request()
            self.assertEqual(error.exception.code, 400)
            self.assertEqual(self.state(), self.initial)
        self.assertFalse((target / 'state.json').exists())
        self.assertEqual((target / 'notes.txt').read_text(), 'Keep this file')

    def test_active_run_and_unauthorized_requests_never_open_picker(self):
        with patch('employment_agency.server.choose_folder') as chooser:
            for kwargs in [{'token': 'wrong'}, {'origin': 'https://example.test'}]:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    self.request(**kwargs)
                self.assertEqual(error.exception.code, 403)
            with patch.object(self.s, 'worker', Mock(is_alive=Mock(return_value=True))):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    self.request()
                self.assertEqual(error.exception.code, 400)
            chooser.assert_not_called()

    def test_locked_and_incompatible_workspaces_do_not_replace_current(self):
        target = self.root / 'other'
        other = Workspace(target)
        try:
            with patch('employment_agency.server.choose_folder', return_value=target), self.assertRaises(urllib.error.HTTPError):
                self.request()
        finally:
            other.close()
        state = json.loads((target / 'state.json').read_text()); state['schema'] = 999
        (target / 'state.json').write_text(json.dumps(state))
        with patch('employment_agency.server.choose_folder', return_value=target), self.assertRaises(urllib.error.HTTPError):
            self.request()
        self.assertEqual(self.state(), self.initial)

    def test_state_reads_remain_available_and_stale_picker_cannot_switch(self):
        opened = threading.Event(); release = threading.Event()
        target = self.root / 'picked'; target.mkdir()
        def choose():
            opened.set()
            if not release.wait(5):
                raise ValueError('Test timed out')
            return target
        with patch('employment_agency.server.choose_folder', side_effect=choose), ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.request)
            try:
                self.assertTrue(opened.wait(5))
                self.assertEqual(self.state(), self.initial)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    self.request()
                self.assertEqual(error.exception.code, 400)
                self.request('workspace-create', {'path': str(self.root / 'second')})
                release.set()
                with self.assertRaises(urllib.error.HTTPError):
                    future.result(timeout=5)
            finally:
                release.set()
        self.assertEqual(self.state()['state']['_workspace']['path'], str((self.root / 'second').resolve()))
        self.assertFalse((target / 'state.json').exists())
