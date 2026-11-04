"""Disposable fictional Concept A data for UI acceptance; no external requests."""
import argparse
import os
from pathlib import Path
import tempfile

from employment_agency.demo import DemoWorkspace
from employment_agency.public_preview import seed
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.workspaces import configure




if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8788)
    parser.add_argument('--frontend-origin')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='ea-concept-a-preview-') as temp:
        root = Path(temp)
        os.environ['EA_CONFIG_HOME'] = str(root / 'config')
        workspace = DemoWorkspace(root / 'workspace')
        configure(workspace.path, {'label': 'Demo · Alex Morgan', 'demo': True, 'setup_complete': True,
                                  'timezone': 'Australia/Melbourne', 'master_template': False,
                                  'preferred_locations': ['Singapore', 'Melbourne', 'Berlin', 'Toronto']})
        service = Service(workspace)
        http = None
        try:
            seed(service)
            http = server(service, args.port, frontend_origin=args.frontend_origin)
            print(f'Concept A fictional preview: http://127.0.0.1:{http.server_port}', flush=True)
            http.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            if http is not None:
                http.server_close()
            workspace.close()
