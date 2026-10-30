"""Reproduce Vercel's dependency install before frontend assets exist."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROOF = '''
from importlib.metadata import PackageNotFoundError, distribution
from employment_agency.hosted import app
try:
    distribution('employment-agency-local')
except PackageNotFoundError:
    pass
else:
    raise AssertionError('uv must install dependencies without packaging incomplete frontend assets')
client = app.test_client()
assert client.get('/api/runtime').json == {'mode': 'hosted'}
assert client.get('/').status_code == 503
print('Hosted dependency bootstrap before frontend build PASS')
'''

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='ea-hosted-bootstrap-') as directory:
        root = Path(directory)
        for name in ('pyproject.toml', 'setup.py', 'app.py'):
            shutil.copy2(ROOT / name, root / name)
        shutil.copytree(ROOT / 'employment_agency', root / 'employment_agency',
                        ignore=shutil.ignore_patterns('web', '__pycache__'))
        # Never inherit an active/project environment that could mutate a real installation.
        env = {key: value for key, value in os.environ.items()
               if key not in {'VIRTUAL_ENV', 'UV_PROJECT_ENVIRONMENT', 'PYTHONPATH'}}
        with tempfile.TemporaryFile() as log:
            for command in (['uv', 'lock', '--quiet'],
                            ['uv', 'sync', '--quiet', '--locked', '--no-dev', '--no-editable', '--link-mode', 'hardlink']):
                result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=log)
                if result.returncode:
                    log.seek(0)
                    raise RuntimeError(log.read().decode()[-6000:])
        python = root / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        subprocess.run([str(python), '-c', PROOF], cwd=root, env=env, check=True)
