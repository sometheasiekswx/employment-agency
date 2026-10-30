"""Reproducible, offline demo data through the same application operations."""
from pathlib import Path
import base64
import json
import os
import tempfile

from .store import Workspace, atomic, encode
from .service import Service
from .workspaces import configure

DATA = Path(__file__).parent / 'demo_data'


class DemoWorkspace(Workspace):
    def permissions_path(self):
        # Demo generation cannot write machine-wide provider permissions.
        return self.path / '.runtime/demo-permissions.json'


def create(destination):
    target = Path(destination).expanduser().absolute()
    if target.exists() or target.is_symlink():
        raise ValueError('Demo requires a new destination; existing folders are never overwritten')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.ea-demo-', dir=target.parent) as temporary:
        stage = Path(temporary) / 'workspace'
        workspace = DemoWorkspace(stage)
        try:
            configure(stage, {'demo': True, 'label': 'Demo · Alex Morgan', 'setup_complete': True,
                              'timezone': 'America/New_York', 'preferred_locations': ['New York', 'New Jersey', 'Princeton', 'Toronto', 'Boston', 'San Francisco']})
            service = Service(workspace)
            service.action('identity', {'name': 'Alex Morgan', 'email': 'alex.morgan@example.test',
                                       'location': 'New York, NY · Open to US cities and Canada', 'languages': 'English, French'})
            source = (DATA / 'resume.txt').read_bytes()
            service.action('import', {'name': 'demo-resume.txt', 'data': base64.b64encode(source).decode(), 'use_as_master': True})
            proposal = service.action('master-propose', {})
            service.action('master-accept', {'sha256': proposal['sha256'], 'confirmed': True})
            association, dates = '', ''
            for fact in workspace.read()['facts']:
                line = fact['text']
                if line.startswith('Senior Software Engineer |'):
                    association, dates = 'Harbor Metrics (fictional)', '2022–2026'
                elif line.startswith('Software Engineer |'):
                    association, dates = 'Northstar Transit (fictional)', '2019–2022'
                elif line == 'Projects and education':
                    association, dates = '', ''
                if line.startswith(('Built ', 'Designed ', 'Operated ', 'Implemented ', 'Led ', 'Mentored ', 'Developed ', 'Introduced ', 'Moved ', 'Worked ', 'Created ', 'Skills:', 'BSc ')):
                    service.action('fact', {'id': fact['id'], 'text': line, 'category': 'education' if line.startswith('BSc ') else 'experience',
                        'association': association, 'dates': dates})
                    service.action('confirm', {'id': fact['id']})
                else:
                    service.action('retire', {'id': fact['id']})
            profiles = []
            for name, locations in [('NYC metro', ['New York', 'New Jersey', 'Princeton']), ('Canada', ['Toronto']), ('All destinations', ['New York', 'New Jersey', 'Princeton', 'Toronto', 'Boston', 'San Francisco'])]:
                profiles.append(service.action('profile', {'name': name, 'roles': ['Engineer'], 'locations': locations,
                    'hard': ['roles', 'locations'], 'include_unknown': True, 'include_stretch': True, 'template': 'plain'}))
            snapshot = json.loads((DATA / 'jobs.json').read_text())
            for index, raw in enumerate(snapshot['jobs']):
                # For selected multi-office examples, choose one advertised office.
                # The snapshot and description retain the employer's full location list.
                job = service.action('job', {**raw, 'location': raw.get('city') or raw['location']})
                if index < 10 or raw.get('city') in ('Boston', 'San Francisco'):
                    application = service.action('local-package', {'job_id': job['id'], 'profile_id': profiles[-1]['id']})
                    if index % 3 == 0:
                        service.action('review', {'id': application['id'], 'status': 'reviewed', 'comment': 'Demo review: inspect the role requirements and eligibility before applying.'})
                    elif index % 4 == 0:
                        service.action('review', {'id': application['id'], 'status': 'rejected', 'comment': 'Demo decision: this role is outside the sample candidate preference.'})
            atomic(stage / 'records/demo.json', encode({'fictional_candidate': True, 'jobs_checked_at': snapshot['checked_at'], 'notice': snapshot['notice']}))
            summary = {'path': str(target), 'facts': sum(f['confirmed'] for f in workspace.read()['facts']),
                       'jobs': len(workspace.read()['jobs']), 'applications': len(workspace.read()['applications']), 'demo': True}
        finally:
            workspace.close()
        # Publish only after every generated package passed normal validation.
        # mkdir is exclusive so a concurrent creator cannot replace our target.
        target.mkdir()
        # Keep a partial target for inspection if disk publication fails; never
        # remove files that another actor may have added to the destination.
        for child in stage.iterdir():
            child.rename(target / child.name)
    return summary


def serve(path, port):
    from .server import server
    previous = os.environ.get('EA_CONFIG_HOME')
    os.environ['EA_CONFIG_HOME'] = str(Path(path) / '.runtime/config')
    workspace = None
    try:
        workspace = Workspace(path)
        http = server(Service(workspace), port)
        print(f'Demo · fictional profile: http://127.0.0.1:{http.server_port}', flush=True)
        try:
            http.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            http.server_close()
    finally:
        if workspace is not None:
            workspace.close()
        if previous is None:
            os.environ.pop('EA_CONFIG_HOME', None)
        else:
            os.environ['EA_CONFIG_HOME'] = previous


def open_existing(destination):
    """Read the marker before opening any store or acquiring a write lock."""
    path = Path(destination).expanduser().resolve()
    try:
        config = json.loads((path / 'workspace.json').read_text())
        record = json.loads((path / 'records/demo.json').read_text())
        state = json.loads((path / 'state.json').read_text())
    except (OSError, ValueError) as exc:
        raise ValueError('Choose a demo created by the demo command') from exc
    if config.get('demo') is not True or record.get('fictional_candidate') is not True or state.get('schema') != 2:
        raise ValueError('This is not a marked demo workspace; no data changed')
    return {'path': str(path), 'demo': True}
