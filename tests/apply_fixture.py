"""Controlled Easy Apply-like page. Never contacts LinkedIn or sends mail."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
from employment_agency.linkedin_apply import LinkedIn, NeedsUser

HTML = b'''<!doctype html><html lang="en"><title>Controlled application form</title>
<button onclick="document.querySelector('dialog').showModal()">Easy Apply</button>
<dialog aria-label="Controlled Easy Apply"><h2>Application for Fictional Systems</h2>
<label>Email address<input id="email" type="email" required></label>
<label>Mobile phone number<input id="phone"></label>
<label>Custom resume<input type="file" accept=".pdf" onchange="document.querySelector('#filename').textContent=this.files[0]?.name || ''"></label>
<span id="filename"></span>
<label>Cover letter<input id="cover" type="file" accept=".pdf" onchange="document.querySelector('#covername').textContent=this.files[0]?.name || ''"></label>
<span id="covername"></span>
<label><input type="radio" name="resume" id="custom" checked>Custom upload</label>
<label><input type="radio" name="resume" id="stored">Stored generic.pdf</label>
<button id="next" onclick="this.hidden=true;document.querySelector('#submit').hidden=false">Review</button>
<button id="submit" hidden onclick="window.sent=true;document.querySelector('dialog').close();document.querySelector('#receipt').hidden=false">Submit application</button>
</dialog><h2 id="receipt" hidden>Application sent</h2></html>'''


def site():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200);self.send_header('Content-Type', 'text/html');self.end_headers();self.wfile.write(HTML)
        def log_message(self, *args): pass
    http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True);thread.start()
    return http, 'http://127.0.0.1:' + str(http.server_port)


class FixtureLinkedIn(LinkedIn):
    """Explicit test-only injection. Production adapter never accepts loopback URLs."""
    def __init__(self, origin):
        super().__init__();self.origin = origin

    def open(self, url):
        from playwright.sync_api import sync_playwright
        self.target = self.origin + '/jobs/view/123456/'
        self.engine = sync_playwright().start()
        self.context = self.engine.chromium.launch(channel='chrome', headless=True).new_context()
        self.page = self.context.new_page();self.page.goto(self.target)

    def submit(self, expected, resume):
        try:
            return super().submit(expected, resume)
        except NeedsUser:
            raise
        except Exception:
            import traceback
            traceback.print_exc()
            raise

    def guard(self):
        if self.page.url != self.target:
            raise NeedsUser('Controlled form destination changed')
