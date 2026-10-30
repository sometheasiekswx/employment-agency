"""Contracts at the static frontend / Python service boundary."""
import base64
import hashlib
from pathlib import Path
import tempfile
import json
import threading
import unittest
import urllib.request
import urllib.error
import io
import zipfile
from unittest.mock import patch

from employment_agency import history
from employment_agency.hosted import app
from employment_agency.web_assets import asset, script_policy, MissingFrontendError
from employment_agency.cloud import execute
from employment_agency.server import server
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
        request = urllib.request.Request(self.url + '/career/', method='HEAD')
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertGreater(int(response.headers['Content-Length']), 0)
            self.assertEqual(response.read(), b'')
        with urllib.request.urlopen(self.url + '/api/runtime') as response:
            self.assertEqual(json.load(response), {'mode': 'local'})

    def test_default_server_rejects_the_development_origin(self):
        self.start()
        self.assertEqual(self.post('http://127.0.0.1:3000'), 403)
        self.assertEqual(self.post(self.url), 200)

    def test_local_export_download_round_trip(self):
        self.start()
        with urllib.request.urlopen(self.url + '/api/state') as response:
            token = json.load(response)['token']
        request = urllib.request.Request(self.url + '/api/export', data=b'{}', headers={'Origin': self.url, 'X-Workspace-Token': token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            name = json.load(response)['result']['file']
        with urllib.request.urlopen(self.url + '/exports/' + name) as response:
            with zipfile.ZipFile(io.BytesIO(response.read())) as archive:
                self.assertIn('state.json', archive.namelist())

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
