"""Development process ownership and failure cleanup; disposable workspaces only."""
from contextlib import contextmanager, redirect_stderr
import io
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from unittest.mock import patch

from employment_agency import cli, development
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.store import Workspace

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = '''
import json, os, sys
from http.server import BaseHTTPRequestHandler
from socketserver import TCPServer
if os.environ.get('EA_FIXTURE_EXIT'):
    sys.exit(7)
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        body = json.dumps({key: os.environ[key] for key in ('NODE_ENV', 'EA_BACKEND_URL')}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)
# The stand-in frontend, like Next.js, does not need HTTPServer's reverse DNS.
TCPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
'''
LAUNCH = '''
from pathlib import Path
import faulthandler
import sys
from unittest.mock import patch
from employment_agency import cli
folder, script, port = sys.argv[1:4]
sys.argv = ['employment-agency', *sys.argv[4:]]
with patch('employment_agency.development.frontend_command', return_value=(Path(folder), [sys.executable, script, port])):
    faulthandler.dump_traceback_later(8, repeat=True)
    try:
        cli.main()
    finally:
        faulthandler.cancel_dump_traceback_later()
'''


def free_ports():
    with socket.socket() as backend, socket.socket() as frontend:
        backend.bind(('127.0.0.1', 0))
        frontend.bind(('127.0.0.1', 0))
        return backend.getsockname()[1], frontend.getsockname()[1]


