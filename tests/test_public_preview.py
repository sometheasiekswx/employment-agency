"""Verify the offline fixture and the approved public release."""
from contextlib import contextmanager
from email import policy
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader
from docx import Document
from reportlab.pdfgen import canvas

from employment_agency import public_catalog
from employment_agency.company_logo_assets import normalized_png
from employment_agency.public_preview import (
    ACTIVITY_MIX, SHOWCASE_LOCATIONS, export_preview, publish_resume_bundle, publish_resume_profile,
)


@contextmanager
def reviewed_publication_fixture(root, *, company_count=6):
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

    data = root / 'demo_data'
    logos = data / 'showcase_logos'
    logos.mkdir(parents=True)
    logo_path = root / 'logo.png'
    Image.new('RGBA', (32, 32), 'navy').save(logo_path)
    logo = logo_path.read_bytes()
    sha256 = hashlib.sha256(logo).hexdigest()
    (logos / f'{sha256}.png').write_bytes(logo)
    companies, jobs = [], []
    for index in range(company_count):
        city = SHOWCASE_LOCATIONS[index % len(SHOWCASE_LOCATIONS)]
        company = {
            'name': f'Example Engineering {index}',
            'listings': [],
            'picks': [],
            'logo': {
                'status': 'verified', 'sha256': sha256, 'url': 'https://example.org/mark.png',
                'page_url': 'https://example.org/about', 'evidence': 'Reviewed fixture branding.',
            },
        }
        companies.append(company)
        for position, title in enumerate((
            'Backend Engineer', 'Data Engineer', 'Platform Engineer', 'Full Stack Engineer',
        )):
            skill = 'SQL' if position == 1 else 'Python'
            url = f"https://example.org/jobs/{index}/{title.lower().replace(' ', '-')}"
            job_id = hashlib.sha256(url.encode()).hexdigest()[:24]
            jobs.append({
                'id': job_id, 'title': title, 'employer': company['name'], 'location': city,
                'city': city, 'description': f'Build and maintain engineering services using {skill}.',
                'requirements': [skill], 'source': f'reviewed:fixture-{index}', 'availability': 'retrieved',
                'url': url, 'careers_url': 'https://example.org/jobs',
            })
            company['listings'].append({
                'job_id': job_id, 'source_url': url, 'evidence': 'Reviewed fixture listing.',
                'requisition': title.split()[0].upper(),
            })
            if position < 2:
                company['picks'].append({
                    'job_id': job_id, 'reason': f'{skill} matches the listing requirements.', 'fact_terms': [skill],
                })
    catalog = {
        'schema': public_catalog.CATALOG_SCHEMA, 'mode': 'reviewed',
        'reviewed_resume_sha256': resume['sha256'],
        'jobs': jobs, 'companies': companies, 'sources': [],
    }
    if company_count == 24:
        catalog['new_employers_by_destination'] = {
            city: [company['name'] for index, company in enumerate(companies)
                   if index >= 3 and SHOWCASE_LOCATIONS[index % len(SHOWCASE_LOCATIONS)] == city]
            for city in SHOWCASE_LOCATIONS
        }
    (data / 'showcase_jobs.json').write_text(json.dumps(catalog), encoding='utf-8')
    with patch.object(public_catalog, 'DATA', data):
        yield resume, pdf, sha256


