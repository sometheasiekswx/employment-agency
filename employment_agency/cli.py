from pathlib import Path
import argparse
import json
import sys
from .store import Workspace, restore, encode
from .service import Service
from .workspaces import selected_workspace, remember


def main():
    p = argparse.ArgumentParser(
        description="Private career workspace; no automatic applications"
    )
    p.add_argument(
        "--workspace", help="Career workspace folder; defaults to the remembered folder or workspace/"
    )
    sub = p.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8766)
    serve.add_argument('--frontend-origin', help='Development only: exact http://127.0.0.1:PORT origin for a Next.js dev proxy')
    demo = sub.add_parser('demo', help='Create a new isolated fictional demo workspace; no API key or network needed')
    demo.add_argument('destination', help='New folder; existing destinations are never overwritten')
    demo.add_argument('--serve', action='store_true', help='Start the demo without changing the remembered workspace')
    demo.add_argument('--open', action='store_true', help='Reopen an existing marked demo without reseeding')
    demo.add_argument('--port', type=int, default=8770)
    sub.add_parser("state")
    act = sub.add_parser("action")
    act.add_argument("operation")
    act.add_argument("--input", help="JSON file; stdin when omitted")
    export = sub.add_parser("export")
    export.add_argument("destination")
    res = sub.add_parser("restore")
    res.add_argument("archive")
    res.add_argument("destination")
    migration = sub.add_parser('migrate-legacy', help='Copy legacy data into a career workspace; source code is not deleted')
    migration.add_argument('source')
    migration.add_argument('destination')
    migration.add_argument('--settings', help='JSON workspace settings file')
    a = p.parse_args()
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
    if a.command == "restore":
        restore(a.archive, a.destination)
        return
    w = Workspace(selected_workspace(a.workspace))
    try:
        service = Service(w)
        if a.command == "serve":
            if w.read()["schema"] != 2:
                raise ValueError("Migrate the older workspace to a new folder with migrate-legacy before serving it")
            from .server import server

            remember(w.path)
            http = server(service, a.port, frontend_origin=a.frontend_origin)
            print(f"Employment Agency: http://127.0.0.1:{http.server_port}", flush=True)
            try:
                http.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                http.server_close()
        elif a.command == "state":
            sys.stdout.buffer.write(encode(service.state()))
        elif a.command == "export":
            print(w.export(a.destination))
        else:
            body = json.loads(
                Path(a.input).read_text(encoding="utf-8")
                if a.input
                else sys.stdin.read()
            )
            result = service.action(a.operation, body)
            if service.worker:
                service.worker.join()
            sys.stdout.buffer.write(encode(result))
    finally:
        w.close()


if __name__ == "__main__":
    main()
