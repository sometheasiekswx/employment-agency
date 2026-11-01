"""Install a built wheel outside the checkout and verify its runtime contract."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


PROOF = r'''
from pathlib import Path
import sys
import threading
import urllib.request
import re
import employment_agency
from employment_agency.store import Workspace, restore
from employment_agency.service import Service
from employment_agency.server import server
from employment_agency import packages

assert Path(employment_agency.__file__).resolve().is_relative_to(Path(sys.prefix).resolve())
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
        for route in ['/', '/career/', '/search/', '/settings/', '/history/']:
            with urllib.request.urlopen(url + route) as response:
                assert response.status == 200
                html = response.read().decode()
                assert '/_next/' in html
                assert "'sha256-" in response.headers['Content-Security-Policy']
            for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
                with urllib.request.urlopen(url + src) as response:
                    assert response.status == 200 and response.read()
        with urllib.request.urlopen(urllib.request.Request(url + '/career/', method='HEAD')) as response:
            assert response.status == 200 and response.read() == b''
    finally:
        http.shutdown(); http.server_close(); thread.join()
finally:
    workspace.close()
print('Installed wheel: routes/assets, document generation and submitted export/restore PASS')
from employment_agency.demo import create, open_existing
example = create(Path('demo-workspace'))
assert example['demo'] and example['applications'] == 12 and example['jobs'] == 14
assert open_existing(Path('demo-workspace'))['demo']
print('Installed wheel: approval-gated recording delivery with exact PDF PASS')
print('Installed wheel: offline demo data and document generation PASS')
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('wheel', type=Path)
    wheel = parser.parse_args().wheel.resolve()
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        for route in ['', 'career/', 'search/', 'settings/', 'history/']:
            assert 'employment_agency/web/' + route + 'index.html' in names
        assert 'employment_agency/web/fonts/OFL.txt' in names
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
        environment = {**os.environ, 'EA_CONFIG_HOME': str(root / 'config')}
        environment.pop('PYTHONPATH', None)
        subprocess.run([str(python), '-c', PROOF], cwd=root, env=environment, check=True)
