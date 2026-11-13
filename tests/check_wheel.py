"""Install a built wheel outside the checkout and verify its runtime contract."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


PUBLIC_ASSETS = (
    'employment-mark.svg',
    'icon.svg',
    'fonts/inter-400.ttf',
    'fonts/inter-500.ttf',
    'fonts/inter-600.ttf',
    'fonts/inter-700.ttf',
    'licenses/Inter-OFL.txt',
)


PROOF = r'''
from pathlib import Path
from importlib.metadata import version
import sys
import threading
import urllib.request
import re
import hashlib
import json
import os
import employment_agency
from employment_agency.store import Workspace, migrate_sqlite, restore
from employment_agency.service import Service
from employment_agency.server import server
from employment_agency import packages

assert Path(employment_agency.__file__).resolve().is_relative_to(Path(sys.prefix).resolve())
assert employment_agency.__version__ == version('employment-agency-local')
workspace = Workspace(Path('workspace'))
service = Service(workspace)
try:
    service.action('identity', {'name':'Alex Morgan','email':'alex@example.test'})
    fact = service.action('fact', {'text':'Built Python APIs and integration tests.','category':'experience'})
    service.action('confirm', {'id':fact['id']})
    profile = service.action('profile', {'name':'Wheel fixture','roles':['Engineer'],'locations':['Toronto'],'hard':['roles','locations'],'include_unknown':True,'include_stretch':True})
    job = service.action('job', {'title':'Software Engineer','employer':'Fictional Wheel Systems','location':'Toronto','description':'Build Python APIs','requirements':['Python APIs']})
    application = service.action('local-package', {'profile_id':profile['id'],'job_id':job['id']})
    original = packages.path_for(workspace.path, application, 'resume.pdf').read_bytes()
    assert original.startswith(b'%PDF')
    from employment_agency.application_delivery import Delivery
    class RecordingMail:
        messages = []
        def sender(self): return 'alex@example.test'
        def send(self, raw):
            self.messages.append(raw)
            return {'provider': 'installed-wheel recording fixture', 'message_id': 'wheel-message'}
    mail = RecordingMail()
    service.delivery = Delivery(service, mail=mail)
    attempt = service.action('apply-start', {'application_id': application['id'], 'channel': 'gmail',
        'to': 'jobs@example.test', 'subject': 'Controlled wheel application', 'body': 'Fixture message', 'disclosure_confirmed': True})
    service.delivery.commands.join()
    review = service.delivery.get(attempt['id'])
    assert review['status'] == 'awaiting_approval' and not mail.messages
    service.action('apply-approve', {'id': review['id'], 'approved': True, 'fingerprint': review['fingerprint']})
    service.delivery.commands.join()
    assert service.delivery.get(attempt['id'])['status'] == 'confirmed' and len(mail.messages) == 1
    from email.parser import BytesParser
    from email import policy
    attachments = list(BytesParser(policy=policy.default).parsebytes(mail.messages[0]).iter_attachments())
    assert len(attachments) == 2 and attachments[0].get_payload(decode=True) == original
    assert attachments[1].get_payload(decode=True) == packages.path_for(workspace.path, application, 'cover-letter.pdf').read_bytes()
    service.delivery.close()
    service.action('review', {'id':application['id'],'status':'submitted'})
    workspace.export(Path('backup.zip'))
    restore(Path('backup.zip'), Path('restored'))
    restored = Workspace(Path('restored'))
    try:
        record = restored.read()['applications'][0]
        assert record['status'] == 'submitted'
        assert packages.path_for(restored.path, record, 'resume.pdf').read_bytes() == original
    finally:
        restored.close()
    http = server(service, 0)
    thread = threading.Thread(target=http.serve_forever, daemon=True); thread.start()
    try:
        url = 'http://127.0.0.1:' + str(http.server_port)
        for route in ['/', '/discover/', '/career/', '/search/', '/settings/', '/history/']:
            with urllib.request.urlopen(url + route) as response:
                assert response.status == 200
                html = response.read().decode()
                assert '/_next/' in html
                assert "'sha256-" in response.headers['Content-Security-Policy']
            for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
                with urllib.request.urlopen(url + src) as response:
                    assert response.status == 200 and response.read()
        for asset, expected in json.loads(os.environ['EA_WHEEL_ASSET_DIGESTS']).items():
            with urllib.request.urlopen(url + '/' + asset) as response:
                assert response.status == 200
                assert hashlib.sha256(response.read()).hexdigest() == expected, asset
        with urllib.request.urlopen(urllib.request.Request(url + '/career/', method='HEAD')) as response:
            assert response.status == 200 and response.read() == b''
    finally:
        http.shutdown(); http.server_close(); thread.join()
finally:
    workspace.close()
print('Installed wheel: routes/assets, document generation and submitted export/restore PASS')
migrate_sqlite(Path('workspace'), Path('sqlite-copy'))
sqlite = Workspace(Path('sqlite-copy'), create=False)
try:
    migrated = sqlite.read()
    assert sqlite.database.summary()['status'] == 'current'
    assert migrated['submission_attempts'][0]['status'] == 'confirmed'
    assert migrated['applications'][0]['id'] == application['id']
    assert packages.path_for(sqlite.path, application, 'resume.pdf').read_bytes() == original
    assert Service(sqlite).action('application-queue', {'stage': 'submitted'})['rows'][0]['application_id'] == application['id']
    restore(sqlite.export(Path('sqlite.zip')), Path('sqlite-restored'))
finally:
    sqlite.close()
restored = Workspace(Path('sqlite-restored'), create=False)
try:
    assert restored.read()['applications'] == migrated['applications']
    assert restored.read()['consents'] == {}
finally:
    restored.close()
print('Installed wheel: SQLite migration, exact document bytes, submitted queue and ZIP restore PASS')
from employment_agency.demo import create, open_existing
example = create(Path('demo-workspace'))
assert example['demo'] and example['applications'] == 12 and example['jobs'] == 14
assert open_existing(Path('demo-workspace'))['demo']
print('Installed wheel: approval-gated recording delivery with exact PDF PASS')
print('Installed wheel: offline demo data and document generation PASS')
'''


QUEUE_PROOF = r'''
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import threading
import employment_agency
from employment_agency.store import Workspace
from employment_agency.service import Service
from employment_agency.server import server
from employment_agency import packages

assert Path(employment_agency.__file__).resolve().is_relative_to(Path(sys.prefix).resolve())
workspace = Workspace(Path('queue-workspace'))
service = Service(workspace)
try:
    service.action('identity', {'name': 'Alex Morgan', 'email': 'alex@example.test'})
    fact = service.action('fact', {'text': 'Built Python APIs and integration tests.', 'category': 'experience'})
    service.action('confirm', {'id': fact['id']})
    profile = service.action('profile', {'name': 'Wheel queues', 'roles': ['Engineer'],
        'locations': [], 'hard': [], 'include_unknown': True, 'include_stretch': True})
    service.action('workspace-settings', {'setup_complete': True, 'preferred_locations': ['Toronto']})

    def job(title, employer, city):
        return service.action('job', {'title': title, 'employer': employer, 'location': city,
            'description': 'Build Python APIs and integration tests.', 'requirements': ['Python APIs'],
            'availability': 'retrieved'})

    def draft(listing):
        return service.action('local-package', {'profile_id': profile['id'], 'job_id': listing['id']})

    def edited(app):
        document = service.action('document-editor', {'id': app['id'], 'document': 'resume'})
        return service.action('save-document', {**document, 'blocks': document['blocks']})

    listing = job('Software Engineer', 'Fictional Wheel Systems', 'Toronto')
    old_draft = draft(listing)
    earlier_sent = draft(listing)
    service.action('review', {'id': earlier_sent['id'], 'status': 'submitted'})
    sent = edited(earlier_sent)
    service.action('review', {'id': sent['id'], 'status': 'submitted'})
    late_draft = edited(sent)
    active_job = job('Systems Engineer', 'Fictional Active Systems', 'Toronto')
    draft(active_job)
    active = draft(active_job)
    # Matching employer/title must not merge distinct requisitions.
    separate = draft(job('Software Engineer', 'Fictional Wheel Systems', 'Montreal'))
    rejected_job = job('Support Engineer', 'Fictional Decisions', 'Vancouver')
    draft(rejected_job)
    rejected = draft(rejected_job)
    service.action('review', {'id': rejected['id'], 'status': 'rejected'})
    legacy_job = job('Cloud Engineer', 'Fictional Legacy Systems', 'London')
    draft(legacy_job)
    legacy_sent = draft(legacy_job)
    service.action('review', {'id': legacy_sent['id'], 'status': 'submitted'})
    with workspace.edit() as state:
        records = {app['id']: app for app in state['applications']}
        records[old_draft['id']]['created_at'] = '2026-10-18T00:00:00Z'
        records[earlier_sent['id']].update(created_at='2026-10-21T00:00:00Z', submitted_at='2026-10-22T00:00:00Z')
        # Submission time must win even when creation timestamps order differently.
        records[sent['id']].update(created_at='2026-10-20T00:00:00Z', submitted_at='2026-10-24T00:00:00Z')
        records[late_draft['id']]['created_at'] = '2026-10-25T00:00:00Z'
        records[legacy_sent['id']]['archived'] = True

    state = workspace.read()
    metadata = {name: {'id': app['id']} for name, app in {
        'old_draft': old_draft, 'earlier_sent': earlier_sent, 'sent': sent,
        'late_draft': late_draft, 'active': active, 'separate': separate,
        'rejected': rejected, 'legacy_sent': legacy_sent}.items()}
    metadata.update(workspace=str(workspace.path), versions=[{
        'id': app['id'], 'history_id': hashlib.sha256(app['folder'].encode()).hexdigest()[:24]
    } for app in state['applications']], submitted_files=[{
        'id': app['id'],
        'name': name,
        'path': str(packages.path_for(workspace.path, app, name)),
        'sha256': hashlib.sha256(packages.path_for(workspace.path, app, name).read_bytes()).hexdigest()
    } for app in state['applications'] if app['status'] == 'submitted'
        for name in ('resume.pdf', 'cover-letter.pdf')])
    fixture = Path('queue-fixture.json').resolve()
    fixture.write_text(json.dumps(metadata), encoding='utf-8')
    http = server(service, 0)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        subprocess.run(['node', os.environ['WHEEL_QUEUE_BROWSER'],
            'http://127.0.0.1:' + str(http.server_port), str(fixture)], check=True)
    finally:
        http.shutdown()
        http.server_close()
        thread.join()
finally:
    workspace.close()
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('wheel', type=Path)
    parser.add_argument('--browser', action='store_true', help='Verify installed queue behavior using Playwright and Chrome')
    args = parser.parse_args()
    wheel = args.wheel.resolve()
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        for route in ['', 'discover/', 'career/', 'search/', 'settings/', 'history/']:
            assert 'employment_agency/web/' + route + 'index.html' in names
        assert 'employment_agency/web/fonts/OFL.txt' in names
        public = Path(__file__).resolve().parents[1] / 'frontend' / 'public'
        asset_digests = {}
        for asset in PUBLIC_ASSETS:
            packaged = archive.read('employment_agency/web/' + asset)
            assert packaged == (public / asset).read_bytes(), 'Stale packaged asset: ' + asset
            asset_digests[asset] = hashlib.sha256(packaged).hexdigest()
        assert 'employment_agency/demo_data/resume.txt' in names
        assert 'employment_agency/demo_data/jobs.json' in names
        assert not any(name.startswith('employment_agency/static/') for name in names), 'Legacy frontend must not remain in the wheel'
        assert not any(name.endswith(('/state.json', '/workspace.json')) for name in names)
    with tempfile.TemporaryDirectory(prefix='ea-wheel-proof-') as temp:
        root = Path(temp)
        env = root / 'venv'
        subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True)
        python = env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        with tempfile.TemporaryFile() as log:
            result = subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', str(wheel)], stdout=log, stderr=log)
            if result.returncode:
                log.seek(0); raise RuntimeError(log.read().decode())
        environment = {
            **os.environ,
            'EA_CONFIG_HOME': str(root / 'config'),
            'EA_WHEEL_ASSET_DIGESTS': json.dumps(asset_digests),
        }
        environment.pop('PYTHONPATH', None)
        subprocess.run([str(python), '-c', PROOF], cwd=root, env=environment, check=True)
        if args.browser:
            checkout = Path(__file__).resolve().parents[1]
            environment.setdefault('PLAYWRIGHT_PATH', str(checkout / 'frontend/node_modules/playwright'))
            environment['WHEEL_QUEUE_BROWSER'] = str(checkout / 'tests/wheel-queues-browser.cjs')
            subprocess.run([str(python), '-c', QUEUE_PROOF], cwd=root, env=environment, check=True)
