"""Preserved-version queue scenarios; isolated fictional data only."""
import argparse
import json
import os
from pathlib import Path
import tempfile

from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.store import Workspace
from test_workflow import Workflow


def seed(service, workspace):
    fixture = Workflow()
    fixture.s, fixture.w = service, workspace
    _, profile, _ = fixture.seed()
    profile = service.action('profile', {**profile, 'hard': [], 'locations': []})
    service.action('workspace-settings', {'setup_complete': True})

    def job(title, employer, city):
        return service.action('job', {'title': title, 'employer': employer, 'location': city,
            'description': 'Build Python APIs and integration tests.', 'requirements': ['Python APIs'],
            'availability': 'retrieved'})

    def draft(listing):
        return service.action('local-package', {'profile_id': profile['id'], 'job_id': listing['id']})

    analyst = job('Business Analyst', 'Fictional Insurance', 'Toronto')
    draft(analyst)
    sent = draft(analyst)
    service.action('review', {'id': sent['id'], 'status': 'submitted'})
    doc = service.action('document-editor', {'id': sent['id'], 'document': 'resume'})
    service.action('save-document', {**doc, 'blocks': doc['blocks']})

    product = job('Software Engineer', 'Fictional Products', 'Toronto')
    draft(product)
    active = draft(product)
    declined_job = job('Systems Analyst', 'Fictional Decisions', 'Vancouver')
    draft(declined_job)
    declined = draft(declined_job)
    service.action('review', {'id': declined['id'], 'status': 'rejected'})

    reopened_job = job('Software Engineer', 'Fictional Reopened', 'Montreal')
    rejected = draft(reopened_job)
    service.action('review', {'id': rejected['id'], 'status': 'rejected'})
    reopened = draft(reopened_job)
    separate = draft(job('Business Analyst', 'Fictional Insurance', 'Toronto'))
    legacy = job('Software Engineer', 'Fictional Legacy', 'London')
    draft(legacy)
    legacy_sent = draft(legacy)
    service.action('review', {'id': legacy_sent['id'], 'status': 'submitted'})
    with workspace.edit() as state:
        next(a for a in state['applications'] if a['id'] == legacy_sent['id'])['archived'] = True
    metadata = {'sent': sent, 'active': active, 'declined': declined, 'reopened': reopened,
                'separate': separate, 'legacy_sent': legacy_sent}
    (workspace.path / 'queue-fixture.json').write_text(json.dumps(metadata))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8782)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='employment-agency-queue-fixture-') as directory:
        os.environ['EA_CONFIG_HOME'] = str(Path(directory) / 'config')
        workspace = Workspace(Path(directory) / 'workspace')
        service = Service(workspace)
        seed(service, workspace)
        http = server(service, args.port)
        print('Queue fixture: http://127.0.0.1:' + str(http.server_port), flush=True)
        try:
            http.serve_forever()
        finally:
            http.server_close()
