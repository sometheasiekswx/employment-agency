"""Verify the prepared static public site, with its production CSP and no API."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'output/public-preview/site'


class StaticPreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        config = json.loads((SITE / 'vercel.json').read_text(encoding='utf-8'))
        for header in config['headers'][0]['headers']:
            self.send_header(header['key'], header['value'])
        super().end_headers()

    def log_message(self, *_args):
        pass


class StaticPreviewServer(ThreadingHTTPServer):
    # Several independent browser contexts request the exported chunks together.
    # Match the local app's backlog instead of the five-connection test default.
    request_queue_size = 64

    def handle_error(self, request, client_address):
        # Navigation and PDF previews can cancel an asset transfer mid-response.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


if __name__ == '__main__':
    if not (SITE / 'demo/preview.json').is_file():
        raise SystemExit('Build the fictional site first: npm --prefix frontend run build:preview')
    server = StaticPreviewServer(
        ('127.0.0.1', 0), partial(StaticPreviewHandler, directory=str(SITE)),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        environment = {
            **os.environ, 'PYTHON_EXECUTABLE': sys.executable,
            'TEST_URL': f'http://127.0.0.1:{server.server_port}',
        }
        for script in ['public-preview-browser.cjs', 'public-demo-drafts-browser.cjs']:
            subprocess.run(['node', str(ROOT / 'tests' / script)],
                           cwd=ROOT, env=environment, check=True)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
