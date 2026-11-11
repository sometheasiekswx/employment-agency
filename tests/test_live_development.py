"""Private live process lifecycle and source reloads, using only fictional data."""
from contextlib import redirect_stderr
import io
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from unittest.mock import patch

from employment_agency import cli, live_development
from employment_agency.store import Workspace
from test_development import FRONTEND, LAUNCH, ROOT

ORIGIN = 'https://workstation.tail-example.ts.net'
OWNER = 'owner@example.test'


def free_ports():
    sockets = [socket.socket() for _ in range(3)]
    try:
        for probe in sockets:
            probe.bind(('127.0.0.1', 0))
        return [probe.getsockname()[1] for probe in sockets]
    finally:
        for probe in sockets:
            probe.close()


class PrivateDevelopment(unittest.TestCase):
    def test_cli_requires_all_private_settings_before_selecting_workspace(self):
        for arguments in [ ['--gateway-port', '8767'],
                           ['--tailscale-origin', ORIGIN, '--tailscale-user', OWNER],
                           ['--gateway-port', '8767', '--tailscale-origin', ORIGIN] ]:
            with self.subTest(arguments=arguments), patch.object(sys, 'argv', ['ea', 'dev', *arguments]), \
                    patch('employment_agency.cli.selected_workspace') as selection, redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as result:
                    cli.main()
                self.assertEqual(result.exception.code, 2)
                selection.assert_not_called()

    def test_invalid_ports_and_missing_caddy_never_open_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / 'unused'
            with patch('employment_agency.development.frontend_command', return_value=(ROOT, ['unused'])), \
                    patch('employment_agency.live_development.Workspace') as opened:
                for ports in [(3000, 3000, 8766), (8767, 3000, 3000), (0, 3000, 8766)]:
                    with self.assertRaises(ValueError):
                        live_development.run(workspace, *ports, ORIGIN, OWNER)
                with patch('employment_agency.live_development.shutil.which', return_value=None):
                    with self.assertRaisesRegex(ValueError, 'requires Caddy'):
                        live_development.run(workspace, *free_ports(), ORIGIN, OWNER)
                opened.assert_not_called()
            self.assertFalse(workspace.exists())

    @unittest.skipUnless(shutil.which('caddy') and os.name != 'nt', 'Caddy and POSIX signal proof')
    def test_reload_busy_deferral_workspace_switch_error_recovery_and_shutdown(self):
        with tempfile.TemporaryDirectory(prefix='ea-private-live-test-') as directory:
            stage = Path(directory).resolve()
            package = stage / 'employment_agency'
            shutil.copytree(ROOT / 'employment_agency', package,
                            ignore=shutil.ignore_patterns('__pycache__', 'web'))
            source = package / 'server.py'
            original = source.read_text().replace(
                "return self.send(200, encode({'reload_safe': not busy,",
                "busy = busy or (current.w.path / 'busy.fixture').exists()\n"
                "                return self.send(200, encode({'reload_safe': not busy,")
            self.assertIn("busy.fixture", original)
            source.write_text(original)
            frontend = stage / 'frontend.py'
            frontend.write_text(FRONTEND.replace('body = json.dumps({key:', 'body = json.dumps({"pid": os.getpid(), **{key:')
                                .replace("'EA_BACKEND_URL')}).encode()", "'EA_BACKEND_URL')}}).encode()"))
            workspace, other = stage / 'workspace', stage / 'other'
            backend, next_port, gateway = ports = free_ports()
            base = f'http://127.0.0.1:{gateway}'
            command = [sys.executable, '-c', LAUNCH, str(stage), str(frontend), str(next_port),
                       '--workspace', str(workspace), 'dev', '--port', str(backend),
                       '--frontend-port', str(next_port), '--gateway-port', str(gateway),
                       '--tailscale-origin', ORIGIN, '--tailscale-user', OWNER]
            env = {**os.environ, 'PYTHONPATH': str(stage), 'EA_CONFIG_HOME': str(stage / 'config')}
            with patch.dict(os.environ, {'EA_CONFIG_HOME': env['EA_CONFIG_HOME']}):
                Workspace(workspace).close()

            def get(path, port=gateway):
                with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=2) as response:
                    return json.load(response)

            def until(condition, process, timeout=15):
                deadline = time.monotonic() + timeout
                while time.monotonic() < deadline:
                    self.assertIsNone(process.poll(), 'Live supervisor exited')
                    try:
                        value = condition()
                        if value:
                            return value
                    except (OSError, ValueError):
                        pass
                    time.sleep(.1)
                self.fail('Live process condition timed out')

            def released():
                for port in ports:
                    with socket.socket() as probe:
                        self.assertNotEqual(probe.connect_ex(('127.0.0.1', port)), 0)
                for path in (workspace, other):
                    store = Workspace(path)
                    store.close()

            with tempfile.TemporaryFile() as log:
                process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log)
                try:
                    frontend_pid = until(lambda: get('/').get('pid'), process)
                    info = get('/api/development')
                    state = get('/api/state')
                    request = urllib.request.Request(base + '/api/workspace-create',
                        data=json.dumps({'path': str(other)}).encode(),
                        headers={'Content-Type': 'application/json', 'Origin': base,
                                 'X-Workspace-Token': state['token']})
                    with urllib.request.urlopen(request) as response:
                        self.assertEqual(response.status, 200)
                    # Private data changes alone must not restart the backend.
                    (other / 'unwatched.txt').write_text('fictional private data')
                    time.sleep(1.1)
                    self.assertEqual(get('/api/development')['pid'], info['pid'])
                    (other / 'busy.fixture').touch()
                    updated = original.replace("{'mode': 'local'}", "{'mode': 'local', 'reload_proof': 'saved-code'}")
                    source.write_text(updated)
                    time.sleep(1.6)
                    self.assertEqual(get('/api/development')['pid'], info['pid'], 'Wait for active work')
                    (other / 'busy.fixture').unlink()
                    until(lambda: get('/api/runtime').get('reload_proof') == 'saved-code', process)
                    reloaded = get('/api/development')
                    self.assertNotEqual(reloaded['pid'], info['pid'])
                    self.assertEqual(reloaded['workspace'], str(other), 'Retain the selected workspace')
                    self.assertEqual(get('/')['pid'], frontend_pid, 'Retain live frontend across reloads')
                    # Deliberately preserve the timestamp and file size that a
                    # normal bytecode cache uses, while changing saved source.
                    stamp = source.stat()
                    source.write_text(updated.replace('saved-code', 'fresh-code'))
                    os.utime(source, ns=(stamp.st_atime_ns, stamp.st_mtime_ns + 1))
                    until(lambda: get('/api/runtime').get('reload_proof') == 'fresh-code', process)
                    # A failed Python edit is recoverable by saving a correction.
                    source.write_text(updated + '\nthis is invalid python!\n')
                    until(lambda: not self.listening(backend), process)
                    source.write_text(updated + '\n# Corrected saved source.\n')
                    until(lambda: get('/api/runtime').get('reload_proof') == 'saved-code', process)
                    self.assertEqual(get('/')['pid'], frontend_pid)
                    process.send_signal(signal.SIGINT)
                    self.assertEqual(process.wait(timeout=20), 0)
                    released()
                    process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log)
                    until(lambda: get('/').get('pid'), process)
                    process.send_signal(signal.SIGTERM)
                    self.assertEqual(process.wait(timeout=20), 0)
                    released()
                except BaseException:
                    log.seek(0)
                    print(log.read().decode()[-9000:], file=sys.stderr)
                    raise
                finally:
                    if process.poll() is None:
                        process.terminate()
                        process.wait(timeout=20)

    @staticmethod
    def listening(port):
        with socket.socket() as probe:
            return probe.connect_ex(('127.0.0.1', port)) == 0
