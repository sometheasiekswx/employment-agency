"""Real Next/Chrome proof in an isolated source copy; never use private data."""
import errno
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from employment_agency.service import Service
from employment_agency.store import Workspace


BROWSER = r'''
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = process.env.TEST_URL;
    const read = await page.request.get(origin + '/api/state');
    assert.equal(read.status(), 200);
    const initial = await read.json();
    assert.equal(initial.state._workspace.path, process.env.TEST_WORKSPACE);
    const body = {name: 'Alex Morgan - development proof', email: 'alex@example.test'};
    const headers = {'Origin': origin, 'X-Workspace-Token': initial.token};
    const wrongToken = await page.request.post(origin + '/api/identity', {
      data: body, headers: {...headers, 'X-Workspace-Token': 'invalid'},
    });
    assert.equal(wrongToken.status(), 403);
    const wrongOrigin = await page.request.post(origin + '/api/identity', {
      data: body, headers: {...headers, Origin: 'https://example.test'},
    });
    assert.equal(wrongOrigin.status(), 403);
    const save = await page.request.post(origin + '/api/identity', {data: body, headers});
    assert.equal(save.status(), 200);
    const saved = await (await page.request.get(origin + '/api/state')).json();
    assert.equal(saved.state.identity.name, body.name);
    await page.goto(origin);
    await page.waitForURL(url => url.pathname === '/discover/');
    await page.getByRole('group', {name: 'Opportunity views', exact: true}).waitFor();
    await page.getByRole('heading', {name: 'Software Engineer', exact: true}).waitFor();
    await page.evaluate(() => { window.__developmentProof = 'same-document'; });
    const css = process.env.TEST_STAGED_CSS;
    assert.ok(css.startsWith(process.env.TEST_STAGE_ROOT), 'Only mutate staged CSS');
    fs.appendFileSync(css, '\nbody { --development-proof: updated; background-color: rgb(240, 250, 255); }\n');
    await page.waitForFunction(() =>
      getComputedStyle(document.body).getPropertyValue('--development-proof').trim() === 'updated',
      null, {timeout: 45000});
    assert.equal(await page.evaluate(() => window.__developmentProof), 'same-document',
      'CSS updates must preserve the current document without a full reload');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      'rgb(240, 250, 255)');
    assert.deepEqual(errors, []);
    fs.mkdirSync(process.env.TEST_EVIDENCE, {recursive: true});
    await page.screenshot({path: process.env.TEST_EVIDENCE + '/live-css.png'});
    console.log('Development browser PASS: real alternate-port API proxy, token/origin guards, saved fictional identity and globals.css Fast Refresh without reload.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
'''


def free_ports():
    with socket.socket() as first, socket.socket() as second:
        first.bind(('127.0.0.1', 0))
        second.bind(('127.0.0.1', 0))
        return first.getsockname()[1], second.getsockname()[1]


def wait_for_proxy(process, origin):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f'Development launcher exited early: {process.returncode}')
        try:
            with urllib.request.urlopen(origin + '/api/runtime', timeout=1) as response:
                if json.load(response) == {'mode': 'local'}:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.15)
    raise AssertionError('Next.js development proxy did not become ready')


def assert_released(workspace, ports):
    # A surviving Next worker would still own a listener after its parent exits.
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if all(not listening(port) for port in ports):
            break
        time.sleep(.1)
    assert all(not listening(port) for port in ports), 'A development listener survived shutdown'
    reopened = Workspace(workspace)
    reopened.close()


def listening(port):
    with socket.socket() as probe:
        return probe.connect_ex(('127.0.0.1', port)) == 0


