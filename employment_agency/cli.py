from pathlib import Path
import argparse
import json
import sys
from .store import Workspace, restore, encode, migrate_sqlite, restore_snapshot
from .service import Service
from .workspaces import selected_workspace, remember, settings


# Other operations must explicitly supply a payload. Some mutations accept an
# empty object and would otherwise change data when invoked without input.
PARAMETERLESS_ACTIONS = frozenset({'snapshot-status', 'company-avoid', 'company-logo-inventory'})


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Private career workspace; external applications require explicit approval"
    )
    p.add_argument(
        "--workspace", help="Career workspace folder; defaults to the remembered folder or workspace/"
    )
    sub = p.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8766)
    serve.add_argument('--frontend-origin', help='Development only: exact http://127.0.0.1:PORT origin for a Next.js dev proxy')
    serve.add_argument('--tailscale-origin', help='Private Serve access: exact https://MACHINE.TAILNET.ts.net origin')
    serve.add_argument('--tailscale-user', help='Private Serve access: exact Tailscale owner login; requires --tailscale-origin')
    serve.add_argument('--skip-remember', action='store_true', help=argparse.SUPPRESS)
    dev = sub.add_parser('dev', help='Run Python and the live Next.js frontend together; Ctrl+C stops both')
    dev.add_argument('--port', type=int, default=8766, help='Python backend port (default: 8766)')
    dev.add_argument('--frontend-port', type=int, default=3000, help='Live frontend port (default: 3000)')
    dev.add_argument('--gateway-port', type=int, help='Private live gateway port; requires paired Tailscale settings')
    dev.add_argument('--tailscale-origin', help='Exact private HTTPS Serve origin for live development')
    dev.add_argument('--tailscale-user', help='Exact Tailscale owner login for live development')
    demo = sub.add_parser('demo', help='Create a new isolated fictional demo workspace; no API key or network needed')
    demo.add_argument('destination', help='New folder; existing destinations are never overwritten')
    demo.add_argument('--serve', action='store_true', help='Start the demo without changing the remembered workspace')
    demo.add_argument('--open', action='store_true', help='Reopen an existing marked demo without reseeding')
    demo.add_argument('--port', type=int, default=8770)
    gmail = sub.add_parser('connect-gmail', help='Connect a Google Desktop OAuth client; credentials stay in macOS Keychain')
    gmail.add_argument('client_json')
    sub.add_parser('disconnect-gmail', help='Remove local Gmail credentials from macOS Keychain')
    sub.add_parser('apply-doctor', help='Check optional local application dependencies without contacting employers')
    sub.add_parser('init', help='Initialize a career workspace at an explicit --workspace path')
    sub.add_parser("state")
    act = sub.add_parser("action")
    act.add_argument("operation")
    act.add_argument("--input", help="Read JSON from a file or pipe it on stdin; optional for snapshot-status, company-avoid and company-logo-inventory")
    export = sub.add_parser("export")
    export.add_argument("destination")
    res = sub.add_parser("restore")
    res.add_argument("archive")
    res.add_argument("destination")
    res.add_argument('--sqlite', action='store_true', help='Restore a legacy archive as a SQLite workspace')
    sqlite_migration = sub.add_parser('migrate-sqlite', help='Convert a legacy workspace into a new SQLite folder')
    sqlite_migration.add_argument('source')
    sqlite_migration.add_argument('destination')
    snapshot = sub.add_parser('restore-snapshot', help='Restore a verified Git snapshot into a new SQLite folder')
    snapshot.add_argument('source')
    snapshot.add_argument('destination')
    migration = sub.add_parser('migrate-legacy', help='Copy legacy data into a career workspace; source code is not deleted')
    migration.add_argument('source')
    migration.add_argument('destination')
    migration.add_argument('--settings', help='JSON workspace settings file')
    a = p.parse_args(argv)
    if a.command in ('serve', 'dev'):
        from .server import validate_tailscale_access
        try:
            validate_tailscale_access(a.tailscale_origin, a.tailscale_user)
        except ValueError as exc:
            p.error(str(exc))
        if a.command == 'dev' and bool(a.tailscale_origin) != bool(a.gateway_port is not None):
            p.error('Private live development requires --gateway-port and paired Tailscale settings')
    if a.command == 'dev':
        from .development import run
        try:
            path, create = selected_workspace(a.workspace)
            if a.tailscale_origin:
                from .live_development import run as run_private
                p.exit(run_private(path, a.port, a.frontend_port, a.gateway_port,
                                   a.tailscale_origin, a.tailscale_user, create=create))
            p.exit(run(path, a.port, a.frontend_port, create=create))
        except (ValueError, OSError) as exc:
            p.exit(2, f'Development app not started: {exc}\n')
    if a.command in ('connect-gmail', 'disconnect-gmail', 'apply-doctor'):
        from .delivery_connections import Gmail
        try:
            if a.command == 'apply-doctor':
                import shutil, importlib.util, subprocess
                binary = shutil.which('codex')
                signed_in = bool(binary and subprocess.run([binary, 'login', 'status'], capture_output=True, timeout=10).returncode == 0)
                print(json.dumps({'macos': sys.platform == 'darwin', 'codex_installed': bool(binary),
                    'codex_signed_in': signed_in, 'optional_dependencies': {n: bool(importlib.util.find_spec(n)) for n in ('playwright', 'keyring', 'google_auth_oauthlib')}}))
            else:
                result = Gmail().connect(a.client_json) if a.command == 'connect-gmail' else Gmail().disconnect()
                print(json.dumps(result))
        except Exception:
            p.exit(2, 'Connection setup failed. Check the optional dependencies and Google Desktop client; no credentials were printed.\n')
        return
    if a.command == 'demo':
        if a.workspace:
            p.error('demo uses its new destination; omit --workspace')
        from . import demo as examples
        try:
            result = examples.open_existing(a.destination) if a.open else examples.create(a.destination)
            print(json.dumps(result, indent=2), flush=True)
            if a.serve:
                examples.serve(result['path'], a.port)
        except (ValueError, OSError) as exc:
            p.exit(2, f'Demo not started: {exc}\n')
        return
    if a.command == 'migrate-legacy':
        from .migrate import migrate
        config = json.loads(Path(a.settings).read_text()) if a.settings else None
        print(json.dumps(migrate(a.source, a.destination, config), indent=2))
        return
    if a.command in ('restore', 'migrate-sqlite', 'restore-snapshot'):
        try:
            if a.command == 'migrate-sqlite':
                migrate_sqlite(a.source, a.destination)
            elif a.command == 'restore-snapshot':
                restore_snapshot(a.source, a.destination)
            else:
                restore(a.archive, a.destination, sqlite=a.sqlite)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            p.exit(2, f'Workspace recovery failed: {exc}\n')
        return
    if a.command == 'init' and not a.workspace:
        p.error('init requires --workspace before the command')
    if a.command == 'action' and a.operation in (
        'agent-application-start', 'agent-application-resume', 'agent-application-answer',
    ):
        p.error('Start, resume or answer a connected application through the running local app or its protected HTTP API.')
    if a.command == 'action':
        try:
            if a.input is not None:
                source = Path(a.input).read_text(encoding='utf-8')
            else:
                source = '' if sys.stdin.isatty() else sys.stdin.read()
                if not source.strip():
                    if a.operation not in PARAMETERLESS_ACTIONS:
                        p.error('Provide a JSON object with --input or pipe it on standard input.')
                    source = '{}'
            body = json.loads(source)
        except json.JSONDecodeError as exc:
            p.error(f'Invalid action JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}.')
        except (OSError, UnicodeError) as exc:
            p.error(f'Cannot read action input: {exc}')
        if not isinstance(body, dict):
            p.error('Expected a JSON object for action input.')
    try:
        path, create = selected_workspace(a.workspace)
        if a.command == 'init':
            settings(path)
        w = Workspace(path, create=create or a.command == 'init', sqlite=True)
    except (ValueError, OSError) as exc:
        p.exit(2, f'Workspace not opened: {exc}\n')
    if a.command == 'init':
        w.close()
        print(f'Workspace ready: {w.path}')
        return
    try:
        service = Service(w)
        if a.command == "serve":
            if w.read()["schema"] != 2:
                raise ValueError("Migrate the older workspace to a new folder with migrate-legacy before serving it")
            from .server import server

            try:
                http = server(service, a.port, frontend_origin=a.frontend_origin,
                              tailscale_origin=a.tailscale_origin, tailscale_user=a.tailscale_user)
                try:
                    if not a.skip_remember:
                        remember(w.path)
                    print(f"Employment Agency: http://127.0.0.1:{http.server_port}", flush=True)
                    http.serve_forever()
                except KeyboardInterrupt:
                    pass
                finally:
                    http.server_close()
            except OSError as exc:
                p.exit(2, f'Application not started: {exc}\n')
        elif a.command == "state":
            sys.stdout.buffer.write(encode(service.state()))
        elif a.command == "export":
            print(w.export(a.destination))
        else:
            result = service.action(a.operation, body)
            if a.operation == "discovery-start":
                result = service.discovery.wait()
            if service.worker:
                service.worker.join()
            sys.stdout.buffer.write(encode(result))
    finally:
        if service.discovery:
            service.discovery.close()
        if service.delivery:
            service.delivery.close()
        if service.agent_execution:
            service.agent_execution.close()
        w.close()


if __name__ == "__main__":
    main()
