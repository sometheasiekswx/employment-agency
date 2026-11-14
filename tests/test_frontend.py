"""Contracts at the static frontend / Python service boundary."""
import base64
import hashlib
import http.client
import json
import re
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from employment_agency import history, providers, store
from employment_agency.hosted import app
from employment_agency.web_assets import asset, script_policy, MissingFrontendError
from employment_agency.cloud import execute
from employment_agency.server import server
from employment_agency.service import Service
import test_workflow
from test_cloud import Backend, OWNER, OTHER


class FrontendHttpContracts(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp

    def tearDown(self):
        if hasattr(self, 'http'):
            self.http.shutdown(); self.http.server_close(); self.thread.join()
        test_workflow.Workflow.tearDown(self)

    def start(self, frontend_origin=None):
        self.http = server(self.s, 0, frontend_origin=frontend_origin)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.http.server_port)

    def test_listing_frame_policy_is_scoped_and_rejects_local_or_injected_hosts(self):
        self.start()
        path = '/api/listing-preview-frame'
        for host in ('127.0.0.1', '[::1]', 'test.local', 'device.a.ts.net',
                     'preview.example.com%3B%20default-src', 'preview.example.com&host=other.example.com'):
            with self.subTest(host=host):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(self.url + path + '?host=' + host)
                self.assertEqual(error.exception.code, 400)
                self.assertIn("frame-ancestors 'none'", error.exception.headers['Content-Security-Policy'])
                error.exception.close()

        with urllib.request.urlopen(self.url + path + '?host=preview.example.com') as response:
            html = response.read().decode()
            policy = response.headers.get_all('Content-Security-Policy')
            self.assertEqual(len(policy), 1)
            self.assertIn('frame-src https://preview.example.com;', policy[0])
            self.assertIn("frame-ancestors 'self'", policy[0])
            self.assertEqual(response.headers['X-Frame-Options'], 'SAMEORIGIN')
            self.assertEqual(response.headers['Referrer-Policy'], 'no-referrer')
            self.assertIn('sandbox referrerpolicy="no-referrer"', html)
            self.assertIn('window.parent === window', html)

        with urllib.request.urlopen(self.url + '/api/runtime') as response:
            self.assertIn("frame-src 'self' blob:; frame-ancestors 'none'", response.headers['Content-Security-Policy'])

    def test_hosted_listing_frame_has_the_same_restricted_policy(self):
        client = app.test_client()
        response = client.get('/api/listing-preview-frame?host=preview.example.com')
        self.assertEqual(response.status_code, 200)
        policy = response.headers.get_all('Content-Security-Policy')
        self.assertEqual(len(policy), 1)
        self.assertIn('frame-src https://preview.example.com;', policy[0])
        self.assertIn("frame-ancestors 'self'", policy[0])
        self.assertEqual(client.get('/api/listing-preview-frame?host=foo.internal').status_code, 400)

    def test_parallel_frontend_asset_burst_returns_complete_files(self):
        self.start()
        with urllib.request.urlopen(self.url) as response:
            html = response.read().decode()
        paths = re.findall(r'<script[^>]+src="([^"]+)"', html)
        self.assertTrue(paths)
        def fetch(path):
            with urllib.request.urlopen(self.url + path, timeout=10) as response:
                self.assertEqual(response.status, 200)
                return response.read()
        expected = {path: fetch(path) for path in paths}
        burst = (paths * 6)[:32]
        with ThreadPoolExecutor(max_workers=16) as pool:
            bodies = list(pool.map(fetch, burst))
        for path, body in zip(burst, bodies):
            self.assertEqual(body, expected[path])

    def post(self, origin):
        with urllib.request.urlopen(self.url + '/api/state') as response:
            token = json.load(response)['token']
        headers = {'X-Workspace-Token': token, 'Content-Type': 'application/json'}
        if origin: headers['Origin'] = origin
        request = urllib.request.Request(self.url + '/api/identity', data=b'{"name":"Fixture update"}', headers=headers)
        try:
            with urllib.request.urlopen(request) as response: return response.status
        except urllib.error.HTTPError as error:
            code = error.code; error.close(); return code

    def test_head_supports_next_prefetch_without_a_body(self):
        self.start()
        url = self.url + '/career/'
        with urllib.request.urlopen(url, timeout=5) as get:
            expected = get.read()
            self.assertGreater(len(expected), 0)
            headers = {key: get.headers[key] for key in ('Content-Type', 'Content-Security-Policy')}
        # HTTP clients discard HEAD bodies. Inspect the wire to detect bytes the server should omit.
        with socket.create_connection(('127.0.0.1', self.http.server_port), timeout=5) as connection:
            request = (f'HEAD /career/ HTTP/1.1\r\n'
                       f'Host: 127.0.0.1:{self.http.server_port}\r\n'
                       'Connection: close\r\n\r\n')
            connection.sendall(request.encode('ascii'))
            with connection.makefile('rb') as wire:
                self.assertIn(b' 200 ', wire.readline())
                response_headers = http.client.parse_headers(wire)
                self.assertEqual(int(response_headers['Content-Length']), len(expected))
                for key, value in headers.items():
                    self.assertEqual(response_headers[key], value)
                self.assertEqual(wire.read(), b'')
        with urllib.request.urlopen(self.url + '/api/runtime', timeout=5) as response:
            self.assertEqual(json.load(response), {'mode': 'local'})

    def test_default_server_rejects_the_development_origin(self):
        self.start()
        self.assertEqual(self.post('http://127.0.0.1:3000'), 403)
        self.assertEqual(self.post(self.url), 200)

    def test_local_export_download_round_trip(self):
        self.assert_export_download_round_trip(sqlite=False)

    def test_local_sqlite_export_download_round_trip(self):
        self.w.close()
        self.w = store.Workspace(self.root / 'sqlite', sqlite=True)
        self.s = Service(self.w)
        self.assert_export_download_round_trip(sqlite=True)

    def assert_export_download_round_trip(self, *, sqlite):
        self.s.action('identity', {'name': 'Fictional export candidate', 'email': 'export@example.test'})
        fact = self.s.action('fact', {'text': 'Maintained Python APIs', 'category': 'experience'})
        self.s.action('confirm', {'id': fact['id']})
        self.s.action('consent', {
            'provider': 'agent', 'grant': True,
            'purpose': providers.PURPOSE, 'categories': providers.CATEGORIES,
        })
        self.start()
        with urllib.request.urlopen(self.url + '/api/state', timeout=5) as response:
            workspace = json.load(response)
        self.assertIn('agent', workspace['state']['consents'])
        request = urllib.request.Request(self.url + '/api/export', data=b'{}', headers={
            'Origin': self.url, 'X-Workspace-Token': workspace['token'], 'Content-Type': 'application/json',
        })
        with urllib.request.urlopen(request, timeout=5) as response:
            name = json.load(response)['result']['file']
        archive = self.root / 'download.zip'
        with urllib.request.urlopen(self.url + '/exports/' + name, timeout=5) as response:
            self.assertEqual(response.status, 200)
            archive.write_bytes(response.read())
        with zipfile.ZipFile(archive) as backup:
            exported = json.loads(backup.read('state.json'))
            if sqlite:
                self.assertEqual(exported['storage'], 'sqlite')
                exported = exported['state']
            self.assertEqual(exported['consents'], {})
        destination = self.root / 'restored'
        store.restore(archive, destination)
        restored = store.Workspace(destination, create=False)
        try:
            self.assertEqual(restored.database is not None, sqlite)
            state = restored.read()
            self.assertEqual(state['identity']['email'], 'export@example.test')
            self.assertEqual([(row['id'], row['text'], row['confirmed']) for row in state['facts']],
                             [(fact['id'], fact['text'], True)])
            self.assertEqual(state['consents'], {})
        finally:
            restored.close()

    def test_development_origin_is_explicit_exact_and_still_requires_a_token(self):
        self.start('http://127.0.0.1:3000')
        self.assertEqual(self.post('http://127.0.0.1:3000'), 200)
        self.assertEqual(self.post('http://127.0.0.1:3001'), 403)
        self.assertEqual(self.post(None), 403)
        request = urllib.request.Request(self.url + '/api/identity', data=b'{}', headers={'Origin': 'http://127.0.0.1:3000', 'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()

    def test_development_origin_cannot_be_a_public_or_wildcard_origin(self):
        for origin in ['https://example.test', 'http://0.0.0.0:3000', '*', 'http://127.0.0.1:3000/path']:
            with self.assertRaises(ValueError):
                server(self.s, 0, frontend_origin=origin)


class FrontendAssets(unittest.TestCase):
    def test_exact_inline_bootstrap_hashes_without_unsafe_inline(self):
        source = 'self.__next_f.push([1,"fixture"]);'
        policy = script_policy('<script src="/external.js"></script><script>' + source + '</script>')
        expected = base64.b64encode(hashlib.sha256(source.encode()).digest()).decode()
        self.assertIn("'sha256-" + expected + "'", policy)
        self.assertNotIn('unsafe-inline', policy)
        self.assertEqual(script_policy('<script src="/external.js"></script>'), "script-src 'self'")

    def test_routes_only_resolve_packaged_files_and_never_follow_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            (root / 'index.html').write_text('Fixture')
            (root / 'career').mkdir()
            (root / 'career/index.html').write_text('Career fixture')
            with patch('employment_agency.web_assets.ROOT', root):
                self.assertEqual(asset('/'), root / 'index.html')
                self.assertEqual(asset('/career/'), root / 'career/index.html')
                self.assertEqual(asset('/career'), root / 'career/index.html')
                self.assertIsNone(asset('/missing.js'))
                for path in ['/../state.json', '/nested/../../state.json', '/x\\y']:
                    with self.assertRaises(ValueError):
                        asset(path)
                outside = root / 'outside'; outside.mkdir()
                (root / 'shortcut').symlink_to(outside, target_is_directory=True)
                with self.assertRaises(ValueError):
                    asset('/shortcut/file')

    def test_missing_build_has_a_specific_error(self):
        with tempfile.TemporaryDirectory() as temp, patch('employment_agency.web_assets.ROOT', Path(temp)):
            with self.assertRaisesRegex(MissingFrontendError, 'npm run build'):
                asset('/')

    def test_hosted_bootstrap_and_deep_routes_use_the_same_export_and_csp(self):
        client = app.test_client()
        self.assertEqual(client.get('/api/runtime').json, {'mode': 'hosted'})
        for route in ['/', '/career/', '/search/', '/settings/', '/history/']:
            response = client.get(route)
            self.assertEqual(response.status_code, 200, route)
            self.assertIn(b'/_next/', response.data)
            self.assertIn("'sha256-", response.headers['Content-Security-Policy'])
            self.assertNotIn('unsafe-inline', response.headers['Content-Security-Policy'])
            self.assertNotIn(b'state.json', response.data)
        missing = client.get('/missing-page/')
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.mimetype, 'text/html')
        self.assertEqual(client.get('/missing-script.js').mimetype, 'application/json')


class HistoryContracts(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def test_metadata_and_files_cover_canonical_versions_and_reject_edits(self):
        _, profile, job = self.seed()
        application = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        before = (self.w.path / 'state.json').read_bytes()
        versions = self.s.action('history', {})
        self.assertEqual(len(versions), 1)
        version = versions[0]
        filename = application['documents']['resume.pdf']
        self.assertIn(filename, version['files'])
        self.assertEqual(history.verified_file(self.w.path, version['id'], filename), self.w.path / application['folder'] / filename)
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        with self.assertRaises(ValueError):
            history.verified_file(self.w.path, version['id'], '../state.json')
        (self.w.path / application['folder'] / filename).write_bytes(b'Externally changed')
        with self.assertRaisesRegex(ValueError, 'Document changed'):
            history.verified_file(self.w.path, version['id'], filename)

    def test_hosted_history_is_read_only_and_owner_scoped(self):
        _, profile, job = self.seed()
        self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        archive = self.root / 'history.zip'; self.w.export(archive)
        backend = Backend(); backend.commit(OWNER, 0, archive.read_bytes())
        versions = execute(backend, OWNER, 'history', {})['result']
        self.assertEqual(len(versions), 1)
        self.assertEqual(execute(backend, OTHER, 'history', {})['result'], [])
        filename = next(name for name in versions[0]['files'] if name.endswith('.pdf'))
        result = execute(backend, OWNER, 'history-file', {'id': versions[0]['id'], 'name': filename})
        self.assertTrue(result['binary'].startswith(b'%PDF'))
        with self.assertRaises(ValueError):
            execute(backend, OTHER, 'history-file', {'id': versions[0]['id'], 'name': filename})
        self.assertEqual(backend.record(OWNER)['revision'], 1)