def seed(workspace, config):
    with patch.dict(os.environ, {'EA_CONFIG_HOME': str(config)}):
        store = Workspace(workspace)
        try:
            service = Service(store)
            service.action('workspace-settings', {'setup_complete': True})
            service.action('identity', {'name': 'Alex Morgan', 'email': 'alex@example.test'})
            fact = service.action('fact', {'text': 'Built reliable Python APIs and integration tests.',
                                           'category': 'experience'})
            service.action('confirm', {'id': fact['id']})
            profile = service.action('profile', {'name': 'Development fixture', 'roles': ['Engineer'],
                'locations': ['Toronto'], 'hard': [], 'include_unknown': True, 'include_stretch': True})
            job = service.action('job', {'title': 'Software Engineer', 'employer': 'Fictional Development Systems',
                'location': 'Toronto', 'description': 'Build Python APIs', 'requirements': ['Python APIs']})
            service.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})
        finally:
            store.close()


def link_or_copy(source, destination):
    """Keep staging cheap on one filesystem and portable across mount points."""
    try:
        os.link(source, destination)
    except OSError as error:
        if error.errno != errno.EXDEV:
            raise
        return shutil.copy2(source, destination)
    return destination


def main():
    if os.name == 'nt':
        raise SystemExit('This real-signal proof requires macOS/Linux; run unit contracts on Windows.')
    with tempfile.TemporaryDirectory(prefix='ea-development-proof-') as directory:
        stage = Path(directory).resolve()
        shutil.copytree(ROOT / 'employment_agency', stage / 'employment_agency',
                        ignore=shutil.ignore_patterns('__pycache__'))
        frontend = stage / 'frontend'
        frontend.mkdir()
        for name in ('package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json'):
            shutil.copy2(ROOT / 'frontend' / name, frontend / name)
        for name in ('src', 'public'):
            shutil.copytree(ROOT / 'frontend' / name, frontend / name)
        # Preserve normal module paths inside the staged Turbopack root, but
        # prefer hard links where possible without sharing the live .next cache.
        shutil.copytree(ROOT / 'frontend/node_modules', frontend / 'node_modules',
                        copy_function=link_or_copy, symlinks=True)
        workspace, config = stage / 'workspace', stage / 'config'
        seed(workspace, config)
        ports = free_ports()
        origin = 'http://127.0.0.1:' + str(ports[1])
        command = [sys.executable, '-m', 'employment_agency', '--workspace', str(workspace),
                   'dev', '--port', str(ports[0]), '--frontend-port', str(ports[1])]
        env = {**os.environ, 'PYTHONPATH': str(stage), 'EA_CONFIG_HOME': str(config),
               'NEXT_TELEMETRY_DISABLED': '1'}
        process = None
        with tempfile.TemporaryFile() as log:
            try:
                process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log)
                wait_for_proxy(process, origin)
                browser_env = {**env, 'TEST_URL': origin, 'TEST_WORKSPACE': str(workspace),
                    'TEST_STAGE_ROOT': str(stage), 'TEST_STAGED_CSS': str(frontend / 'src/app/globals.css'),
                    'TEST_EVIDENCE': str(ROOT / 'output/playwright/development'),
                    'PLAYWRIGHT_PATH': str(frontend / 'node_modules/playwright')}
                subprocess.run(['node'], input=BROWSER, text=True, env=browser_env, cwd=stage,
                               timeout=150, check=True)
                process.send_signal(signal.SIGINT)
                assert process.wait(timeout=20) == 0, 'Ctrl+C should stop successfully'
                assert_released(workspace, ports)
                print('Development Ctrl+C PASS: both listener ports and workspace lock released.', flush=True)
                process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log)
                wait_for_proxy(process, origin)
                process.send_signal(signal.SIGTERM)
                assert process.wait(timeout=20) == 0, 'SIGTERM should stop successfully'
                assert_released(workspace, ports)
                print('Development SIGTERM PASS: same ports/workspace restart, then complete shutdown.', flush=True)
            except Exception:
                log.seek(0)
                sys.stderr.write(log.read().decode()[-12000:])
                raise
            finally:
                if process is not None and process.poll() is None:
                    process.send_signal(signal.SIGTERM)
                    process.wait(timeout=20)


if __name__ == '__main__':
    main()
