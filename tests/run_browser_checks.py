"""Run production-export browser acceptance with disposable local/hosted fixtures."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def fixture(script):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    url = 'http://127.0.0.1:' + str(port)
    with tempfile.TemporaryDirectory(prefix='ea-browser-config-') as config:
        env = {**os.environ, 'PYTHONPATH': os.pathsep.join([str(ROOT), str(ROOT / 'tests')]), 'EA_CONFIG_HOME': config}
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen([sys.executable, str(ROOT / 'tests' / script), '--port', str(port)], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(150):
                    if process.poll() is not None:
                        log.seek(0); raise RuntimeError(log.read().decode())
                    try:
                        with urllib.request.urlopen(url + '/api/runtime', timeout=1):
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.1)
                else:
                    raise RuntimeError('Browser fixture did not start')
                yield url
            finally:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait(timeout=5)


def browser(script, url, hosted=False):
    env = {**os.environ, 'TEST_URL': url}
    env.setdefault('PLAYWRIGHT_PATH', str(ROOT / 'frontend/node_modules/playwright'))
    if hosted: env['HOSTED'] = '1'
    else: env.pop('HOSTED', None)
    subprocess.run(['node', str(ROOT / 'tests' / script)], env=env, cwd=ROOT, check=True)


def seed_hosted_draft(url):
    # Fictional owner/session exists only inside serve_hosted_fixture.py.
    headers = {'Authorization': 'Bearer fixture-session', 'Origin': url, 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(url + '/api/state', headers=headers)) as response:
        state = json.load(response)['state']
    def action(name, data):
        request = urllib.request.Request(url + '/api/' + name, data=json.dumps(data).encode(), headers=headers)
        with urllib.request.urlopen(request) as response: return json.load(response)['result']
    job = action('job', {'title': 'Software Engineer', 'employer': 'Fictional Editor Systems', 'location': 'Toronto', 'description': 'Build Python APIs', 'requirements': ['Python APIs']})
    action('local-package', {'profile_id': state['profiles'][0]['id'], 'job_id': job['id']})


if __name__ == '__main__':
    with fixture('serve_folder_fixture.py') as url:
        browser('redesign-browser.cjs', url)
    with fixture('serve_folder_fixture.py') as url:
        browser('browser.cjs', url)
        browser('parity-browser.cjs', url)
        browser('editor-browser.cjs', url)
        browser('workspace-browser.cjs', url)
    with fixture('serve_folder_fixture.py') as url:
        browser('folder-browser.cjs', url)
    with fixture('serve_hosted_fixture.py') as url:
        browser('hosted-browser.cjs', url, hosted=True)
        seed_hosted_draft(url)
        browser('editor-browser.cjs', url, hosted=True)
        browser('hosted-parity-browser.cjs', url, hosted=True)
    print('All local and hosted browser acceptance checks passed.', flush=True)
