"""Opt-in actual installed Sol Max proof, with a disposable fictional HTTP workspace and site."""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from time import monotonic, sleep
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from employment_agency import packages
from employment_agency.agent_execution import AgentExecution, TOOL
from employment_agency.codex_runtime import CodexError, CodexRuntime, EFFORT, MODEL
from employment_agency.server import server
from agent_fixture import FORM, RecordingMail, RecordingTelegram, service, site


@contextmanager
def listening(http):
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:' + str(http.server_port)
    finally:
        http.shutdown()
        http.server_close()
        thread.join()


def inspect_tool_inventory(runtime):
    requests = []

    class Capture(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"Controlled tool inventory only"}}')

    with listening(ThreadingHTTPServer(('127.0.0.1', 0), Capture)) as origin, tempfile.TemporaryDirectory() as directory:
        connection = runtime.connect(Path(directory), fixture_endpoint=origin + '/v1')
        try:
            version = connection.initialize()['userAgent'].split()[0]
            try:
                connection.turn('Fictional tool inventory.', lambda *_: {}, [TOOL], Path(directory),
                                stop=lambda: False, provider='fixture')
            except CodexError:
                pass  # The observation endpoint intentionally rejects model requests.
        finally:
            connection.close()
    assert len(requests) == 1 and requests[0]['model'] == MODEL
    assert requests[0]['reasoning']['effort'] == EFFORT
    body = requests[0]
    declarations = list(body.get('tools', []))
    for item in body['input']:
        if item.get('type') == 'additional_tools':
            declarations.extend(item['tools'])
    shapes = [(tool['type'], tool.get('name')) for tool in declarations]
    if shapes == [('namespace', 'functions')]:
        declarations = declarations[0]['tools']
    assert [(tool['type'], tool.get('name')) for tool in declarations] == [('function', TOOL['name'])], shapes
    print(f'{version} advertises only {TOOL["name"]} for {MODEL} {EFFORT}', flush=True)


class ObservedRuntime(CodexRuntime):
    def __init__(self):
        super().__init__()
        self.calls = []

    def run(self, prompt, call, dynamic_tools, *, stop):
        def observe(namespace, name, args):
            self.calls.append((namespace, name, args))
            return call(namespace, name, args)

        return super().run(prompt, observe, dynamic_tools, stop=stop)


def check_site(runtime, *, stop=False):
    with tempfile.TemporaryDirectory(prefix='ea-connected-agent-proof-') as temp, site(forms=(FORM,)) as (website, posts, hits):
        root = Path(temp)
        os.environ['EA_CONFIG_HOME'] = str(root / 'config')
        app, job, _ = service(root / 'workspace')
        mail, telegram = RecordingMail(), RecordingTelegram()
        app.agent_execution = AgentExecution(app, runtime=runtime, website=website, mail=mail, telegram=telegram)
        with listening(server(app, 0)) as origin:
            with urllib.request.urlopen(origin + '/api/state') as response:
                token = json.load(response)['token']

            def action(name, args):
                request = urllib.request.Request(origin + '/api/' + name, data=json.dumps(args).encode(),
                                                 headers={'Origin': origin, 'X-Workspace-Token': token,
                                                          'Content-Type': 'application/json'})
                with urllib.request.urlopen(request, timeout=10) as response:
                    return json.load(response)['result']

            def status_until(predicate):
                deadline = monotonic() + 90
                while monotonic() < deadline:
                    row = action('agent-application-status', {'id': run['id']})['runs'][0]
                    if predicate(row):
                        return row
                    if row['status'] in ('uncertain', 'record_pending') or (row['status'] == 'needs_help' and not row.get('question')):
                        raise AssertionError(row)
                    sleep(0.2)
                raise AssertionError(row)

            start = {'job_ids': [job['id']], 'request_key': 'fictional-start-request'}
            run = action('agent-application-start', start)['runs'][0]
            assert action('agent-application-start', start)['runs'][0]['id'] == run['id']
            # There is no open tab, streaming response or client connection during this work.
            sleep(3)
            waiting = status_until(lambda row: bool(row.get('question')))
            assert waiting['question']['field'] == 'framework' and posts == []
            if stop:
                action('agent-application-stop', {'id': run['id']})
                result = status_until(lambda row: row['status'] == 'stopped')
                assert posts == [] and len(hits) == 1
                print('Stopped one live Sol Max tool run with zero POSTs:', result['id'], flush=True)
            else:
                action('agent-application-answer', {'id': run['id'], 'question_id': waiting['question']['id'],
                                                    'answer': 'unittest'})
                result = status_until(lambda row: row['status'] == 'submitted')
                assert result['receipt']['provider'] == 'website' and len(posts) == 1
                version = app.w.read()['applications'][0]
                assert version['status'] == 'submitted'
                assert posts[0]['cv'] == packages.path_for(app.w.path, version, 'resume.pdf').read_bytes()
                assert posts[0]['letter'] == packages.path_for(app.w.path, version, 'cover-letter.pdf').read_bytes()
                assert posts[0]['framework'] == b'unittest'
                print('Submitted exactly one fixture POST:', json.dumps({
                    'run': result['id'], 'attempt': result['attempt_id'], 'version': result['application_id'],
                    'receipt_sha256': result['receipt']['response_sha256']}), flush=True)
            assert not mail.messages and not telegram.messages
    assert runtime.calls[-1] == (None, TOOL['name'], {}) or runtime.calls[-1] == ('functions', TOOL['name'], {})


if __name__ == '__main__':
    runtime = ObservedRuntime()
    inspect_tool_inventory(runtime)
    check_site(runtime)
    check_site(runtime, stop=True)
    assert len(runtime.calls) == 2
    print('Real Codex app-server and Chrome, fictional role and loopback site, no provider send.', flush=True)
