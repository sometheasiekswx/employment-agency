"""Real Next/Chrome/Caddy live updates using isolated, fictional career data."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

from check_development import (BROWSER, ROOT, assert_released, link_or_copy,
                               seed, wait_for_proxy)
from test_live_development import free_ports


PRIVATE_BROWSER = BROWSER.replace(
    'width: 1440, height: 1000', 'width: 390, height: 844'
).replace('assert.deepEqual(errors, []);', r'''
    const source = process.env.TEST_STAGED_PYTHON;
    assert.ok(source.startsWith(process.env.TEST_STAGE_ROOT));
    const before = await (await page.request.get(origin + '/api/development')).json();
    fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace(
      "{'mode': 'local'}", "{'mode': 'local', 'reload_proof': 'saved-python-code'}"));
    let refreshed;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        refreshed = await (await page.request.get(origin + '/api/runtime')).json();
        if (refreshed.reload_proof === 'saved-python-code') break;
      } catch {}
      await page.waitForTimeout(100);
    }
    assert.equal(refreshed?.reload_proof, 'saved-python-code');
    const after = await (await page.request.get(origin + '/api/development')).json();
    assert.notEqual(after.pid, before.pid, 'Reload Python in a fresh interpreter');
    fs.appendFileSync(css, '\nbody { --development-proof: after-python-reload; }\n');
    await page.waitForFunction(() =>
      getComputedStyle(document.body).getPropertyValue('--development-proof').trim() === 'after-python-reload',
      null, {timeout: 45000});
    assert.equal(await page.evaluate(() => window.__developmentProof), 'same-document',
      'Keep the page and live connection across backend reloads');
    assert.deepEqual(errors, []);
''').replace('Development browser PASS: real alternate-port API proxy, token/origin guards, saved fictional identity and globals.css Fast Refresh without reload.',
            'Private development browser PASS: Caddy API/token/origin checks; CSS Fast Refresh without reload; changed Python behavior in a new interpreter; live CSS still updates after Python restart.')


def main():
    with tempfile.TemporaryDirectory(prefix='ea-private-browser-proof-') as directory:
        stage = Path(directory).resolve()
        shutil.copytree(ROOT / 'employment_agency', stage / 'employment_agency',
                        ignore=shutil.ignore_patterns('__pycache__'))
        frontend = stage / 'frontend'
        frontend.mkdir()
        for name in ('package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json'):
            shutil.copy2(ROOT / 'frontend' / name, frontend / name)
        for name in ('src', 'public'):
            shutil.copytree(ROOT / 'frontend' / name, frontend / name)
        shutil.copytree(ROOT / 'frontend/node_modules', frontend / 'node_modules',
                        copy_function=link_or_copy, symlinks=True)
        workspace, config = stage / 'workspace', stage / 'config'
        seed(workspace, config)
        backend, next_port, gateway = ports = free_ports()
        origin = f'http://127.0.0.1:{gateway}'
        command = [sys.executable, '-m', 'employment_agency', '--workspace', str(workspace),
                   'dev', '--port', str(backend), '--frontend-port', str(next_port),
                   '--gateway-port', str(gateway), '--tailscale-origin',
                   'https://workstation.tail-example.ts.net', '--tailscale-user', 'owner@example.test']
        env = {**os.environ, 'PYTHONPATH': str(stage), 'EA_CONFIG_HOME': str(config),
               'NEXT_TELEMETRY_DISABLED': '1'}
        process = None
        with tempfile.TemporaryFile() as log:
            try:
                process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log)
                wait_for_proxy(process, origin)
                subprocess.run(['node'], input=PRIVATE_BROWSER, text=True, cwd=stage, timeout=180,
                    env={**env, 'TEST_URL': origin, 'TEST_WORKSPACE': str(workspace),
                         'TEST_STAGE_ROOT': str(stage),
                         'TEST_STAGED_CSS': str(frontend / 'src/app/globals.css'),
                         'TEST_STAGED_PYTHON': str(stage / 'employment_agency/server.py'),
                         'TEST_EVIDENCE': str(ROOT / 'output/playwright/private-development'),
                         'PLAYWRIGHT_PATH': str(frontend / 'node_modules/playwright')}, check=True)
                process.send_signal(signal.SIGINT)
                assert process.wait(timeout=20) == 0
                assert_released(workspace, ports)
                print('Private development browser shutdown PASS: all three ports and workspace released.')
            except BaseException:
                log.seek(0)
                sys.stderr.write(log.read().decode()[-12000:])
                raise
            finally:
                if process is not None and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=20)


if __name__ == '__main__':
    main()
