"""Build and serve one explicitly selected career workspace over Tailscale."""

import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile


def main():
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    from employment_agency import cli, web_assets
    from employment_agency.server import validate_tailscale_access

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--tailscale-origin', required=True)
    parser.add_argument('--tailscale-user', required=True)
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()

    try:
        validate_tailscale_access(args.tailscale_origin, args.tailscale_user)
        if not (workspace / 'state.json').is_file():
            raise ValueError('Choose an existing workspace or initialize it with the init command.')
        if not 1 <= args.port <= 65535:
            raise ValueError('Choose a port between 1 and 65535.')
        with socket.socket() as probe:
            if os.name == 'nt':
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            else:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', args.port))
        with tempfile.TemporaryDirectory(prefix='employment-agency-tailnet-') as temporary:
            assets = Path(temporary) / 'web'
            subprocess.run(
                ['npm', '--prefix', 'frontend', 'run', 'build'],
                cwd=root, env={**os.environ, 'EA_WEB_EXPORT_DIR': str(assets)}, check=True,
            )
            if not (assets / 'index.html').is_file():
                raise ValueError('The frontend build produced no application index.')
            web_assets.ROOT = assets
            cli.main([
                '--workspace', str(workspace), 'serve', '--port', str(args.port),
                '--tailscale-origin', args.tailscale_origin, '--tailscale-user', args.tailscale_user,
            ])
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        parser.exit(2, f'Tailscale app not started: {exc}\n')


if __name__ == '__main__':
    main()
