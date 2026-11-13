"""Serve a loopback-only SQLite workspace populated with fictional jobs."""

import argparse
from pathlib import Path
from tempfile import TemporaryDirectory

from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.store import Workspace
from employment_agency.workspaces import configure

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    with TemporaryDirectory(prefix='ea-sqlite-browser-') as temp:
        workspace = Workspace(Path(temp) / 'workspace', sqlite=True)
        configure(workspace.path, {'setup_complete': True, 'timezone': 'UTC'})
        service = Service(workspace)
        service.action('identity', {'name': 'Fictional Applicant', 'email': 'test@example.test'})
        fact = service.action('fact', {'text': 'Maintained Python services and integration tests.',
                                       'category': 'experience'})
        service.action('confirm', {'id': fact['id']})
        service.action('profile', {'name': 'Engineering', 'roles': ['Engineer'],
                                   'include_unknown': True, 'include_stretch': True})
        for index, title in enumerate(('Platform Engineer', 'Quality Engineer', 'Infrastructure Engineer'), 1):
            service.action('job', {'title': title, 'employer': 'Fictional Harbour',
                                   'description': 'Maintain fictional Python services.',
                                   'requirements': ['Python services'], 'availability': 'retrieved',
                                   'url': f'https://employer.example.test/roles/{index}'})
        with server(service, args.port) as http:
            http.serve_forever()
