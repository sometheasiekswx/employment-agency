"""Real private gateway contracts with disposable data and no external services."""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import json
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
import unittest

from employment_agency.development_gateway import configuration
from employment_agency.server import server
import test_workflow as fixtures

ORIGIN = 'https://workstation.tail-example.ts.net'
HOST = 'workstation.tail-example.ts.net'
OWNER = 'owner@example.test'


def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


class Frontend(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() == 'websocket':
            key = self.headers['Sec-WebSocket-Key']
            accept = base64.b64encode(hashlib.sha1(
                (key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101)
            self.send_header('Upgrade', 'websocket')
            self.send_header('Connection', 'Upgrade')
            self.send_header('Sec-WebSocket-Accept', accept)
            self.end_headers()
            # One short masked client text frame, echoed through the real proxy.
            first, second = self.rfile.read(2)
            mask = self.rfile.read(4)
            body = self.rfile.read(second & 127)
            text = bytes(value ^ mask[i % 4] for i, value in enumerate(body))
            self.wfile.write(bytes([first, len(text)]) + text)
            return
        body = b'Fictional live frontend'
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@unittest.skipUnless(shutil.which('caddy'), 'Private live gateway requires Caddy')
class PrivateGateway(unittest.TestCase):
    def setUp(self):
        fixtures.Workflow.setUp(self)
        self.port = free_port()
        self.local_origin = f'http://127.0.0.1:{self.port}'
        self.backend = server(self.s, 0, frontend_origin=self.local_origin,
                              tailscale_origin=ORIGIN, tailscale_user=OWNER)
        self.frontend = ThreadingHTTPServer(('127.0.0.1', 0), Frontend)
        self.threads = [threading.Thread(target=http.serve_forever, daemon=True)
                        for http in (self.backend, self.frontend)]
        for thread in self.threads:
            thread.start()
        config = self.root / 'Caddyfile'
        config.write_text(configuration(self.backend.server_port, self.frontend.server_port,
                                        self.port, ORIGIN))
        check = subprocess.run(['caddy', 'validate', '--adapter', 'caddyfile', '--config', str(config)],
                               capture_output=True, text=True)
        self.assertEqual(check.returncode, 0, check.stderr)
        self.proxy = subprocess.Popen(['caddy', 'run', '--adapter', 'caddyfile', '--config', str(config)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                if self.request('/api/runtime')[0] == 200:
                    return
            except OSError:
                time.sleep(.03)
        self.fail('Gateway did not become ready')

    def tearDown(self):
        if hasattr(self, 'proxy'):
            self.proxy.terminate()
            self.proxy.wait(timeout=5)
        for http in (self.frontend, self.backend):
            http.shutdown()
            http.server_close()
        for thread in self.threads:
            thread.join()
        fixtures.Workflow.tearDown(self)

    def remote(self):
        return {'Host': HOST, 'X-Forwarded-Host': HOST, 'X-Forwarded-Proto': 'https',
                'Tailscale-User-Login': OWNER}

    def request(self, path='/', headers=None, data=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            body = json.dumps(data).encode() if data is not None else None
            connection.request('POST' if body else 'GET', path, body=body,
                               headers={**({'Content-Type': 'application/json'} if body else {}),
                                        **(headers or {})})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_owner_and_local_browser_can_read_and_save_with_origin_and_token(self):
        for headers, origin in [({}, self.local_origin), (self.remote(), ORIGIN)]:
            with self.subTest(origin=origin):
                status, raw = self.request('/api/state', headers)
                self.assertEqual(status, 200)
                token = json.loads(raw)['token']
                valid = {**headers, 'Origin': origin, 'X-Workspace-Token': token}
                self.assertEqual(self.request('/api/identity', valid, {'name': 'Live fixture'})[0], 200)
                self.assertEqual(self.request('/api/identity', {**valid, 'X-Workspace-Token': 'bad'}, {})[0], 403)
                self.assertEqual(self.request('/api/identity', {**valid, 'Origin': 'https://evil.test'}, {})[0], 403)
                self.assertEqual(self.request('/discover/', headers), (200, b'Fictional live frontend'))

    def test_pages_and_api_reject_missing_or_wrong_owner_and_funnel(self):
        for changed in [{'Tailscale-User-Login': ''}, {'Tailscale-User-Login': 'other@example.test'},
                        {'Tailscale-Funnel-Request': '?1'}, {'Tailscale-Funnel-Request': ''},
                        {'X-Forwarded-Proto': 'http'}, {'X-Forwarded-Host': 'evil.test'}]:
            headers = {**self.remote(), **changed}
            for path in ['/discover/', '/api/state', '/_next/static/chunk.js']:
                with self.subTest(changed=changed, path=path):
                    self.assertEqual(self.request(path, headers)[0], 403)

    def test_localhost_spoofing_cannot_bypass_remote_authentication(self):
        for headers in [{'Tailscale-User-Login': OWNER}, {'Tailscale-Funnel-Request': ''},
                        {'X-Forwarded-Proto': 'https'}, {'X-Forwarded-Host': HOST},
                        {'Forwarded': 'proto=https'}]:
            for path in ['/', '/api/state']:
                with self.subTest(headers=headers, path=path):
                    self.assertEqual(self.request(path, headers)[0], 403)

    def websocket(self, headers):
        with socket.create_connection(('127.0.0.1', self.port), timeout=5) as client:
            fields = {'Host': f'127.0.0.1:{self.port}', 'Connection': 'Upgrade',
                      'Upgrade': 'websocket', 'Sec-WebSocket-Version': '13',
                      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', **headers}
            raw = 'GET /_next/webpack-hmr HTTP/1.1\r\n' + ''.join(
                f'{key}: {value}\r\n' for key, value in fields.items()) + '\r\n'
            client.sendall(raw.encode())
            response = b''
            while b'\r\n\r\n' not in response:
                response += client.recv(1)
            code = int(response.split(b' ')[1])
            if code == 101:
                client.sendall(b'\x81\x82abcd' + bytes([ord('o') ^ ord('a'), ord('k') ^ ord('b')]))
                self.assertEqual(client.recv(4), b'\x81\x02ok')
            return code

    def test_hmr_upgrade_is_bidirectional_and_requires_owner(self):
        self.assertEqual(self.websocket(self.remote()), 101)
        self.assertEqual(self.websocket({}), 101)
        self.assertEqual(self.websocket({**self.remote(), 'Tailscale-User-Login': 'other@example.test'}), 403)


class DevelopmentReadiness(unittest.TestCase):
    setUp = fixtures.Workflow.setUp
    tearDown = fixtures.Workflow.tearDown

    def test_readiness_tracks_active_work_without_reading_full_state(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        http = server(self.s, 0, frontend_origin='http://127.0.0.1:3000')
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        try:
            import urllib.request
            with patch.object(self.s, 'state', side_effect=AssertionError('Do not scan files for readiness')):
                for busy in (True, False):
                    self.s.worker = SimpleNamespace(is_alive=lambda: busy)
                    with urllib.request.urlopen(f'http://127.0.0.1:{http.server_port}/api/development') as r:
                        value = json.load(r)
                    self.assertEqual(value['reload_safe'], not busy)
                    self.assertEqual(value['workspace'], str(self.w.path))
        finally:
            self.s.worker = None
            http.shutdown()
            http.server_close()
            thread.join()

    def test_development_shutdown_keeps_workspace_open_until_worker_finishes(self):
        finished = threading.Event()
        self.s.worker = threading.Thread(target=finished.wait)
        self.s.worker.start()
        http = server(self.s, 0, frontend_origin='http://127.0.0.1:3000')
        closing = threading.Thread(target=http.server_close)
        closing.start()
        try:
            closing.join(timeout=.1)
            self.assertTrue(closing.is_alive())
            self.assertFalse(self.w.handle.closed)
        finally:
            finished.set()
            closing.join(timeout=3)
        self.assertFalse(closing.is_alive())
        self.assertTrue(self.w.handle.closed)
