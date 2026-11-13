"""One-terminal development using the existing Python server and Next.js CLI."""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time

from .server import server
from .service import Service
from .store import Workspace
from .workspaces import remember


def frontend_command(port):
    frontend = Path(__file__).resolve().parents[1] / 'frontend'
    if not (frontend / 'package.json').is_file():
        raise ValueError('Development mode requires the software source checkout. Use serve with an installed release.')
    node = shutil.which('node')
    if not node:
        raise ValueError('Install Node.js 24+ for development, then run dev again.')
    next_cli = frontend / 'node_modules/next/dist/bin/next'
    if not next_cli.is_file():
        raise ValueError('Install frontend dependencies first: npm --prefix frontend ci --ignore-scripts')
    return frontend, [node, str(next_cli), 'dev', '--hostname', '127.0.0.1', '--port', str(port)]


def check_ports(backend, frontend):
    if any(not 1 <= port <= 65535 for port in (backend, frontend)):
        raise ValueError('Choose ports between 1 and 65535.')
    if backend == frontend:
        raise ValueError('Backend and frontend ports must be different.')
    for name, port in [('Backend', backend), ('Frontend', frontend)]:
        with socket.socket() as probe:
            # Permit a quick restart after TIME_WAIT, but never share a listener.
            if os.name == 'nt':
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            else:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as exc:
                raise ValueError(f'{name} port {port} is unavailable. Stop the existing app with Ctrl+C, '
                                 'or choose --port and --frontend-port.') from exc


def listening(port):
    with socket.socket() as probe:
        probe.settimeout(.2)
        return probe.connect_ex(('127.0.0.1', port)) == 0


def stop_frontend(process):
    """Next forks a worker; stop the owned group, including on parent failure."""
    if os.name == 'nt':
        try:
            # Target the console group even if its original parent exited.
            os.kill(process.pid, signal.CTRL_BREAK_EVENT)
        except ProcessLookupError:
            pass
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 5
    try:
        process.wait(timeout=5)
        if os.name != 'nt':
            while time.monotonic() < deadline:
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    return
                time.sleep(.05)
            raise subprocess.TimeoutExpired(process.args, 5)
    except subprocess.TimeoutExpired:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait(timeout=5)


def run(workspace_path, backend_port=8766, frontend_port=3000, *, create=True):
    frontend, command = frontend_command(frontend_port)
    check_ports(backend_port, frontend_port)
    workspace = None
    http = None
    thread = None
    process = None
    stopping = threading.Event()
    previous_signals = {}
    try:
        try:
            workspace = Workspace(workspace_path, create=create, sqlite=True)
        except ValueError as exc:
            if str(exc) == 'Workspace is already open in another process':
                raise ValueError(f'{exc}. Stop the existing app with Ctrl+C, then run dev again.') from exc
            raise
        if workspace.read()['schema'] != 2:
            raise ValueError('Migrate the older workspace to a new folder with migrate-legacy before serving it')
        origin = f'http://127.0.0.1:{frontend_port}'
        http = server(Service(workspace), backend_port, frontend_origin=origin)
        signals = [signal.SIGINT, signal.SIGTERM]
        if os.name == 'nt':
            signals.append(signal.SIGBREAK)
        for name in signals:
            previous_signals[name] = signal.signal(name, lambda *_: stopping.set())
        thread = threading.Thread(target=http.serve_forever, kwargs={'poll_interval': .1}, daemon=True)
        options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
        process = subprocess.Popen(command, cwd=frontend,
            env={**os.environ, 'NODE_ENV': 'development', 'EA_BACKEND_URL': f'http://127.0.0.1:{backend_port}'},
            **options)
        while not stopping.wait(.1):
            code = process.poll()
            if code is not None:
                print('Next.js stopped; stopping the Python backend.', file=sys.stderr, flush=True)
                return code if code > 0 else 1
            if thread.ident is None and listening(frontend_port):
                remember(workspace.path)
                thread.start()
                print(f'Development app: {origin}\nWorkspace: {workspace.path}\n'
                      'Save frontend files for live updates. Ctrl+C stops both servers.', flush=True)
            if thread.ident is not None and not thread.is_alive():
                print('Python backend stopped; stopping Next.js.', file=sys.stderr, flush=True)
                return 1
        return 0
    finally:
        try:
            if process is not None:
                stop_frontend(process)
        finally:
            if thread is not None and thread.ident is not None:
                http.shutdown()
                thread.join()
            if http is not None:
                http.server_close()
            if workspace is not None:
                workspace.close()
            for name, previous in previous_signals.items():
                signal.signal(name, previous)
