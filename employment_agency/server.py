"""Loopback UI; no public bind, permissive CORS, or application send endpoint."""

from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import secrets
import mimetypes
from urllib.parse import urlsplit
from .store import encode
from .documents import FILES


def server(service, port=8766):
    token = secrets.token_urlsafe(32)
    static = Path(__file__).parent / "static"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, status, body, kind="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            )
            self.end_headers()
            self.wfile.write(body)

        def allowed(self):
            return self.headers.get("Host") == "127.0.0.1:" + str(
                self.server.server_port
            )

        def do_GET(self):
            if not self.allowed():
                return self.send(403, b"{}")
            path = urlsplit(self.path).path
            if path == "/api/state":
                return self.send(
                    200, encode({"state": service.state(), "token": token})
                )
            if path.startswith("/files/"):
                parts = path.split("/")
                if (
                    len(parts) != 4
                    or not any(
                        a["id"] == parts[2] for a in service.state()["applications"]
                    )
                    or parts[3] not in (*FILES, "checksums.json")
                ):
                    return self.send(404, b"{}")
                f = service.w.path / "packages" / parts[2] / parts[3]
            elif path.startswith("/exports/"):
                parts = path.split("/")
                if len(parts) != 3 or not __import__("re").fullmatch(
                    r"[a-f0-9]{32}\.zip", parts[2]
                ):
                    return self.send(404, b"{}")
                f = service.w.path / "exports" / parts[2]
            elif path in ("/", "/app.js", "/style.css"):
                f = static / ("index.html" if path == "/" else path[1:])
            else:
                return self.send(404, b"{}")
            if not f.is_file() or f.is_symlink():
                return self.send(404, b"{}")
            return self.send(
                200,
                f.read_bytes(),
                mimetypes.guess_type(f.name)[0] or "application/octet-stream",
            )

        def do_POST(self):
            origin = "http://127.0.0.1:" + str(self.server.server_port)
            if (
                not self.allowed()
                or self.headers.get("Origin") != origin
                or not secrets.compare_digest(
                    self.headers.get("X-Workspace-Token", ""), token
                )
            ):
                return self.send(
                    403, encode({"error": "Request origin or token rejected"})
                )
            if self.headers.get("Content-Type") != "application/json":
                return self.send(415, b"{}")
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 15 * 1024 * 1024:
                    raise ValueError("Request size exceeds limit")
                data = json.loads(self.rfile.read(length))
                if not self.path.startswith("/api/"):
                    return self.send(404, b"{}")
                result = service.action(self.path[5:], data)
                self.send(200, encode({"result": result}))
            except (ValueError, KeyError, TypeError, OverflowError) as e:
                self.send(400, encode({"error": str(e)}))
            except Exception:
                self.send(
                    500,
                    encode(
                        {
                            "error": "Operation failed; no remote response or credentials logged"
                        }
                    ),
                )

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)
