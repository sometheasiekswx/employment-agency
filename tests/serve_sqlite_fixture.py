"""Serve a loopback-only SQLite workspace populated with fictional jobs."""

import argparse
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from employment_agency import company_logo_assets
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
            role = service.action('job', {'title': title, 'employer': 'Fictional Harbour',
                                          'description': 'Maintain fictional Python services.',
                                          'requirements': ['Python services'], 'availability': 'retrieved',
                                          'url': f'https://employer.example.test/roles/{index}'})
            if title == 'Quality Engineer':
                employer_id = service.action('company-map', {'job_id': role['id'], 'confirmed': True})['employer_id']
        raw = BytesIO()
        Image.new('RGBA', (48, 24), '#285ce0').save(raw, format='PNG')
        mark = company_logo_assets.normalize(raw.getvalue(), 'image/png')
        with workspace.edit() as state:
            employer = next(row for row in state['employers'] if row['id'] == employer_id)
            employer['logo'] = {'sha256': company_logo_assets.persist(workspace.path, mark),
                                'source': 'fictional-browser-fixture'}
        with server(service, args.port) as http:
            http.serve_forever()
