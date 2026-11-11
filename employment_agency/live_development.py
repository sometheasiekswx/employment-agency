"""Private live frontend and reloadable Python, with one workspace-owning child."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

from . import development
from .development_gateway import configuration
from .server import validate_tailscale_access
from .store import Workspace
from .workspaces import remember


def source_signature():
    """Watch application Python only; never reload for private data or documents."""
    result = []
    for path in sorted(Path(__file__).parent.rglob('*.py')):
        try:
            stat = path.stat()
            result.append((str(path), stat.st_mtime_ns, stat.st_size))
        except FileNotFoundError:
            # Editors can replace a file atomically during this scan.
            continue
    return tuple(result)


def spawn(command, directory, environment):
    options = ({'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt'
               else {'start_new_session': True})
    return subprocess.Popen(command, cwd=directory, env=environment, **options)


def backend_info(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/development', timeout=2) as response:
        result = json.load(response)
    if (not isinstance(result.get('reload_safe'), bool)
            or not isinstance(result.get('workspace'), str)
            or not Path(result['workspace']).is_absolute()):
        raise ValueError('Unexpected development readiness response')
    return result


def stop_backend(process, stopping=None):
    if process is None or process.poll() is not None:
        return
    process.send_signal(signal.CTRL_BREAK_EVENT if os.name == 'nt' else signal.SIGINT)
    if stopping is not None:
        # An automatic reload lets any just-started HTTP mutation finish naturally.
        while process.poll() is None and not stopping.wait(.1):
            pass
        return
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        development.stop_frontend(process)


def run(workspace_path, backend_port, frontend_port, gateway_port, origin, user, *, create=True):
    validate_tailscale_access(origin, user)
    frontend, frontend_command = development.frontend_command(frontend_port)
    if len({backend_port, frontend_port, gateway_port}) != 3:
        raise ValueError('Backend, frontend and gateway ports must be different.')
    development.check_ports(backend_port, frontend_port)
    development.check_ports(gateway_port, frontend_port)
    caddy = shutil.which('caddy')
    if not caddy:
        raise ValueError('Private live development requires Caddy. Install it from caddyserver.com.')
    root = Path(__file__).resolve().parents[1]
    workspace_path = Path(workspace_path).resolve()
    backend = frontend_process = gateway = None
    stopping = threading.Event()
    previous_signals = {}
    environment = dict(os.environ)
    local_origin = f'http://127.0.0.1:{gateway_port}'

    def start_backend(path):
        # Python's normal .pyc timestamp has one-second resolution. Ignore it so
        # rapid same-size saves cannot restart with stale code. Never write caches
        # into the alternate, empty search path.
        return spawn([sys.executable, '-B', '-X', f'pycache_prefix={directory}/bytecode',
                      '-m', 'employment_agency', '--workspace', str(path),
                      'serve', '--port', str(backend_port), '--frontend-origin', local_origin, '--skip-remember',
                      '--tailscale-origin', origin, '--tailscale-user', user], root, environment)

    with tempfile.TemporaryDirectory(prefix='employment-agency-live-') as directory:
        config = Path(directory) / 'Caddyfile'
        config.write_text(configuration(backend_port, frontend_port, gateway_port, origin))
        config.chmod(0o600)
        validation = subprocess.run([caddy, 'validate', '--adapter', 'caddyfile', '--config', str(config)],
                                    capture_output=True, text=True, timeout=15)
        if validation.returncode:
            raise ValueError('Private development gateway configuration failed validation: '
                             + validation.stderr.strip())
        # Detect lock/schema errors before starting any child or changing remembered selection.
        try:
            store = Workspace(workspace_path, create=create)
        except ValueError as exc:
            if str(exc) == 'Workspace is already open in another process':
                raise ValueError(f'{exc}. Stop the existing app before starting live development.') from exc
            raise
        try:
            if store.read()['schema'] != 2:
                raise ValueError('Migrate the older workspace before starting live development')
        finally:
            store.close()
        try:
            signals = [signal.SIGINT, signal.SIGTERM]
            if os.name == 'nt':
                signals.append(signal.SIGBREAK)
            for name in signals:
                previous_signals[name] = signal.signal(name, lambda *_: stopping.set())
            applied = observed = source_signature()
            backend = start_backend(workspace_path)
            deadline = time.monotonic() + 15
            while not stopping.is_set():
                if backend.poll() is not None:
                    return backend.returncode or 1
                try:
                    backend_info(backend_port)
                    break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline:
                        raise ValueError('Python backend did not become ready; review its startup output.')
                    stopping.wait(.1)
            if stopping.is_set():
                return 0
            frontend_process = spawn(frontend_command, frontend,
                {**environment, 'NODE_ENV': 'development',
                 'EA_BACKEND_URL': f'http://127.0.0.1:{backend_port}',
                 'EA_TAILSCALE_ORIGIN': origin})
            gateway = spawn([caddy, 'run', '--adapter', 'caddyfile', '--config', str(config)],
                            root, environment)
            ready = False
            changed_at = 0
            backend_ready = True
            waiting_for_work = False
            while not stopping.wait(.5):
                for child, name in [(frontend_process, 'Next.js'), (gateway, 'Development gateway')]:
                    if child.poll() is not None:
                        print(f'{name} stopped; stopping live development.', file=sys.stderr, flush=True)
                        return child.returncode or 1
                if backend is not None and backend.poll() is not None:
                    if backend_ready:
                        print('Python stopped; stopping live development.', file=sys.stderr, flush=True)
                        return backend.returncode or 1
                    print('Python reload failed. Correct the source and save to retry.',
                          file=sys.stderr, flush=True)
                    backend = None
                if not ready and development.listening(frontend_port) and development.listening(gateway_port):
                    remember(backend_info(backend_port)['workspace'])
                    ready = True
                    print(f'Private live app: {origin}\nLocal live app: {local_origin}\n'
                          'Frontend saves refresh automatically. Python saves reload the backend when idle.',
                          flush=True)
                signature = source_signature()
                if signature != observed:
                    observed, changed_at = signature, time.monotonic()
                if signature == applied:
                    if backend is not None and not backend_ready:
                        try:
                            backend_info(backend_port)
                            backend_ready = True
                        except (OSError, ValueError):
                            pass
                    continue
                if time.monotonic() - changed_at < .5:
                    continue
                if backend is not None:
                    try:
                        info = backend_info(backend_port)
                    except (OSError, ValueError):
                        continue
                    if not info['reload_safe']:
                        if not waiting_for_work:
                            print('Python changes queued until active application work finishes.', flush=True)
                            waiting_for_work = True
                        continue
                    workspace_path = Path(info['workspace'])
                    stop_backend(backend, stopping)
                    if stopping.is_set():
                        return 0
                print('Reloading Python backend.', flush=True)
                backend = start_backend(workspace_path)
                applied = signature
                backend_ready = waiting_for_work = False
            return 0
        finally:
            try:
                for child in (gateway, frontend_process):
                    if child is not None:
                        development.stop_frontend(child)
            finally:
                try:
                    stop_backend(backend)
                finally:
                    for name, previous in previous_signals.items():
                        signal.signal(name, previous)