class Development(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ea-development-test-')
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace'
        self.frontend = self.root / 'frontend.py'
        self.frontend.write_text(FRONTEND)
        self.backend_port, self.frontend_port = free_ports()

    def tearDown(self):
        self.temp.cleanup()

    def command(self):
        return [sys.executable, '-c', LAUNCH, str(self.root), str(self.frontend), str(self.frontend_port),
                '--workspace', str(self.workspace), 'dev', '--port', str(self.backend_port),
                '--frontend-port', str(self.frontend_port)]

    def environment(self, **extra):
        return {**os.environ, 'PYTHONPATH': str(ROOT), 'EA_CONFIG_HOME': str(self.root / 'config'),
                'NODE_ENV': 'production', 'EA_BACKEND_URL': 'http://example.test', **extra}

    @contextmanager
    def launch(self, **extra):
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen(self.command(), cwd=self.root, env=self.environment(**extra),
                                       stdout=log, stderr=log,
                                       **({'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {}))
            try:
                yield process
            except BaseException:
                # Cleanup can exit successfully after a failed readiness check.
                # Keep the child diagnostics even when its final code is zero.
                log.seek(0)
                print(log.read().decode(), file=sys.stderr)
                raise
            finally:
                if process.poll() is None:
                    if os.name == 'nt':
                        process.send_signal(signal.CTRL_BREAK_EVENT)
                    else:
                        process.terminate()
                    process.wait(timeout=10)
                if process.returncode not in (0, 7):
                    log.seek(0)
                    print(log.read().decode(), file=sys.stderr)

    def get(self, port, path='/api/state'):
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=1) as response:
            return json.load(response)

    def ready(self, process):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            self.assertIsNone(process.poll(), 'Development app exited during startup')
            try:
                self.get(self.backend_port)
                return self.get(self.frontend_port, '/')
            except OSError:
                time.sleep(.05)
        self.fail('Development servers did not start')

    def assert_released(self, *workspaces):
        development.check_ports(self.backend_port, self.frontend_port)
        for path in workspaces or (self.workspace,):
            opened = Workspace(path)
            opened.close()

    def test_loopback_backend_start_does_not_wait_for_reverse_dns(self):
        workspace = Workspace(self.workspace)
        try:
            with patch('socket.getfqdn', side_effect=AssertionError('Loopback startup must not resolve DNS')):
                http = server(Service(workspace), 0)
            try:
                self.assertEqual(http.server_name, '127.0.0.1')
                self.assertGreater(http.server_port, 0)
            finally:
                http.server_close()
        finally:
            workspace.close()

    def test_backend_bind_failure_preserves_the_original_error(self):
        workspace = Workspace(self.workspace)
        try:
            with patch('socketserver.TCPServer.server_bind', side_effect=OSError('Fixture bind failure')):
                with self.assertRaisesRegex(OSError, 'Fixture bind failure'):
                    server(Service(workspace), 0)
        finally:
            workspace.close()

    @unittest.skipIf(os.name == 'nt', 'Console Ctrl+C is exercised on POSIX; Windows uses a separate process group')
    def test_ctrl_c_stops_both_servers_and_preserves_workspace(self):
        original = Workspace(self.workspace)
        original.close()
        before = (self.workspace / 'state.json').read_bytes()
        with self.launch() as process:
            env = self.ready(process)
            self.assertEqual(env, {'NODE_ENV': 'development',
                                   'EA_BACKEND_URL': f'http://127.0.0.1:{self.backend_port}'})
            process.send_signal(signal.SIGINT)
            self.assertEqual(process.wait(timeout=10), 0)
        self.assert_released()
        self.assertEqual((self.workspace / 'state.json').read_bytes(), before)

    @unittest.skipIf(os.name == 'nt', 'Windows termination bypasses Python handlers; console Ctrl+C stops the app')
    def test_termination_stops_both_servers(self):
        with self.launch() as process:
            self.ready(process)
            process.terminate()
            self.assertEqual(process.wait(timeout=10), 0)
        self.assert_released()

    def test_frontend_failure_returns_its_error_and_releases_backend(self):
        with self.launch(EA_FIXTURE_EXIT='1') as process:
            self.assertEqual(process.wait(timeout=10), 7)
        self.assert_released()

    def test_occupied_ports_leave_the_existing_listener_untouched(self):
        for target in ('backend_port', 'frontend_port'):
            with self.subTest(target=target), socket.socket() as owner:
                owner.bind(('127.0.0.1', 0))
                owner.listen()
                setattr(self, target, owner.getsockname()[1])
                result = subprocess.run(self.command(), cwd=self.root, env=self.environment(), capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertIn('Stop the existing app', result.stderr)
                self.assertNotIn('Traceback', result.stderr)
                self.assertFalse(self.workspace.exists())
                with socket.create_connection(owner.getsockname(), timeout=1):
                    pass
            self.backend_port, self.frontend_port = free_ports()

    def test_locked_workspace_has_an_actionable_error_and_preserves_owner(self):
        owner = Workspace(self.workspace)
        try:
            before = (self.workspace / 'state.json').read_bytes()
            result = subprocess.run(self.command(), cwd=self.root, env=self.environment(), capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('Stop the existing app with Ctrl+C', result.stderr)
            self.assertNotIn('Traceback', result.stderr)
            self.assertFalse(owner.handle.closed)
            self.assertEqual((self.workspace / 'state.json').read_bytes(), before)
        finally:
            owner.close()
        self.assert_released()

    def test_folder_switch_shutdown_releases_the_current_workspace(self):
        other = self.root / 'other-workspace'
        with self.launch() as process:
            self.ready(process)
            token = self.get(self.backend_port)['token']
            request = urllib.request.Request(f'http://127.0.0.1:{self.backend_port}/api/workspace-create',
                data=json.dumps({'path': str(other)}).encode(), headers={'Content-Type': 'application/json',
                    'Origin': f'http://127.0.0.1:{self.frontend_port}', 'X-Workspace-Token': token})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
        self.assert_released(self.workspace, other)

    def test_failed_child_start_releases_workspace_and_restores_signal_handlers(self):
        handlers = {name: signal.getsignal(name) for name in (signal.SIGINT, signal.SIGTERM)}
        with patch('employment_agency.development.frontend_command', return_value=(self.root, ['unused'])), \
                patch('employment_agency.development.subprocess.Popen', side_effect=OSError('Fixture launch failure')):
            with self.assertRaisesRegex(OSError, 'Fixture launch failure'):
                development.run(self.workspace, self.backend_port, self.frontend_port)
        self.assert_released()
        self.assertEqual({name: signal.getsignal(name) for name in handlers}, handlers)

    def test_missing_node_or_dependencies_do_not_create_workspace(self):
        with patch('employment_agency.development.shutil.which', return_value=None):
            with self.assertRaisesRegex(ValueError, 'Node.js 24'):
                development.run(self.workspace)
        with patch('pathlib.Path.is_file', side_effect=[True, False]), \
                patch('employment_agency.development.shutil.which', return_value='node'):
            with self.assertRaisesRegex(ValueError, 'npm --prefix frontend ci --ignore-scripts'):
                development.run(self.workspace)
        self.assertFalse(self.workspace.exists())

    def test_installed_release_has_a_source_checkout_message(self):
        with patch('pathlib.Path.is_file', return_value=False):
            with self.assertRaisesRegex(ValueError, 'source checkout'):
                development.run(self.workspace)
        self.assertFalse(self.workspace.exists())

    def test_port_validation_does_not_create_workspace(self):
        for ports in [(3000, 3000), (0, 3000), (8766, 65536)]:
            with self.subTest(ports=ports):
                with patch('employment_agency.development.frontend_command', return_value=(self.root, ['unused'])):
                    with self.assertRaises(ValueError):
                        development.run(self.workspace, *ports)
        self.assertFalse(self.workspace.exists())

    def test_cli_uses_remembered_workspace_by_default(self):
        with patch.object(sys, 'argv', ['employment-agency', 'dev']), \
                patch('employment_agency.cli.selected_workspace', return_value=self.workspace) as selection, \
                patch('employment_agency.development.run', return_value=0) as run, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as done:
                cli.main()
        self.assertEqual(done.exception.code, 0)
        selection.assert_called_once_with(None)
        run.assert_called_once_with(self.workspace, 8766, 3000)