class PublicPreviewExport(unittest.TestCase):
    def test_full_size_sample_activity_is_repeatable_disjoint_and_covers_every_destination(self):
        def activity(bundle):
            state = bundle['state']
            apps = {app['job_id']: app for app in state['applications']}
            result = {stage: set() for stage in ACTIVITY_MIX}
            companies = {}
            for job in state['jobs']:
                job_id = job['id']
                if job.get('removals'):
                    stage = 'removed'
                elif job['saved']:
                    stage = 'saved'
                elif job_id in apps and apps[job_id]['status'] == 'submitted':
                    stage = 'submitted'
                    self.assertIn('No application was sent.', apps[job_id]['comments'][-1]['text'])
                elif job_id in apps:
                    stage = 'active'
                    self.assertTrue(job['demo_active'])
                else:
                    stage = 'jobs'
                result[stage].add(job_id)
                companies.setdefault(job['employer'], set()).add(stage)
            self.assertTrue(all('jobs' in stages for stages in companies.values()))
            for employer in companies:
                self.assertLessEqual(sum(
                    job['employer'] == employer and (
                        job['saved'] or job['id'] in apps
                    ) for job in state['jobs']
                ), 2)
            return result

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first, second = root / 'first', root / 'second'
            with reviewed_publication_fixture(root, company_count=24) as (resume, pdf, _):
                export_preview(first)
                export_preview(second)
                publish_resume_bundle(second, resume, pdf)
            original, approved = [
                json.loads((path / 'preview.json').read_text(encoding='utf-8')) for path in (first, second)
            ]
            original_activity, approved_activity = activity(original), activity(approved)
            self.assertEqual(original_activity, approved_activity)
            roles = approved['state']['jobs']
            self.assertEqual(len(roles), 96)
            self.assertEqual({job['city'] for job in roles}, set(SHOWCASE_LOCATIONS))
            for stage, percentage in ACTIVITY_MIX.items():
                self.assertLessEqual(abs(len(approved_activity[stage]) - len(roles) * percentage / 100), 1)
            retained = {job['id'] for job in roles
                        if job['employer'] in {f'Example Engineering {index}' for index in range(3)}}
            for stage in ('active', 'submitted', 'removed'):
                self.assertTrue(approved_activity[stage].isdisjoint(retained))
            seen = {job['id'] for job in roles if job.get('demo_new') is False}
            self.assertLessEqual(abs(2 * len(seen) - len(approved_activity['jobs'])), 1)
            self.assertLessEqual(seen, approved_activity['jobs'])
            apps = approved['state']['applications']
            self.assertEqual({app['id'] for app in apps}, set(approved['documents']))
            self.assertEqual(
                {hashlib.sha256(app['folder'].encode()).hexdigest()[:24] for app in apps},
                {row['id'] for row in approved['history']},
            )
            self.assertEqual({path.name for path in (second / 'files').iterdir()},
                             {Path(url).name for url in approved['files'].values()})
            reviews = lambda bundle: sorted(
                pick['job_id'] for review in bundle['state']['company_best_matches'] for pick in review['picks']
            )
            self.assertEqual(reviews(original), reviews(approved))

    def test_publication_keeps_reviewed_pick_when_a_vacancy_has_a_mirrored_listing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            with reviewed_publication_fixture(root) as (resume, pdf, _):
                catalog = public_catalog.load_catalog()
                company = catalog['companies'][0]
                reviewed = company['listings'][0]
                original = next(job for job in catalog['jobs'] if job['id'] == reviewed['job_id'])
                mirror_url = original['url'] + '-mirror'
                mirror_id = hashlib.sha256(mirror_url.encode()).hexdigest()[:24]
                catalog['jobs'].append({**original, 'url': mirror_url, 'id': mirror_id})
                company['listings'].insert(0, {**reviewed, 'source_url': mirror_url, 'job_id': mirror_id})
                catalog_path = public_catalog.DATA / 'showcase_jobs.json'
                catalog_path.write_text(json.dumps(catalog), encoding='utf-8')

                with patch('employment_agency.public_preview.sample_activity', return_value=({}, set())):
                    export_preview(destination)
                original_state = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))['state']
                publish_resume_bundle(destination, resume, pdf)

            state = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))['state']
            employer_id = next(job['company']['id'] for job in state['jobs'] if job['id'] == mirror_id)
            reviews = [review for review in state['company_best_matches'] if review['employer_id'] == employer_id]
            self.assertEqual(len(reviews), 1)
            self.assertEqual([pick['job_id'] for pick in reviews[0]['picks']],
                             [pick['job_id'] for pick in company['picks']])
            self.assertEqual(state['company_best_matches'], original_state['company_best_matches'])
            self.assertNotIn('company_highlight_reviews', original_state)
            self.assertNotIn('company_highlight_reviews', state)

    def test_release_replaces_all_sample_assets_using_the_approved_resume(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            with reviewed_publication_fixture(root) as (resume, pdf, logo_sha256):
                export_preview(destination)
                original = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
                publish_resume_bundle(destination, resume, pdf)

            serialized = (destination / 'preview.json').read_text(encoding='utf-8')
            bundle = json.loads(serialized)
            name = resume['name']
            self.assertNotRegex(serialized, r'(?i)alex\s*morgan|alex@example\.test|Example Labs')
            self.assertEqual(bundle['state']['identity'], {'name': name})
            self.assertEqual((destination / 'master-resume.pdf').read_bytes(), pdf)
            self.assertEqual(bundle['state']['company_best_matches'], original['state']['company_best_matches'])
            self.assertEqual(len(bundle['state']['company_best_matches'][0]['picks']), 2)
            logo_url = f'/demo/company-logos/{logo_sha256}.png'
            self.assertEqual(bundle['company_logos'], {logo_sha256: logo_url})
            logo = (destination / logo_url.removeprefix('/demo/')).read_bytes()
            self.assertEqual(hashlib.sha256(logo).hexdigest(), logo_sha256)
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

    def test_publication_rejects_an_approved_resume_that_changed_after_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            with reviewed_publication_fixture(root) as (resume, pdf, _):
                export_preview(destination)
                original = (destination / 'preview.json').read_bytes()
                changed_pdf = pdf + b'\n'
                changed_resume = {**resume, 'sha256': hashlib.sha256(changed_pdf).hexdigest()}
                with self.assertRaisesRegex(ValueError, 'résumé changed'):
                    publish_resume_bundle(destination, changed_resume, changed_pdf)
                self.assertEqual((destination / 'preview.json').read_bytes(), original)

    def test_publication_rejects_missing_highlight_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            with reviewed_publication_fixture(root) as (resume, pdf, _):
                export_preview(destination)
                original = (destination / 'preview.json').read_bytes()
                incomplete = {**resume, 'text': resume['text'].replace('Python, SQL', 'SQL')}
                with self.assertRaisesRegex(ValueError, 'public profile changed'):
                    publish_resume_bundle(destination, incomplete, pdf)
                self.assertEqual((destination / 'preview.json').read_bytes(), original)

    def test_publication_rejects_a_company_logo_with_changed_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'demo'
            with reviewed_publication_fixture(root) as (resume, pdf, logo_sha256):
                export_preview(destination)
                original = (destination / 'preview.json').read_bytes()
                logo = destination / 'company-logos' / f'{logo_sha256}.png'
                logo.write_bytes(logo.read_bytes() + b'changed')
                with self.assertRaisesRegex(ValueError, 'company logo failed verification'):
                    publish_resume_bundle(destination, resume, pdf)
                self.assertEqual((destination / 'preview.json').read_bytes(), original)

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
            self.assertGreater(summary['applications'], 0)
            self.assertTrue(bundle['public_preview'])
            self.assertTrue(bundle['state']['_workspace']['demo'])
            self.assertEqual(bundle['state']['identity']['email'], 'alex@example.test')
            self.assertEqual(bundle['state']['_workspace']['path'], 'public-fictional-preview')
            self.assertFalse(bundle['state']['_workspace'].get('agent_queue'))
            self.assertNotIn('application_queue', bundle['state'])
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
            self.assertEqual(len(bundle['documents']), summary['applications'])
            jobs = bundle['state']['jobs']
            self.assertEqual(summary['jobs'], len(jobs))
            self.assertEqual(bundle['listing_mode'], 'reviewed')
            self.assertEqual(bundle['job_sources'], [])
            reviewed = [job for job in jobs if job['url']]
            self.assertEqual(len(jobs), len(reviewed))
            self.assertTrue(bundle['current_catalog_only'])
            self.assertEqual(len({job['url'] for job in reviewed}), len(reviewed))
            profile = bundle['state']['profiles'][0]
            original_jobs = {job['id']: job for job in public_catalog.load_catalog()['jobs']}
            ranked_jobs = {row['job']['id']: row['job'] for row in bundle['rankings'][profile['id']]}
            employers = {}
            for job in reviewed:
                self.assertEqual(job['city'], original_jobs[job['id']]['city'])
                if job['id'] in ranked_jobs:
                    self.assertEqual(ranked_jobs[job['id']]['city'], job['city'])
                self.assertRegex(job['url'], r'^https://[^/]+/')
                self.assertRegex(job['careers_url'], r'^https://[^/]+(?:/|$)')
                self.assertEqual(job['availability'], 'retrieved')
                self.assertTrue(job['hiring_employer_verified'])
                employers.setdefault(job['company']['id'], []).append(job)
            reviews = {
                review['employer_id']: review['picks'] for review in bundle['state']['company_best_matches']
                if review['profile_id'] == profile['id']
            }
            self.assertEqual(set(reviews), {employer_id for employer_id, rows in employers.items() if sum(not row.get('removals') and row.get('prior_application') != 'submitted' for row in rows) > 2})
            for employer_id, rows in employers.items():
                self.assertTrue(all(row['company'].get('logo_url') for row in rows))
                if employer_id in reviews:
                    picks = reviews[employer_id]
                    self.assertEqual(len(picks), 2)
                    picked_ids = {pick['job_id'] for pick in picks}
                    self.assertEqual(len(picked_ids), 2)
                    self.assertTrue(picked_ids <= {job['id'] for job in rows})
                    self.assertTrue(all(pick['reason'].strip() for pick in picks))
            logo_files = bundle['company_logos']
            self.assertTrue(logo_files)
            self.assertEqual(set(logo_files.values()), {job['company']['logo_url'] for job in reviewed if job['company'].get('logo_url')})
            for sha256, url in logo_files.items():
                self.assertEqual(url, f'/demo/company-logos/{sha256}.png')
                body = (destination / url.removeprefix('/demo/')).read_bytes()
                self.assertEqual(hashlib.sha256(body).hexdigest(), sha256)
                self.assertTrue(normalized_png(body))
            self.assertTrue(all(app['job_id'] in original_jobs for app in bundle['state']['applications']))
            self.assertTrue(all(row['job']['id'] in original_jobs for row in bundle['rankings'][profile['id']]))

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
