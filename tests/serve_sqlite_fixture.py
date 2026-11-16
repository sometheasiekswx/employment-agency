"""Serve a loopback-only SQLite workspace populated with fictional jobs."""

import argparse
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from PIL import Image

from employment_agency import company_logo_assets
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.store import Workspace
from employment_agency.workspaces import configure


def seed_global_search(service, profile):
    def details(title, location, employer):
        return {'title': title, 'employer': employer, 'location': location,
                'description': 'Maintain fictional Python services.',
                'requirements': ['Python services'], 'availability': 'retrieved'}

    def role(title, location, employer):
        job = service.action('job', details(title, location, employer))
        service.action('company-map', {'job_id': job['id'], 'confirmed': True})
        return job

    def draft(job):
        return service.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})

    role('Atlas Rail Engineer', 'Melbourne', 'Fictional Rail')
    pending = role('Atlas Support Engineer', 'Berlin', 'Fictional Support')
    both = role('Atlas Platform Engineer', 'Melbourne', 'Fictional Platform')
    draft(both)
    for job in (pending, both):
        service.action('save-job', {'id': job['id'], 'saved': True})
    filed = role('Atlas Systems Engineer', 'Toronto', 'Fictional Systems')
    draft(filed)
    submission = draft(filed)
    service.action('review', {'id': submission['id'], 'status': 'submitted'})
    unlisted = role('Atlas Migration Engineer', 'Toronto', 'Fictional Migration')
    earlier = draft(unlisted)
    removed = role('Atlas Test Engineer', 'Melbourne', 'Fictional Testing')
    draft(removed)
    service.action('remove-job', {'id': removed['id'], 'removal_id': uuid4().hex})
    removed_bookmark = role('Grove Engineer', 'Berlin', 'Fictional Grove')
    service.action('save-job', {'id': removed_bookmark['id'], 'saved': True})
    service.action('remove-job', {'id': removed_bookmark['id'], 'removal_id': uuid4().hex})
    with service.w.edit() as state:
        state['jobs'] = [job for job in state['jobs'] if job['id'] != unlisted['id']]
        next(app for app in state['applications'] if app['id'] == earlier['id'])['archived'] = True
        for index in range(51):
            job = service.add_job(details(f'Queue Engineer {index + 1}', 'Berlin', 'Fictional Queue'), state=state)
            job['saved'] = True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--global-search', action='store_true')
    args = parser.parse_args()
    with TemporaryDirectory(prefix='ea-sqlite-browser-') as temp:
        workspace = Workspace(Path(temp) / 'workspace', sqlite=True)
        configure(workspace.path, {'setup_complete': True, 'timezone': 'UTC'})
        service = Service(workspace)
        service.action('identity', {'name': 'Fictional Applicant', 'email': 'test@example.test'})
        fact = service.action('fact', {'text': 'Maintained Python services and integration tests.',
                                       'category': 'experience'})
        service.action('confirm', {'id': fact['id']})
        profile = service.action('profile', {'name': 'Engineering', 'roles': ['Engineer'],
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
        if args.global_search:
            seed_global_search(service, profile)
        with server(service, args.port) as http:
            http.serve_forever()
