from pathlib import Path
import argparse
import json
import sys
from .store import Workspace, restore, encode
from .service import Service


def main():
    p = argparse.ArgumentParser(
        description="Private career workspace; no automatic applications"
    )
    p.add_argument(
        "--workspace", default=str(Path.home() / ".employment-agency/workspace")
    )
    sub = p.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8766)
    sub.add_parser("state")
    act = sub.add_parser("action")
    act.add_argument("operation")
    act.add_argument("--input", help="JSON file; stdin when omitted")
    export = sub.add_parser("export")
    export.add_argument("destination")
    res = sub.add_parser("restore")
    res.add_argument("archive")
    res.add_argument("destination")
    a = p.parse_args()
    if a.command == "restore":
        restore(a.archive, a.destination)
        return
    w = Workspace(a.workspace)
    try:
        service = Service(w)
        if a.command == "serve":
            from .server import server

            http = server(service, a.port)
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
                Path(a.input).read_text() if a.input else sys.stdin.read()
            )
            result = service.action(a.operation, body)
            if service.worker:
                service.worker.join()
            sys.stdout.buffer.write(encode(result))
    finally:
        w.close()


if __name__ == "__main__":
    main()
