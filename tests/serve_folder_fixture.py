"""Disposable local UI fixture with a deterministic OS chooser; never deploy."""
import argparse
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.store import Workspace


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8774)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='employment-agency-folder-browser-') as temp:
        root = Path(temp).resolve()
        os.environ['EA_CONFIG_HOME'] = str(root / 'config')
        queue = root / 'picker.json'
        queue.write_text('[]')

        def choose():
            choices = json.loads(queue.read_text())
            result = choices.pop(0) if choices else None
            queue.write_text(json.dumps(choices))
            if isinstance(result, dict):
                raise ValueError(result['error'])
            if result is None:
                return None
            target = Path(result).resolve()
            if not target.is_relative_to(root) or not target.is_dir():
                raise ValueError('Fixture selection must be a directory inside its temporary root')
            return target

        workspace = Workspace(root / 'primary')
        http = server(Service(workspace), args.port)
        try:
            with patch('employment_agency.server.choose_folder', side_effect=choose):
                print(f'Folder fixture: http://127.0.0.1:{http.server_port}', flush=True)
                http.serve_forever()
        finally:
            http.server_close()
