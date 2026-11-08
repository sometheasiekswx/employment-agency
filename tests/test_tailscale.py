"""Private Tailscale Serve access keeps the local workspace boundary explicit."""
import http.client
import io
import json
import sys
import threading
import unittest
from unittest.mock import patch

from employment_agency import cli
from employment_agency.server import server
import test_workflow


ORIGIN = 'https://workstation.tail-example.ts.net'
HOST = 'workstation.tail-example.ts.net'
USER = 'owner@example.test'


class TailscaleHttpContracts(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp

    def tearDown(self):
        if hasattr(self, 'http'):
            self.http.shutdown()
            self.http.server_close()
            self.thread.join()
        test_workflow.Workflow.tearDown(self)

    def start(self, remote=True, frontend_origin=None):
        options = {'tailscale_origin': ORIGIN, 'tailscale_user': USER} if remote else {}
        self.http = server(self.s, 0, frontend_origin=frontend_origin, **options)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.local_host = '127.0.0.1:' + str(self.http.server_port)
        self.local_origin = 'http://' + self.local_host

    def remote_headers(self):
        return {'Host': HOST, 'X-Forwarded-Host': HOST,
                'X-Forwarded-Proto': 'https', 'Tailscale-User-Login': USER}

    def request(self, method='GET', path='/api/state', headers=None, body=None):
        entries = list(headers.items()) if isinstance(headers, dict) else list(headers or [])
        names = {name.lower() for name, _ in entries}
        if 'host' not in names:
            entries.append(('Host', self.local_host))
        if body is not None and 'content-length' not in names:
            entries.append(('Content-Length', str(len(body))))
        connection = http.client.HTTPConnection('127.0.0.1', self.http.server_port, timeout=5)
        try:
            connection.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            for name, value in entries:
                connection.putheader(name, value)
            connection.endheaders(body)
            response = connection.getresponse()
            return response.status, response.read(), dict(response.getheaders())
        finally:
            connection.close()

    def post(self, headers):
        return self.request('POST', '/api/identity',
                            {'Content-Type': 'application/json', **headers},
                            b'{"name":"Remote fixture"}')[0]

    def test_default_stays_loopback_and_rejects_remote_headers(self):
        self.start(remote=False)
        self.assertEqual(self.http.server_address[0], '127.0.0.1')
        self.assertEqual(self.request()[0], 200)
        self.assertEqual(self.request(headers=self.remote_headers())[0], 403)

    def test_owner_can_read_documents_and_mutate_with_the_current_token(self):
        self.start()
        headers = self.remote_headers()
        status, data, response_headers = self.request(headers=headers)
        self.assertEqual(status, 200)
        token = json.loads(data)['token']
        self.assertNotIn('Access-Control-Allow-Origin', response_headers)
        self.assertEqual(self.request(path='/career/', headers=headers)[0], 200)
        status, body, _ = self.request('HEAD', '/career/', headers)
        self.assertEqual((status, body), (200, b''))
        self.assertEqual(self.post({**headers, 'Origin': ORIGIN,
                                    'X-Workspace-Token': token}), 200)
        self.assertEqual(self.w.read()['identity']['name'], 'Remote fixture')
        self.assertEqual(self.request()[0], 200)

    def test_remote_reads_require_every_owner_and_proxy_header(self):
        self.start()
        valid = self.remote_headers()
        for name in valid:
            headers = {key: value for key, value in valid.items() if key != name}
            # Keep a wrong Host when removing it so the request helper cannot add a local one.
            if name == 'Host':
                headers['Host'] = 'foreign.tail-example.ts.net'
            with self.subTest(missing=name):
                self.assertEqual(self.request(headers=headers)[0], 403)
        for name, value in [('Host', 'foreign.tail-example.ts.net'),
                            ('X-Forwarded-Host', 'foreign.tail-example.ts.net'),
                            ('X-Forwarded-Proto', 'http'),
                            ('Tailscale-User-Login', 'other@example.test'),
                            ('Tailscale-Funnel-Request', '?1'),
                            ('Tailscale-Funnel-Request', '')]:
            with self.subTest(header=name, value=value):
                self.assertEqual(self.request(headers={**valid, name: value})[0], 403)
        self.assertEqual(self.w.read()['identity'], {})

    def test_remote_mutations_require_matching_origin_and_token(self):
        self.start()
        valid = self.remote_headers()
        token = json.loads(self.request(headers=valid)[1])['token']
        for origin in [None, 'https://evil.example.test', self.local_origin,
                       'http://127.0.0.1:3000', ORIGIN + '/path', 'null']:
            headers = {**valid, 'X-Workspace-Token': token}
            if origin is not None:
                headers['Origin'] = origin
            with self.subTest(origin=origin):
                self.assertEqual(self.post(headers), 403)
        for key in [None, 'invalid', '\u00e9']:
            headers = {**valid, 'Origin': ORIGIN}
            if key is not None:
                headers['X-Workspace-Token'] = key
            with self.subTest(token=key):
                self.assertEqual(self.post(headers), 403)
        self.assertEqual(self.w.read()['identity'], {})

    def test_proxy_requests_cannot_fall_through_to_local_access(self):
        self.start(frontend_origin='http://127.0.0.1:3000')
        token = json.loads(self.request()[1])['token']
        for headers in [self.remote_headers(),
                        {'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': self.local_host},
                        {'Tailscale-User-Login': USER}, {'Tailscale-Funnel-Request': ''}]:
            spoofed = {**headers, 'Host': self.local_host}
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=spoofed)[0], 403)
                self.assertEqual(self.post({**spoofed, 'Origin': self.local_origin,
                                            'X-Workspace-Token': token}), 403)
        # Next's existing HTTP development proxy continues to work.
        local = {'Host': self.local_host, 'X-Forwarded-Host': '127.0.0.1:3000',
                 'X-Forwarded-Proto': 'http', 'Origin': 'http://127.0.0.1:3000',
                 'X-Workspace-Token': token}
        self.assertEqual(self.request(headers=local)[0], 200)
        self.assertEqual(self.post(local), 200)
        # Next's rewrite router can proxy API requests before adding the protocol header.
        local.pop('X-Forwarded-Proto')
        self.assertEqual(self.request(headers=local)[0], 200)
        self.assertEqual(self.post(local), 200)

    def test_ambiguous_security_headers_and_unsupported_transfer_encoding_are_rejected(self):
        self.start()
        valid = self.remote_headers()
        token = json.loads(self.request(headers=valid)[1])['token']
        base = [*valid.items(), ('Origin', ORIGIN), ('X-Workspace-Token', token),
                ('Content-Type', 'application/json'), ('Content-Length', '2')]
        for name, value in base:
            with self.subTest(duplicate=name):
                self.assertEqual(self.request('POST', '/api/identity',
                    [*base, (name.lower(), value)], b'{}')[0], 403)
        for name in ['Host', 'Origin', 'X-Workspace-Token', 'X-Forwarded-Host',
                     'X-Forwarded-Proto', 'Tailscale-User-Login']:
            with self.subTest(combined=name):
                headers = {**valid, 'Origin': ORIGIN, 'X-Workspace-Token': token}
                headers[name] = headers[name] + ', ' + headers[name]
                self.assertEqual(self.post(headers), 403)
        for name in ['X_Forwarded_Host', 'X_Workspace_Token', 'Tailscale_User_Login',
                     'Tailscale_Funnel_Request']:
            with self.subTest(underscore=name):
                self.assertEqual(self.request(headers={**valid, name: USER})[0], 403)
        self.assertEqual(self.request('POST', '/api/identity',
            [*base, ('Transfer-Encoding', 'chunked')], b'{}')[0], 403)
        self.assertEqual(self.w.read()['identity'], {})


