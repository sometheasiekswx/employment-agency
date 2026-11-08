"""Loopback UI with opt-in owner-only Tailscale Serve access and protected mutations."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from socketserver import TCPServer
from pathlib import Path
import json
import secrets
import mimetypes
import os
import re
import threading
from urllib.parse import parse_qs, urlsplit, unquote, quote
from .store import Workspace, encode, digest
from .service import Service
from .workspaces import inside, remember, configure
from .folders import choose_folder
from .listing_frame import listing_frame
from .web_assets import asset, script_policy
from . import packages, history


def validate_tailscale_access(origin, user):
    """Return the exact Serve host; configuration never enables a public listener."""
    if origin is None and user is None:
        return None
    if not origin or not user:
        raise ValueError('Tailscale access requires both --tailscale-origin and --tailscale-user')
    label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
    match = re.fullmatch(r'https://((?:' + label + r'\.){2,}ts\.net)', origin)
    if not match or len(match[1]) > 253:
        raise ValueError('Tailscale origin must be an exact https://MACHINE.TAILNET.ts.net origin')
    if len(user) > 254 or not user.isascii() or any(ord(c) <= 32 or ord(c) >= 127 for c in user):
        raise ValueError('Tailscale user must be an exact non-empty printable ASCII login')
    return match[1]


def server(service, port=8766, frontend_origin=None, tailscale_origin=None, tailscale_user=None):
    if frontend_origin:
        parsed = urlsplit(frontend_origin)
        if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or frontend_origin != 'http://127.0.0.1:' + str(parsed.port):
            raise ValueError('Development frontend origin must be an exact http://127.0.0.1:PORT origin')
    tailscale_host = validate_tailscale_access(tailscale_origin, tailscale_user)
    token = secrets.token_urlsafe(32)
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
            if 'Content-Security-Policy' not in (headers or {}):
                scripts = script_policy(body.decode()) if kind.startswith('text/html') else "script-src 'self'"
                self.send_header('Content-Security-Policy', "default-src 'self'; " + scripts + "; style-src 'self'; img-src 'self'; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'")
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def access_origin(self):
            # Reject ambiguous security headers instead of selecting one of several values.
            seen = set()
            protected = {'host', 'origin', 'x-workspace-token', 'content-length', 'content-type',
                         'transfer-encoding', 'forwarded'}
            for name, value in self.headers.items():
                normalized = name.lower().replace('_', '-')
                if normalized in protected or normalized.startswith(('tailscale-', 'x-forwarded-')):
                    if name.lower() != normalized or normalized in seen or '\r' in value or '\n' in value:
                        return None
                    seen.add(normalized)
            if 'transfer-encoding' in seen:
                return None
            local_host = '127.0.0.1:' + str(self.server.server_port)
            host = self.headers.get('Host')
            if host == local_host:
                # Serve must never become a local request by spoofing its upstream Host.
                if any(name.startswith('tailscale-') for name in seen):
                    return None
                if any(name.startswith('x-forwarded-') or name == 'forwarded' for name in seen):
                    if (not frontend_origin
                            or self.headers.get('X-Forwarded-Host') != urlsplit(frontend_origin).netloc
                            or self.headers.get('X-Forwarded-Host') == local_host
                            or self.headers.get('X-Forwarded-Proto') not in {None, 'http'}):
                        return None
                return 'http://' + local_host
            # Only the loopback Serve proxy is trusted to supply the authenticated owner.
            if (tailscale_host and self.client_address[0] == '127.0.0.1'
                    and host == tailscale_host
                    and self.headers.get('X-Forwarded-Host') == tailscale_host
                    and self.headers.get('X-Forwarded-Proto') == 'https'
                    and self.headers.get('Tailscale-User-Login') == tailscale_user
                    and self.headers.get('Tailscale-Funnel-Request') is None):
                return tailscale_origin
            return None

        def allowed(self):
            return self.access_origin() is not None

        def do_GET(self):
            with gate:
                try:
                    self.get()
                except (ValueError, KeyError, OSError) as exc:
                    self.send(409, encode({'error': str(exc)}))

        def do_HEAD(self):
            self.do_GET()

        def get(self):
            if not self.allowed():
                return self.send(403, b'{}')
            url = urlsplit(self.path)
            path = url.path
            if path == '/api/state':
                return self.send(200, encode({'state': service.state(), 'token': token}))
            if path == '/api/runtime':
                return self.send(200, encode({'mode': 'local'}))
            if path == '/api/listing-preview-frame':
                hosts = parse_qs(url.query, keep_blank_values=True).get('host', [])
                try:
                    html, headers = listing_frame(hosts[0] if len(hosts) == 1 else None)
                except ValueError:
                    return self.send(400, encode({'error': 'Invalid website preview host'}))
                return self.send(200, html.encode(), 'text/html; charset=utf-8', headers)
            if path == '/api/development' and frontend_origin:
                current = self.server.active_service
                busy = (picker.locked() or bool(current.worker and current.worker.is_alive())
                        or bool(current.delivery and current.delivery.busy))
                return self.send(200, encode({'reload_safe': not busy,
                                              'workspace': str(current.w.path), 'pid': os.getpid()}))
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
                if len(parts) != 5:
                    return self.send(404, b'{}')
                f = history.verified_file(service.w.path, parts[3], unquote(parts[4]))
            elif path.startswith('/exports/'):
                name = path.removeprefix('/exports/')
                if not re.fullmatch('[a-f0-9]{32}\\.zip', name):
                    return self.send(404, b'{}')
                f = inside(service.w.path, '.runtime/exports/' + name)
            elif path == '/robots.txt':
                return self.send(200, b'User-agent: *\nDisallow: /\n', 'text/plain')
            else:
                f = asset(unquote(path))
                if f is None:
                    if not path.startswith('/api/') and not Path(path).suffix:
                        missing = asset('/404/')
                        if missing:
                            return self.send(404, missing.read_bytes(), 'text/html; charset=utf-8')
                    return self.send(404, b'{"error":"Page not found"}')
            if not f.is_file() or f.is_symlink():
                return self.send(404, b'{}')
            headers = {'Content-Disposition': "inline; filename*=UTF-8''" + quote(f.name, safe='')} if f.suffix == '.pdf' else None
            self.send(200, f.read_bytes(), mimetypes.guess_type(f.name)[0] or 'application/octet-stream', headers)

        def do_POST(self):
            nonlocal service, token
            try:
                with gate:
                    origin = self.access_origin()
                    local_origin = 'http://127.0.0.1:' + str(self.server.server_port)
                    allowed_origins = {local_origin, frontend_origin} if origin == local_origin else {tailscale_origin}
                    supplied_token = self.headers.get('X-Workspace-Token', '')
                    if (origin is None or not self.headers.get('Origin')
                            or self.headers.get('Origin') not in allowed_origins
                            or not supplied_token.isascii()
                            or not secrets.compare_digest(supplied_token, token)):
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
            if service.delivery and service.delivery.busy:
                raise ValueError('Finish or cancel Apply For Me before switching workspaces')
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
                        if service.delivery:
                            service.delivery.close()
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
        # Older Python releases default to five pending connections. A modern
        # exported page can request more chunks at once, resetting connections
        # before a handler accepts them. Keep room for a browser's asset burst.
        request_queue_size = 64
        # Development reload must drain accepted mutations before closing data.
        daemon_threads = not bool(frontend_origin)
        active_service = service

        def server_bind(self):
            # HTTPServer resolves a display name through reverse DNS. This
            # loopback-only app already knows its host; offline or slow DNS
            # must not hold up startup before signal handlers are installed.
            TCPServer.server_bind(self)
            self.server_name, self.server_port = self.server_address[:2]

        def server_close(self):
            if frontend_origin:
                super().server_close()
                if service.worker:
                    service.worker.join()
                if service.delivery and service.delivery.thread:
                    service.delivery.commands.join()
            if service.delivery:
                service.delivery.close()
            if not frontend_origin:
                super().server_close()
            if self.active_service.w is not service.w:
                self.active_service.w.close()
            service.w.close()
    return Server(('127.0.0.1', port), Handler)
