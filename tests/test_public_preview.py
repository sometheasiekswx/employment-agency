"""Verify the offline fixture and the approved public release."""
from email import policy
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from pypdf import PdfReader
from docx import Document
from reportlab.pdfgen import canvas

from employment_agency.public_preview import export_preview, publish_resume_bundle, publish_resume_profile


class PublicPreviewExport(unittest.TestCase):
    def test_release_replaces_all_sample_assets_using_the_approved_resume(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            fixture = Path(__file__).resolve().parents[1] / 'frontend/public/demo'
            shutil.copytree(fixture, destination)
            original = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
            name = 'Demo Profile Owner'
            text = (f'{name}\nProfile\nBuilt software tools.\nProfessional Experience\n'
                    'Key Skills\nTechnical: Python, SQL\nEducation and Recognition')
            source = root / 'approved.pdf'
            approved = canvas.Canvas(str(source))
            for index, line in enumerate(text.splitlines()):
                approved.drawString(72, 750 - 18 * index, line)
            approved.save()
            pdf = source.read_bytes()
            resume = {'name': name, 'text': text, 'sha256': hashlib.sha256(pdf).hexdigest()}
            publish_resume_bundle(destination, resume, pdf)

            serialized = (destination / 'preview.json').read_text(encoding='utf-8')
            bundle = json.loads(serialized)
            self.assertNotRegex(serialized, r'(?i)alex\s*morgan|alex@example\.test|Example Labs')
            self.assertEqual(bundle['state']['identity'], {'name': name})
            self.assertEqual((destination / 'master-resume.pdf').read_bytes(), pdf)
            self.assertEqual(
                [(app['id'], app['status']) for app in bundle['state']['applications']],
                [(app['id'], app['status']) for app in original['state']['applications']],
            )
            history_by_id = {version['id']: version for version in bundle['history']}
            self.assertEqual(set(history_by_id), {version['id'] for version in original['history']})
            urls = set(bundle['files'].values())
            self.assertTrue(urls.isdisjoint(original['files'].values()))
            self.assertEqual({path.name for path in (destination / 'files').iterdir()},
                             {Path(url).name for url in urls})
            for app in bundle['state']['applications']:
                label = 'Sample submission' if app['status'] == 'submitted' else 'Sample application'
                version = history_by_id[hashlib.sha256(app['folder'].encode()).hexdigest()[:24]]
                self.assertEqual(version['source'], label)
                for role, filename in app['documents'].items():
                    url = bundle['files'][f'application:{app["id"]}:{role}']
                    self.assertEqual(url, bundle['files'][f'history:{version["id"]}:{filename}'])
                    path = destination / url.removeprefix('/demo/')
                    if role == 'resume.pdf':
                        self.assertEqual(path.read_bytes(), pdf)
                        self.assertEqual(bundle['documents'][app['id']]['resume']['url'], url)
                        continue
                    if role == 'application.eml':
                        message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
                        self.assertIsNone(message['From'])
                        self.assertIsNone(message['To'])
                        self.assertEqual(message['X-Unsent'], '1')
                        self.assertIn(label, message['Subject'])
                        self.assertIn(name, message['Subject'])
                        self.assertIn('No application was sent.', message.get_body().get_content())
                        attachments = list(message.iter_attachments())
                        self.assertEqual([part.get_filename() for part in attachments],
                                         [app['documents'][role] for role in ('resume.pdf', 'cover-letter.pdf')])
                        self.assertEqual(attachments[0].get_payload(decode=True), pdf)
                        continue
                    if path.suffix == '.pdf':
                        body = ' '.join(page.extract_text() for page in PdfReader(path).pages)
                    elif path.suffix == '.docx':
                        body = '\n'.join(paragraph.text for paragraph in Document(path).paragraphs)
                    else:
                        body = path.read_text(encoding='utf-8')
                    self.assertNotRegex(body, r'(?i)alex\s*morgan|alex@example\.test|Example Labs')
                    if role.startswith('cover-letter') or role == 'evidence.json':
                        self.assertIn(label, body)
                        self.assertIn('No application was sent.', body)
                    if role != 'evidence.json':
                        self.assertIn(name, body)

    def test_public_profile_uses_resume_evidence_and_keeps_example_applications(self):
        state = {
            'identity': {'name': 'Alex Morgan', 'email': 'alex@example.test'},
            'facts': [{'id': 'old', 'text': 'Fictional skill', 'confirmed': True}],
            '_workspace': {'demo': True}, '_master': {},
            'jobs': [{'id': 'job', 'title': 'Developer', 'requirements': ['Python', 'Fictional skill']}],
            'profiles': [{'id': 'profile'}],
            'applications': [{'id': 'sample', 'status': 'submitted'}],
        }
        resume = {'name': 'Demo Profile Owner', 'text': (
            'Demo Profile Owner\nProfile\nBuilt software tools.\nProfessional Experience\n'
            'Key Skills\nTechnical: Python, SQL\nManagement: Scrum\nEducation and Recognition'
        )}
        published = publish_resume_profile(state, resume)
        self.assertEqual(published['state']['identity'], {'name': resume['name']})
        self.assertEqual([fact['text'] for fact in state['facts']], ['Built software tools.', 'Python', 'SQL', 'Scrum'])
        self.assertEqual(state['_master']['path'], 'demo/master-resume.pdf')
        self.assertEqual(list(state['jobs'][0]['matched_skill_evidence']), ['Python'])
        self.assertIn('Fictional skill', published['rankings']['profile'][0]['match']['gaps'])
        self.assertEqual(state['applications'], [{'id': 'sample', 'status': 'submitted'}])

    def test_service_snapshot_and_documents_are_fictional_and_portable(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'demo'
            with patch('urllib.request.urlopen', side_effect=AssertionError('No external request allowed')), patch.dict('os.environ', {'OPENAI_API_KEY': 'never-export-this-key', 'SUPABASE_SERVICE_ROLE_KEY': 'never-export-this-secret'}):
                summary = export_preview(destination)
            bundle = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
            self.assertEqual(summary['jobs'], 38)
            self.assertEqual(summary['applications'], 7)
            self.assertTrue(bundle['public_preview'])
            self.assertTrue(bundle['state']['_workspace']['demo'])
            self.assertEqual(bundle['state']['identity']['email'], 'alex@example.test')
            self.assertEqual(bundle['state']['_workspace']['path'], 'public-fictional-preview')
            self.assertEqual(bundle['state']['consents'], {})
            self.assertEqual(bundle['state']['runs'], [])
            serialized = json.dumps(bundle)
            for forbidden in (temporary, '/Users/', 'never-export-this-key', 'never-export-this-secret'):
                self.assertNotIn(forbidden, serialized)
            for url in set(bundle['files'].values()):
                self.assertRegex(url, r'^/demo/files/[a-f0-9]{24}\.[a-z]+$')
                path = destination / url.removeprefix('/demo/')
                self.assertTrue(path.is_file())
                if path.suffix == '.pdf':
                    body = ' '.join(page.extract_text() for page in PdfReader(path).pages)
                    self.assertIn('Fictional sample profile', body)
                if path.suffix == '.docx':
                    body = ' '.join(paragraph.text for paragraph in Document(path).paragraphs)
                    self.assertIn('Fictional sample profile', body)
            self.assertEqual(len(bundle['documents']), 7)
            jobs = bundle['state']['jobs']
            sources = bundle['job_sources']
            expected = {'Singapore': 5, 'Melbourne': 4, 'New York': 5, 'London': 5, 'China': 5}
            self.assertEqual(sum(bool(job['url']) for job in jobs), sum(expected.values()))
            for destination, count in expected.items():
                rows = [job for job in jobs if job['url'] and destination in job['location']]
                self.assertEqual(len(rows), count)
                self.assertEqual(sum(source['count'] for source in sources if source['destination'] == destination), count)
                for job in rows:
                    self.assertRegex(job['url'], r'^https://jobs\.smartrecruiters\.com/[A-Za-z0-9_-]+/\d+$')
                    self.assertRegex(job['careers_url'], r'^https://careers\.smartrecruiters\.com/[A-Za-z0-9_-]+$')
                    self.assertEqual(job['availability'], 'Employer snapshot')
            self.assertEqual(sum(job['saved'] for job in jobs), 3)
            self.assertEqual(sum(bool(job.get('removals')) for job in jobs), 2)
            statuses = [app['status'] for app in bundle['state']['applications']]
            self.assertEqual(statuses.count('submitted'), 3)
            self.assertEqual(statuses.count('draft') + statuses.count('reviewed'), 4)
            profile = bundle['state']['profiles'][0]
            self.assertEqual(len(bundle['rankings'][profile['id']]), 38)

    def test_export_refuses_unrelated_or_extra_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'demo'
            destination.mkdir()
            sentinel = destination / 'keep.txt'
            sentinel.write_text('preserve this file')
            with self.assertRaisesRegex(ValueError, 'Refusing'):
                export_preview(destination)
            self.assertEqual(sentinel.read_text(), 'preserve this file')
            sentinel.unlink()
            destination.rmdir()
            export_preview(destination)
            sentinel.write_text('preserve this file')
            with self.assertRaisesRegex(ValueError, 'unrelated files'):
                export_preview(destination)
            self.assertEqual(sentinel.read_text(), 'preserve this file')


if __name__ == '__main__':
    unittest.main()