class TailscaleConfiguration(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown

    def test_invalid_options_fail_before_binding(self):
        invalid = [(ORIGIN, None), (None, USER), ('', USER), (ORIGIN, ''),
                   ('https://example.test', USER), ('http://' + HOST, USER),
                   ('https://ts.net', USER), ('https://tail-example.ts.net', USER),
                   (ORIGIN + ':443', USER), (ORIGIN + '/', USER),
                   (ORIGIN + '?query=1', USER), (ORIGIN + '#fragment', USER),
                   ('https://user@' + HOST, USER),
                   ('https://*.tail-example.ts.net', USER),
                   ('https://workstation.tail-example.ts.net.evil.test', USER),
                   (ORIGIN, 'owner\n@example.test'), (ORIGIN, 'owner name'),
                   (ORIGIN, '\u00e9@example.test')]
        for origin, user in invalid:
            with self.subTest(origin=origin, user=user):
                with self.assertRaises(ValueError):
                    server(self.s, 0, tailscale_origin=origin, tailscale_user=user)

    def test_cli_validates_remote_settings_before_opening_a_workspace(self):
        for args in [['--tailscale-origin', ORIGIN], ['--tailscale-user', USER],
                     ['--tailscale-origin', 'https://example.test', '--tailscale-user', USER]]:
            with self.subTest(args=args), patch.object(sys, 'argv', ['employment-agency', 'serve', *args]), \
                    patch('employment_agency.cli.Workspace') as workspace, \
                    patch('sys.stderr', new_callable=io.StringIO):
                with self.assertRaises(SystemExit) as exit_error:
                    cli.main()
                self.assertEqual(exit_error.exception.code, 2)
                workspace.assert_not_called()


if __name__ == '__main__':
    unittest.main()
