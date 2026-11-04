"""Build a public, fictional snapshot through shared application services.

No workspace input is accepted: exports always start with an empty temporary
workspace and the fixed fictional seed also used by browser acceptance.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import tempfile

from .demo import DemoWorkspace
from .service import Service
from . import history, packages
from .workspaces import configure


def seed(service):
    service.action('identity', {'name': 'Alex Morgan', 'email': 'alex@example.test',
                               'location': 'Melbourne, Australia · Fictional sample profile', 'languages': 'English'})
    for skill in ('Python', 'AWS', 'Terraform', 'PostgreSQL', 'React', 'TypeScript', 'CI/CD'):
        fact = service.action('fact', {'text': f'Used {skill} to build and maintain software services.',
                                      'category': 'experience', 'association': 'Example Labs (fictional)',
                                      'dates': '2022–2026'})
        service.action('confirm', {'id': fact['id']})
    profile = service.action('profile', {'name': 'Cloud & software', 'roles': ['Engineer'],
        'locations': ['Singapore', 'Melbourne', 'Berlin', 'Toronto'], 'hard': ['locations'],
        'include_unknown': True, 'include_stretch': True, 'template': 'plain'})
    rows = [
        ('Cloud Software Engineer', 'Emberlane Systems', 'Singapore', 'Hybrid', 'SGD', 100000, 130000, ['Python', 'AWS', 'Terraform', 'Kubernetes']),
        ('Backend Engineer', 'Bayform Labs', 'Singapore', 'On-site', 'SGD', 90000, 120000, ['Python', 'PostgreSQL', 'APIs']),
        ('Platform Engineer', 'Fernbridge Digital', 'Melbourne', 'Hybrid', 'AUD', 115000, 145000, ['AWS', 'Terraform', 'CI/CD', 'Kubernetes']),
        ('Full Stack Engineer', 'Paperwell Studio', 'Melbourne', 'Remote', 'AUD', 105000, 135000, ['React', 'TypeScript', 'PostgreSQL']),
        ('DevOps Engineer', 'Northglass Works', 'Berlin', 'Hybrid', 'EUR', 70000, 90000, ['AWS', 'Terraform', 'CI/CD']),
        ('Backend Software Engineer', 'Cedarlight Software', 'Toronto', 'Hybrid', 'CAD', 110000, 140000, ['Python', 'PostgreSQL', 'AWS']),
    ]
    jobs = []
    for index, (title, company, city, arrangement, currency, low, high, requirements) in enumerate(rows):
        job = service.action('job', {'title': title, 'employer': company, 'location': city,
            'description': f'Fictional concept listing. Build and maintain software services with {", ".join(requirements)}. Work with a small engineering team.',
            'requirements': requirements, 'work_arrangement': arrangement, 'eligibility': 'unknown',
            'availability': 'illustrative example', 'sponsorship': 'unknown',
            'posted_at': '2026-11-01', 'checked_at': '2026-11-05T00:00:00Z',
            'url': f'https://example.test/concept/role-{index + 1}',
            'salary': {'currency': currency, 'period': 'year', 'basis': 'gross_base', 'min': low, 'max': high}})
        jobs.append(job)
    for index in (0, 2, 5):
        app = service.action('local-package', {'profile_id': profile['id'], 'job_id': jobs[index]['id']})
        if index == 0:
            service.action('review', {'id': app['id'], 'status': 'reviewed', 'comment': 'Fictional review. Check eligibility before applying.'})
        if index == 5:
            service.action('review', {'id': app['id'], 'status': 'submitted', 'comment': 'Fictional submission record for UI verification. No employer was contacted.'})
    service.action('save-job', {'id': jobs[4]['id'], 'saved': True})


def _write_asset(stage, files, key, path):
    body = path.read_bytes()
    name = hashlib.sha256(body).hexdigest()[:24] + path.suffix.lower()
    destination = stage / 'files' / name
    destination.parent.mkdir(exist_ok=True)
    destination.write_bytes(body)
    files[key] = '/demo/files/' + name
    return files[key]


def _check_owned_export(destination):
    if not destination.exists():
        return
    try:
        old = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError('Refusing to replace a directory without a public-preview manifest') from error
    if old.get('public_preview') is not True or old.get('schema') != 1:
        raise ValueError('Refusing to replace an unrelated directory')
    allowed = {'preview.json'}
    for url in old.get('files', {}).values():
        if not isinstance(url, str) or not url.startswith('/demo/files/'):
            raise ValueError('Invalid previous public-preview asset')
        allowed.add(url.removeprefix('/demo/'))
    actual = {path.relative_to(destination).as_posix() for path in destination.rglob('*') if path.is_file()}
    if actual - allowed:
        raise ValueError('The export directory contains unrelated files; no data changed')


def export_preview(destination):
    """Generate documents/matching once; the public browser never executes them."""
    destination = Path(destination).expanduser().absolute()
    _check_owned_export(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    previous_config = os.environ.get('EA_CONFIG_HOME')
    with tempfile.TemporaryDirectory(prefix='ea-public-preview-') as temporary:
        root = Path(temporary)
        os.environ['EA_CONFIG_HOME'] = str(root / 'config')
        workspace = DemoWorkspace(root / 'workspace')
        try:
            configure(workspace.path, {
                'label': 'Public preview · Alex Morgan', 'demo': True,
                'setup_complete': True, 'timezone': 'Australia/Melbourne',
                'master_template': False,
                'preferred_locations': ['Singapore', 'Melbourne', 'Berlin', 'Toronto'],
            })
            service = Service(workspace)
            seed(service)
            state = service.state()
            rankings = {profile['id']: service.action('rank', {'profile_id': profile['id']}) for profile in state['profiles']}
            versions = service.action('history', {})
            stage = root / 'export'
            stage.mkdir()
            files = {}
            documents = {}
            for app in state['applications']:
                for name in app.get('documents', {}):
                    path = packages.path_for(workspace.path, app, name)
                    _write_asset(stage, files, f'application:{app["id"]}:{name}', path)
                documents[app['id']] = {}
                for stem in ('resume', 'cover-letter'):
                    editor = service.action('document-editor', {'id': app['id'], 'document': stem})
                    documents[app['id']][stem] = {
                        'base': editor['base'],
                        'url': files[f'application:{app["id"]}:{stem}.pdf'],
                    }
            for version in versions:
                for name in version['files']:
                    path = history.verified_file(workspace.path, version['id'], name)
                    _write_asset(stage, files, f'history:{version["id"]}:{name}', path)
            # Absolute build paths, machine permissions and provider consent do
            # not belong in this public snapshot, even in a fictional workspace.
            state['_workspace']['path'] = 'public-fictional-preview'
            state['_master']['path'] = 'master/fictional-resume'
            state['consents'] = {}
            state['runs'] = []
            for job in state['jobs']:
                job['url'] = ''  # Fictional adverts are displayed in the inspector.
            for rows in rankings.values():
                for row in rows:
                    row['job']['url'] = ''
            payload = {
                'public_preview': True, 'schema': 1,
                'notice': 'Fictional public preview. Only bookmarks change in your browser. No uploads, AI requests, account access or employer submissions.',
                'state': state, 'rankings': rankings, 'history': versions,
                'files': files, 'documents': documents,
            }
            serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
            if str(root) in serialized or '/Users/' in serialized:
                raise ValueError('A machine-specific path reached the public preview')
            payload['revision'] = hashlib.sha256(serialized.encode()).hexdigest()[:20]
            (stage / 'preview.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            _check_owned_export(destination)
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(stage, destination)
            return {'jobs': len(state['jobs']), 'applications': len(state['applications']),
                    'assets': len(set(files.values())), 'revision': payload['revision']}
        finally:
            workspace.close()
            if previous_config is None:
                os.environ.pop('EA_CONFIG_HOME', None)
            else:
                os.environ['EA_CONFIG_HOME'] = previous_config


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('frontend/public/demo'))
    arguments = parser.parse_args()
    print(json.dumps(export_preview(arguments.output), indent=2))
