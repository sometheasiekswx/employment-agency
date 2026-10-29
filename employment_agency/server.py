"""Loopback-only UI, protected mutations and explicit isolated workspace switching."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import secrets
import mimetypes
import re
import threading
from urllib.parse import urlsplit, unquote, quote
from .store import Workspace, encode, digest
from .service import Service
from .workspaces import inside, remember, configure
from .folders import choose_folder
from . import packages, history


def server(service, port=8766):
    token = secrets.token_urlsafe(32)
    static = Path(__file__).parent / 'static'
    gate = threading.RLock()
    picker = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, status, body, kind='application/json', headers=None):
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'")
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def allowed(self):
            return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)

        def do_GET(self):
            with gate:
                try:
                    self.get()
                except (ValueError, KeyError, OSError) as exc:
                    self.send(409, encode({'error': str(exc)}))

        def get(self):
            if not self.allowed():
                return self.send(403, b'{}')
            path = urlsplit(self.path).path
            if path == '/api/state':
                return self.send(200, encode({'state': service.state(), 'token': token}))
            if path in ('/history', '/history/'):
                return self.send(200, history.page(service.w.path), 'text/html; charset=utf-8')
            if path.startswith('/files/'):
                parts = path.split('/')
                app = next((a for a in service.w.read()['applications'] if len(parts) == 4 and a['id'] == parts[2]), None)
                if not app or not re.fullmatch('[a-f0-9]{32}', parts[2]):
                    return self.send(404, b'{}')
                f = packages.path_for(service.w.path, app, unquote(parts[3]))
                key = digest(app['folder'].encode())[:24]
                return self.send(302, b'', headers={'Location': '/history/files/' + key + '/' + quote(f.name, safe='')})
            if path.startswith('/history/files/'):
                parts = path.split('/')
                item = packages.catalogue(service.w.path).get(parts[3]) if len(parts) == 5 else None
                if not item:
                    return self.send(404, b'{}')
                relative, record = item
                index = json.loads(inside(service.w.path, '.recovery/index.json').read_text())
                baseline = index.get(relative)
                if not baseline or digest(inside(service.w.path, relative + '/version.json').read_bytes()) != baseline:
                    raise ValueError('Version manifest changed; recovery review is required')
                name = unquote(parts[4])
                if name not in record['files']:
                    return self.send(404, b'{}')
                f = inside(service.w.path, relative + '/' + name)
                if digest(f.read_bytes()) != record['files'][name]:
                    raise ValueError('Document changed; validate edits in Applications first')
            elif path.startswith('/exports/'):
                name = path.removeprefix('/exports/')
                if not re.fullmatch('[a-f0-9]{32}\\.zip', name):
                    return self.send(404, b'{}')
                f = inside(service.w.path, '.runtime/exports/' + name)
            elif path == '/robots.txt':
                return self.send(200, b'User-agent: *\nDisallow: /\n', 'text/plain')
            elif path in ('/', '/app.js', '/style.css'):
                f = static / ('index.html' if path == '/' else path[1:])
            elif path.startswith('/ui/'):
                f = inside(static, path.removeprefix('/ui/'))
            else:
                return self.send(404, b'<!doctype html><html lang="en"><title>Page not found</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body class="history-page"><main><h1>Not on the board.</h1><p>This page could not be found.</p><a href="/">Return to applications</a></main></body></html>', 'text/html; charset=utf-8')
            if not f.is_file() or f.is_symlink():
                return self.send(404, b'{}')
            headers = {'Content-Disposition': "inline; filename*=UTF-8''" + quote(f.name, safe='')} if f.suffix == '.pdf' else None
            self.send(200, f.read_bytes(), mimetypes.guess_type(f.name)[0] or 'application/octet-stream', headers)

        def do_POST(self):
            nonlocal service, token
            try:
                with gate:
                    origin = 'http://127.0.0.1:' + str(self.server.server_port)
                    if not self.allowed() or self.headers.get('Origin') != origin or not secrets.compare_digest(self.headers.get('X-Workspace-Token', ''), token):
                        return self.send(403, encode({'error': 'Workspace changed, or request origin/token rejected. Reload before continuing.'}))
                    if self.headers.get('Content-Type') != 'application/json':
                        return self.send(415, b'{}')
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 15 * 1024 * 1024:
                        raise ValueError('Request size exceeds limit')
                    data = json.loads(self.rfile.read(length))
                    if not self.path.startswith('/api/') or not isinstance(data, dict):
                        return self.send(404, b'{}')
                    action = self.path[5:]
                    if action != 'workspace-browse':
                        return self.mutate(action, data)
                    self.check_run()
                    if not picker.acquire(blocking=False):
                        raise ValueError('A folder chooser is already open. Choose a folder or cancel it first.')
                    previous_token = token
                # A native dialog can wait for the user without blocking state reads.
                try:
                    target = choose_folder()
                    with gate:
                        if previous_token != token:
                            raise ValueError('Workspace changed while choosing a folder. Reload and try again.')
                        if target is None:
                            return self.send(200, encode({'result': {'cancelled': True}}))
                        action = 'workspace-open' if (target / 'state.json').is_file() else 'workspace-create'
                        return self.mutate(action, {'path': str(target)})
                finally:
                    picker.release()
            except (ValueError, KeyError, TypeError, OverflowError, OSError) as exc:
                self.send(400, encode({'error': str(exc)}))
            except Exception:
                self.send(500, encode({'error': 'Operation failed; no remote response or credentials logged'}))

        def check_run(self):
            if service.worker and service.worker.is_alive():
                raise ValueError('Wait for or cancel the active run before switching workspaces')

        def mutate(self, action, data):
            nonlocal service, token
            if action in ('workspace-open', 'workspace-create'):
                self.check_run()
                target = Path(data['path']).expanduser().resolve()
                if target == service.w.path:
                    configure(target, {'setup_complete': True})
                else:
                    if action == 'workspace-open' and not (target / 'state.json').is_file():
                        raise ValueError('Choose an existing career workspace, or an empty folder to create one.')
                    if action == 'workspace-create' and target.exists() and any(target.iterdir()):
                        raise ValueError('This folder has files but no career workspace. Choose an existing workspace or an empty folder.')
                    replacement = Workspace(target)
                    try:
                        if replacement.read()['schema'] != 2:
                            raise ValueError('Migrate this older workspace using the CLI before opening it')
                        configure(target, {'setup_complete': True})
                    except Exception:
                        replacement.close()
                        raise
                    previous = service.w
                    service = Service(replacement)
                    self.server.active_service = service
                    previous.close()
                remember(target)
                token = secrets.token_urlsafe(32)
                result = {'path': str(target), 'reload': True}
            else:
                result = service.action(action, data)
            self.send(200, encode({'result': result}))

    class Server(ThreadingHTTPServer):
        def server_close(self):
            super().server_close()
            if self.active_service.w is not service.w:
                self.active_service.w.close()
            service.w.close()
    instance = Server(('127.0.0.1', port), Handler)
    instance.active_service = service
    return instance
