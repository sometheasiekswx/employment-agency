"""Fictional discovery, HTTP, and recovery evidence for company branding."""

from contextlib import closing
from email.message import Message
from io import BytesIO
from pathlib import Path
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
from time import monotonic
import unittest
from unittest.mock import MagicMock, patch
import zipfile

from PIL import Image
from PIL.PngImagePlugin import PngInfo

from employment_agency import application_context, company_logo_assets as assets
from employment_agency import companies, company_logo_pages, company_logos, packages, public_pages, sources, store
from employment_agency.hosted import app
from employment_agency.service import Service
import test_tailscale
import test_workflow


HOME = 'https://employer.example.test/'
LOGO = 'https://cdn.example.test/marks/company.png'


def image_bytes(size=(240, 120), kind='PNG'):
    buffer = BytesIO()
    image = Image.new('RGB', size, '#2465af')
    if kind == 'PNG':
        metadata = PngInfo()
        metadata.add_text('Comment', 'Fictional input metadata')
        image.save(buffer, format=kind, pnginfo=metadata)
    else:
        image.save(buffer, format=kind)
    return buffer.getvalue()


def response(url, body, media):
    headers = Message()
    headers['Content-Type'] = media
    return sources.PublicResponse(body, url, headers, 200)


def structured_page(structured, extra=''):
    return ('<html><head><title>Fictional site</title>'
            f'<script type="application/ld+json">{json.dumps(structured)}</script>{extra}'
            '</head><body><main>Build services.</main></body></html>').encode()


def job_posting(name, logo=None, title='Software Engineer'):
    organization = {'@type': 'Organization', 'name': name}
    if logo is not None:
        organization['logo'] = logo
    return {'@type': 'JobPosting', 'title': title, 'description': 'Build Python services.',
            'hiringOrganization': organization}


class LogoAssetTests(unittest.TestCase):
    def test_normalizes_formats_and_removes_non_image_metadata(self):
        for kind, media in [('PNG', 'image/png'), ('JPEG', 'image/jpeg'), ('WEBP', 'image/webp')]:
            with self.subTest(kind=kind):
                result = assets.normalize(image_bytes(kind=kind), media)
                self.assertLessEqual(len(result), assets.ASSET_LIMIT)
                with Image.open(BytesIO(result)) as image:
                    self.assertEqual((image.format, image.size), ('PNG', (192, 96)))
                    self.assertEqual(image.info, {})

    def test_unsupported_rasters_fail_before_rendering(self):
        animated = BytesIO()
        Image.new('RGB', (12, 12), 'red').save(
            animated, format='PNG', save_all=True, append_images=[Image.new('RGB', (12, 12), 'blue')],
        )
        candidates = [
            (b'<svg/>', 'image/svg+xml'), (b'not an image', 'image/png'),
            (image_bytes(kind='JPEG'), 'image/png'), (image_bytes()[:-20], 'image/png'),
            (b'x' * (assets.INPUT_LIMIT + 1), 'image/png'),
            (image_bytes((assets.MAX_SIDE + 1, 1)), 'image/png'),
            (image_bytes((1400, 1500)), 'image/png'), (animated.getvalue(), 'image/png'),
        ]
        for index, (body, media) in enumerate(candidates):
            with self.subTest(index=index), self.assertRaises(assets.UnsupportedLogo):
                assets.normalize(body, media)

    def test_logo_response_requires_one_unambiguous_raster_media_type(self):
        with patch.object(sources, 'request') as fetch:
            body = image_bytes()
            for headers in (Message(), response(LOGO, body, 'image/png').headers):
                if 'Content-Type' in headers:
                    headers['Content-Type'] = 'text/html'
                fetch.return_value = sources.PublicResponse(body, LOGO, headers, 200)
                with self.assertRaisesRegex(assets.UnsupportedLogo, 'single raster media type'):
                    assets.retrieve(LOGO, monotonic() + 2)

    def test_https_validation_rechecks_redirects_before_a_tls_connection(self):
        for url in ('http://public.example.test/logo.png', 'https://x@public.example.test/logo.png',
                    'https://public.example.test/logo.png?private=token',
                    'https://public.example.test/logo.png?ver=6.9.1&%74oken=secret',
                    'https://public.example.test/logo.png?X-Amz-Signature=secret',
                    'https://public.example.test/logo.png?redirect=https%3A%2F%2Fexample.test%2F',
                    'https://public.example.test/logo.png?ver=1%0A2',
                    'https://public.example.test/logo.png?ver=1&ver=2',
                    'https://public.example.test/logo.png?v=' + 'a' * 300,
                    'https://public.example.test/FAVICON.PNG'):
            with self.subTest(url=url), patch.object(sources, 'PinnedHTTPS') as connect:
                with self.assertRaises(assets.UnsupportedLogo):
                    assets.retrieve(url, monotonic() + 2)
                connect.assert_not_called()

        for private_ip in ('127.0.0.1', '::ffff:10.0.0.1'):
            with self.subTest(address=private_ip), patch.object(sources, 'PinnedHTTPS') as connect:
                with patch.object(socket, 'getaddrinfo', return_value=[(None, None, None, '', (private_ip, 443))]):
                    with self.assertRaisesRegex(sources.SourceError, 'Private or reserved'):
                        assets.retrieve(LOGO, monotonic() + 2)
                connect.assert_not_called()

        hops = []
        connection = MagicMock()
        redirect = connection.getresponse.return_value
        redirect.__enter__.return_value = redirect
        redirect.status = 302
        redirect.getheader.return_value = '/marks/next.png'

        def lookup(host, *_args, **_kwargs):
            hops.append(host)
            ip = '1.1.1.1' if len(hops) == 1 else '127.0.0.1'
            return [(None, None, None, '', (ip, 443))]

        with patch.object(socket, 'getaddrinfo', side_effect=lookup), patch.object(
            sources, 'PinnedHTTPS', return_value=connection,
        ) as connect:
            with self.assertRaisesRegex(sources.SourceError, 'Private or reserved'):
                assets.retrieve(LOGO, monotonic() + 2)
            self.assertEqual(hops, ['cdn.example.test', 'cdn.example.test'])
            self.assertEqual(connect.call_args.args[:2], ('cdn.example.test', '1.1.1.1'))
            connect.assert_called_once()
            redirect.getheader.return_value = 'https://elsewhere.example.test/mark.png'
            hops.clear()
            with self.assertRaisesRegex(assets.UnsupportedLogo, 'outside'):
                assets.retrieve(LOGO, monotonic() + 2)
            self.assertEqual(len(hops), 1)
            redirect.getheader.return_value = '/marks/next.png?access_token=secret'
            hops.clear()
            with self.assertRaises(assets.UnsupportedLogo):
                assets.retrieve(LOGO + '?ver=6.9.1', monotonic() + 2)
            self.assertEqual(len(hops), 1)

    def test_safe_logo_query_is_sent_to_the_pinned_https_transport(self):
        candidate = LOGO + '?ver=6.9.1&format=png&w=192&fit=contain'
        connection = MagicMock()
        download = connection.getresponse.return_value
        download.__enter__.return_value = download
        result = response(candidate, image_bytes(), 'image/png')
        download.status = result.status
        download.headers = result.headers
        download.length = None
        download.isclosed.return_value = False
        download.read1.side_effect = [result.body, b'']
        with patch.object(sources, 'public_addresses', return_value=['1.1.1.1']), patch.object(
            sources, 'PinnedHTTPS', return_value=connection,
        ):
            image, final = assets.retrieve(candidate, monotonic() + 2)
        self.assertEqual(final, candidate)
        self.assertTrue(image.startswith(assets.PNG_SIGNATURE))
        self.assertEqual(connection.request.call_args.args[:2],
                         ('GET', '/marks/company.png?ver=6.9.1&format=png&w=192&fit=contain'))

    def test_source_discards_oversized_stream_before_decoding(self):
        connection = MagicMock()
        download = connection.getresponse.return_value
        download.__enter__.return_value = download
        download.status = 200
        download.isclosed.return_value = False
        download.read1.side_effect = lambda size: b'x' * size
        with patch.object(sources, 'public_addresses', return_value=['1.1.1.1']), patch.object(
            sources, 'PinnedHTTPS', return_value=connection,
        ), patch.object(assets, 'normalize') as decode:
            for length in (assets.INPUT_LIMIT + 1, None):
                with self.subTest(announced_length=length), self.assertRaisesRegex(assets.UnsupportedLogo, 'size limit'):
                    download.length = length
                    assets.retrieve(LOGO, monotonic() + 2)
            decode.assert_not_called()
            self.assertEqual(sum(args[0] for args, _ in download.read1.call_args_list), assets.INPUT_LIMIT + 1)

    def test_branding_stops_waiting_if_a_network_operation_stalls(self):
        waiting = threading.Event()
        released = threading.Event()
        finished = threading.Event()

        def slow_fetch(*_args, **_kwargs):
            waiting.set()
            released.wait(2)
            finished.set()
            raise TimeoutError('Fictional DNS timeout')

        try:
            start = monotonic()
            with patch.object(sources, 'request', side_effect=slow_fetch), self.assertRaises(TimeoutError):
                assets.retrieve(LOGO, start + 0.10)
            self.assertTrue(waiting.is_set())
            self.assertLess(monotonic() - start, 0.9)
        finally:
            released.set()
            self.assertTrue(finished.wait(2))

    def test_page_only_accepts_explicit_matching_marks(self):
        meta = '<link rel="icon" href="/icon.png"><meta property="og:image" content="/social.png">'
        wrong = structured_page({'@type': 'Organization', 'name': 'Fictional Publisher', 'logo': '/logo.png'}, meta)
        self.assertIsNone(company_logo_pages.logo_from_html(wrong, HOME, {'fictional systems'}))
        good = structured_page({'@graph': [
            {'@type': 'Organization', 'name': 'Fictional Publisher', 'logo': '/logo.png'},
            job_posting('Fictional Systems', {'@type': 'ImageObject', 'contentUrl': LOGO}),
        ]}, meta)
        self.assertEqual(company_logo_pages.logo_from_html(good, HOME, {'fictional systems'}), LOGO)
        branded_header = b'<header><a href="/"><img src="/mark.png" alt="Fictional Systems Logo"></a></header>'
        self.assertEqual(company_logo_pages.logo_from_html(branded_header, HOME, {'fictional systems'}),
                         HOME + 'mark.png')
        localized = (b'<header><a href="/en/personal/"><img src="/mark.png" alt="Fictional Systems Logo"></a>'
                     b'<a href="/en/"><img src="/generic.png" alt="Logo"></a></header>')
        self.assertEqual(company_logo_pages.logo_from_html(localized, HOME + 'en/', {'fictional systems'}),
                         HOME + 'mark.png')
        foreign_link = localized.replace(b'/en/personal/', b'https://another.example.test/en/personal/')
        self.assertIsNone(company_logo_pages.logo_from_html(foreign_link, HOME + 'en/', {'fictional systems'}))
        ambiguous = structured_page([job_posting('Fictional Systems', '/logo.png'),
                                     job_posting('Fictional Systems', '/logo2.png')])
        with self.assertRaisesRegex(assets.UnsupportedLogo, 'conflicting'):
            company_logo_pages.logo_from_html(ambiguous, HOME, {'fictional systems'})


class CompanyLogoWorkspaceTests(unittest.TestCase):
    seed = test_workflow.Workflow.seed
    tearDown = test_workflow.Workflow.tearDown

    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.w.close()
        self.w = store.Workspace(self.root / 'sqlite', sqlite=True)
        self.s = Service(self.w)
        _, self.profile, self.first = self.seed()
        self.mark = image_bytes()

    def listing(self, name, suffix, *, verified=False):
        link = None
        job = self.s.action('job', {**self.first, 'id': None, 'url': HOME + suffix, 'employer': name})
        if verified:
            link = self.s.action('company-map', {'job_id': job['id'], 'confirmed': True})
        return job, link

    def inventory(self):
        return self.s.action('company-logo-inventory', {})

    def backfill(self, ids, evidence=None):
        return self.s.action('company-logo-backfill', {
            'workspace_id': self.w.workspace_id, 'company_ids': ids, 'sources': evidence or {},
        })

    def confirm_source(self, job, *, publisher=True):
        return self.s.action('company-resolve', {
            'job_id': job['id'], 'name': job['employer'], 'verified': True,
            'source_url': job['url'], 'evidence': 'Fictional employer-owned careers site',
            **({'publisher_evidence': 'Independently verified fictional corporate publisher'} if publisher else {}),
        })

    def test_discovery_retrieves_a_logo_only_after_official_identity_verification(self):
        # The relative image is on the publisher, not the JobPosting.url.
        page_url = HOME + 'careers/index.html'
        parsed = job_posting('Fictional Systems', {'@type': 'ImageObject', 'contentUrl': 'logo.png?ver=6.9.1'})
        parsed['url'] = HOME + 'roles/python'
        page = public_pages.html_page(structured_page(parsed), page_url)
        candidate = HOME + 'careers/logo.png?ver=6.9.1'
        self.assertEqual(page['jobs'][0]['employer_evidence']['logo'],
                         {'url': candidate, 'page_url': page_url})
        with patch.object(sources, 'request', return_value=response(candidate, self.mark, 'image/png')) as fetch:
            ids, _, _ = self.s.import_discovery(page['jobs'])
            fetch.assert_not_called()
            job = next(job for job in self.w.read()['jobs'] if job['id'] == ids[0])
            key = application_context.listing_sha256(job)
            mapped = self.s.action('company-map', {'job_id': job['id'], 'confirmed': True})
            fetch.assert_not_called()
            checked = self.confirm_source(job, publisher=False)
            fetch.assert_not_called()
            self.assertNotIn('publisher_provenance', checked)
            verified = self.confirm_source(job)
            self.assertEqual((verified['employer_id'], verified['vacancy_id']),
                             (checked['employer_id'], checked['vacancy_id']))
            self.assertIn('publisher_provenance', verified)
            self.assertEqual((checked['employer_id'], checked['vacancy_id']),
                             (mapped['employer_id'], mapped['vacancy_id']))
            fetch.assert_called_once()
            self.assertEqual(fetch.call_args.args[0], candidate)
            self.s.import_discovery(page['jobs'])
            fetch.assert_called_once()
        raw = next(job for job in self.w.read()['jobs'] if job['id'] == ids[0])
        public = next(job for job in self.s.state()['jobs'] if job['id'] == raw['id'])
        self.assertEqual(application_context.listing_sha256(raw), key)
        self.assertRegex(public['company']['logo_url'], r'^/api/company-logo/[a-f0-9]{64}\.png$')
        self.assertNotIn('logo', public['employer_evidence'])
        ranked = next(row['job'] for row in self.s.action('rank', {'profile_id': self.profile['id']})
                      if row['job']['id'] == raw['id'])
        self.assertEqual(ranked['company']['logo_url'], public['company']['logo_url'])
        self.assertNotIn('logo', ranked['employer_evidence'])

    def test_role_publisher_cannot_supply_the_company_mark(self):
        posting = job_posting('Fictional Systems', '/recruiter-mark.png')
        job = sources.structured_job(posting, 'https://recruiter.example.test/role')
        conflict = sources.structured_job(posting, HOME, advert='Employer: Different Company')
        self.assertNotIn('logo', conflict['employer_evidence'])
        boards = sources.structured_job(posting, 'https://jobs.lever.co/fictional/role')
        with patch.object(sources, 'request') as fetch:
            (job_id, board_id), _, _ = self.s.import_discovery([job, boards])
            verified = self.s.action('company-map', {'job_id': job_id, 'confirmed': True})
            board = next(row for row in self.w.read()['jobs'] if row['id'] == board_id)
            self.confirm_source(board, publisher=False)
            with self.assertRaisesRegex(ValueError, 'official employer site'):
                self.confirm_source(board)
            self.s.import_discovery([job, boards])
            fetch.assert_not_called()
        self.assertEqual(next(row for row in self.inventory()['companies'] if row['id'] == verified['employer_id'])['status'],
                         'missing')

    def test_two_employers_on_a_shared_host_need_independent_branding_evidence(self):
        company, _ = self.listing('Fictional Systems', 'shared-company-role')
        another, _ = self.listing('Fictional Partner', 'shared-partner-role')
        self.confirm_source(company)
        self.confirm_source(another)
        posting = sources.structured_job(job_posting('Fictional Systems', LOGO), company['url'])
        with patch.object(sources, 'request') as fetch:
            self.s.import_discovery([posting])
            fetch.assert_not_called()
        self.assertTrue(all(not row['sources'] for row in self.inventory()['companies'] if row['employer_id']))

    def test_asset_failure_preserves_a_valid_listing_import(self):
        self.listing('Fictional Systems', 'official')
        job = self.w.read()['jobs'][-1]
        self.confirm_source(job)
        posting = sources.structured_job(job_posting('Fictional Systems', LOGO), HOME + 'new-role')
        with patch.object(sources, 'request', side_effect=TimeoutError()):
            result = self.s.import_discovery([posting])
        self.assertEqual(len(result[0]), 1)
        self.assertEqual(self.inventory()['companies'][0]['status'], 'missing')

    def test_inventory_and_backfill_include_legacy_records_and_preserve_state(self):
        resolved = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})
        employer_id = resolved['employer_id']
        self.s.action('save-job', {'id': self.first['id'], 'saved': True})
        submitted_job, submitted_link = self.listing('Fictional Submitted Ltd', 'submitted', verified=True)
        self.s.action('local-package', {'job_id': submitted_job['id'], 'profile_id': self.profile['id']})
        version = self.w.read()['applications'][-1]
        self.s.action('review', {'id': version['id'], 'status': 'submitted', 'occurred_at': '2026-01-01'})
        receipt = self.w.path / 'records' / 'fixture-receipts' / 'submitted.json'
        store.atomic(receipt, b'{"reference":"fictional receipt 2048"}')
        removed, _ = self.listing('Fictional Removed', 'removed')
        self.s.action('remove-job', {'id': removed['id'], 'removal_id': store.uid()})
        with self.w.edit() as state:
            state['historical_decisions'] = [{'employer': 'Fictional Legacy', 'status': 'sent', 'title': 'Engineer'}]
            state['applications'].append({'id': 'legacy-draft', 'job_id': 'legacy-orphan', 'status': 'draft',
                                          'employer': 'Fictional Orphan', 'title': 'Engineer'})
            state['unlisted_removals'] = {'removed-without-history': [{'id': 'removed', 'at': '2026-02-01'}]}
            state['submission_attempts'] = [{'id': 'attempt-2048', 'status': 'confirmed',
                                             'binding': {'job_id': submitted_job['id']},
                                             'occurred_at': '2026-01-01', 'receipt': {'reference': 'fictional receipt'}}]
        before = self.w.read()
        before_queue = self.s.action('application-queue', {'history': True})
        original = packages.path_for(self.w.path, version, 'resume.pdf').read_bytes()
        found = {row['name']: row for row in self.inventory()['companies']}
        self.assertEqual(set(found), {'Fictional Systems', 'Fictional Submitted Ltd', 'Fictional Legacy',
                                     'Fictional Removed', 'Fictional Orphan', 'Unknown employer'})
        self.assertEqual(found['Fictional Legacy']['history_ids'], [companies.history_id(before['historical_decisions'][0])])
        self.assertEqual(found['Fictional Orphan']['application_ids'], ['legacy-draft'])
        self.assertEqual(found['Fictional Removed']['job_ids'], [removed['id']])
        self.assertEqual(found['Unknown employer']['job_ids'], ['removed-without-history'])
        self.assertEqual(found['Fictional Submitted Ltd']['attempt_ids'], ['attempt-2048'])
        self.assertEqual(found['Fictional Submitted Ltd']['application_ids'], [version['id']])
        ids = [employer_id, found['Fictional Removed']['id'], submitted_link['employer_id']]
        evidence = {employer_id: {'url': HOME, 'evidence': 'Authoritative fictional About page'}}
        page = structured_page({'@type': 'Organization', 'name': self.first['employer'], 'logo': LOGO})
        with patch.object(sources, 'request', side_effect=[
            response(HOME, page, 'text/html'), response(LOGO, self.mark, 'image/png'),
        ]) as fetch:
            self.assertEqual(self.backfill(ids, evidence)['counts'], {'success': 1, 'unresolved': 1, 'missing': 1})
            revision = self.w.database.summary()['revision']
            self.assertEqual(self.backfill(ids, evidence)['counts'],
                             {'already_present': 1, 'unresolved': 1, 'missing': 1})
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(self.w.database.summary()['revision'], revision)
        after = self.w.read()
        for row in after['employers']:
            if row['id'] == employer_id:
                self.assertEqual(row.pop('logo')['source'], 'operator-verified-branding')
        self.assertEqual(after, before)
        self.assertEqual(self.s.action('application-queue', {'history': True}), before_queue)
        self.assertEqual(packages.path_for(self.w.path, version, 'resume.pdf').read_bytes(), original)
        self.assertEqual(receipt.read_bytes(), b'{"reference":"fictional receipt 2048"}')

    def test_backfill_reports_unsupported_failed_and_stale_requests(self):
        employer_id = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})['employer_id']
        evidence = {employer_id: {'url': HOME, 'evidence': 'Verified fictional employer'} }
        page = structured_page(job_posting(self.first['employer'], LOGO))
        for result, expected in [
            (response(LOGO, b'<svg/>', 'image/svg+xml'), 'unsupported'),
            (ConnectionError('Fixture network stopped'), 'failure'),
        ]:
            with self.subTest(status=expected), patch.object(
                sources, 'request', side_effect=[response(HOME, page, 'text/html'), result],
            ):
                self.assertEqual(self.backfill([employer_id], evidence)['counts'], {expected: 1})
            self.assertEqual(self.inventory()['companies'][0]['status'], 'missing')
        with patch.object(sources, 'request') as fetch:
            with self.assertRaisesRegex(ValueError, 'inventory again'):
                self.backfill([employer_id, 'stale-record'], evidence)
            with self.assertRaisesRegex(ValueError, 'workspace ID'):
                self.s.action('company-logo-backfill', {'workspace_id': 'different-workspace',
                                                        'company_ids': [employer_id]})
            fetch.assert_not_called()

    def test_explicit_branding_source_failure_never_tries_the_saved_publisher(self):
        name = self.first['employer']
        board = 'https://fictional-opportunities.example.test/'
        posting_url = board + 'listing'
        saved_candidate = sources.structured_job(job_posting(name, board + 'mark.png'), posting_url)
        (job_id,), _, _ = self.s.import_discovery([saved_candidate])
        with patch.object(sources, 'request', side_effect=TimeoutError('Fictional board')):
            linked = self.confirm_source(companies.by_id(self.w.read()['jobs'], job_id), publisher=False)
        employer_id = linked['employer_id']
        official = HOME + 'about'
        evidence = {employer_id: {'url': official, 'evidence': 'Independently verified fictional employer site'}}
        before = self.w.read()
        with patch.object(sources, 'request') as fetch:
            self.assertEqual(self.backfill([employer_id])['counts'], {'missing': 1})
            fetch.assert_not_called()
        official_job, _ = self.listing(name, 'careers/other-role')
        self.assertEqual(self.confirm_source(official_job)['employer_id'], employer_id)
        entry = next(row for row in self.inventory()['companies'] if row['id'] == employer_id)
        self.assertEqual(entry['sources'], [HOME, official_job['url']])
        before = self.w.read()
        for outcome, expected in (
            (TimeoutError('Fictional official page unavailable'), 'failure'),
            (response(official, b'<html><title>Official company</title></html>', 'text/html'), 'missing'),
        ):
            requested = []

            def fetch(url, **_):
                requested.append(url)
                if url == official:
                    if isinstance(outcome, Exception):
                        raise outcome
                    return outcome
                if url in (board, HOME):
                    return response(url, structured_page(job_posting(name, url + 'mark.png')), 'text/html')
                return response(url, self.mark, 'image/png')

            with self.subTest(status=expected), patch.object(sources, 'request', side_effect=fetch):
                self.assertEqual(self.backfill([employer_id], evidence)['counts'], {expected: 1})
                self.assertEqual(requested, [official])
                self.assertEqual(self.w.read(), before)
                self.assertFalse((self.w.path / assets.ASSET_FOLDER).exists())

    def test_reviewed_logo_replay_requires_exact_normalized_bytes(self):
        employer_id = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})['employer_id']
        official = HOME + 'about'
        markup = structured_page({'@type': 'Organization', 'name': self.first['employer'], 'logo': LOGO})
        expected = store.digest(assets.normalize(self.mark, 'image/png'))
        changed = image_bytes((192, 72))
        request = {'url': official, 'evidence': 'Independently verified fictional employer site',
                   'expected_sha256': expected}
        before = self.w.read()
        with patch.object(sources, 'request', side_effect=[
            response(official, markup, 'text/html'), response(LOGO, changed, 'image/png'),
        ]) as fetch:
            mismatch = self.backfill([employer_id], {employer_id: request})['companies'][0]
        self.assertEqual(mismatch['status'], 'failure')
        self.assertIn('differs from the reviewed', mismatch['reason'])
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [official, LOGO])
        self.assertEqual(self.w.read(), before)
        self.assertFalse((self.w.path / assets.ASSET_FOLDER).exists())

        with patch.object(sources, 'request', side_effect=[
            response(official, markup, 'text/html'), response(LOGO, self.mark, 'image/png'),
        ]):
            saved = self.backfill([employer_id], {employer_id: request})['companies'][0]
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['sha256'], expected)
        self.assertEqual(saved['page_url'], official)
        before = self.w.read()
        revision = self.w.database.summary()['revision']
        with patch.object(sources, 'request') as fetch:
            matching = self.backfill([employer_id], {employer_id: request})['companies'][0]
            nonmatching = {**request, 'expected_sha256': store.digest(assets.normalize(changed, 'image/png'))}
            differs = self.backfill([employer_id], {employer_id: nonmatching})['companies'][0]
            with self.assertRaisesRegex(ValueError, 'expected logo SHA-256'):
                self.backfill([employer_id], {employer_id: {**request, 'expected_sha256': 'malformed'}})
            fetch.assert_not_called()
        self.assertEqual(matching['status'], 'already_present')
        self.assertEqual(matching['sha256'], expected)
        self.assertEqual(matching['page_url'], official)
        self.assertEqual(differs['status'], 'failure')
        self.assertEqual(differs['sha256'], expected)
        self.assertEqual(self.w.read(), before)
        self.assertEqual(self.w.database.summary()['revision'], revision)

    def test_reviewed_image_is_declared_by_the_selected_page_before_save(self):
        employer_id = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})['employer_id']
        official = HOME + 'en/about/'
        candidate = HOME + 'en/marks/compact.png?ver=2'
        foreign = 'https://other.example.test/compact.png'
        expected = store.digest(assets.normalize(self.mark, 'image/png'))
        request = {'url': official, 'evidence': 'Independently reviewed official page and published image',
                   'logo_url': candidate, 'expected_sha256': expected}
        before = self.w.read()
        for label, selected, markup, status in (
            ('generic social image', candidate, f'<meta property="og:image" content="{candidate}">'.encode(), 'missing'),
            ('incidental anchor', candidate, f'<a href="{candidate}">link</a>'.encode(), 'missing'),
            ('embedded proxy URL', candidate, f'<img src="/optimize?url={candidate}">'.encode(), 'missing'),
            ('foreign generic asset', foreign, f'<img src="{foreign}" alt="logo">'.encode(), 'missing'),
            ('not the declared URL', candidate, b'<img src="../marks/compact.png?ver=3">', 'missing'),
            ('conflicting brand ownership', candidate, structured_page({'@graph': [
                {'@type': 'Organization', 'name': self.first['employer'], 'logo': candidate},
                {'@type': 'Organization', 'name': 'Fictional Partner', 'logo': candidate},
            ]}), 'unsupported'),
        ):
            with self.subTest(label=label), patch.object(
                sources, 'request', return_value=response(official, markup, 'text/html'),
            ) as fetch:
                outcome = self.backfill([employer_id], {employer_id: {**request, 'logo_url': selected}})
                self.assertEqual(outcome['counts'], {status: 1})
                self.assertEqual([call.args[0] for call in fetch.call_args_list], [official])
                self.assertEqual(self.w.read(), before)
                self.assertFalse((self.w.path / assets.ASSET_FOLDER).exists())
        with patch.object(sources, 'request') as fetch:
            incomplete = {key: value for key, value in request.items() if key != 'expected_sha256'}
            with self.assertRaisesRegex(ValueError, 'when selecting an exact logo URL'):
                self.backfill([employer_id], {employer_id: incomplete})
            fetch.assert_not_called()

        automatic = {'@type': 'Organization', 'name': self.first['employer'], 'logo': LOGO}
        marked_page = structured_page(automatic, '<img src="../marks/compact.png?ver=2" alt="logo">')
        with patch.object(sources, 'request', side_effect=[
            response(official, marked_page, 'text/html'), response(candidate, self.mark, 'image/png'),
        ]) as fetch:
            outcome = self.backfill([employer_id], {employer_id: request})['companies'][0]
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [official, candidate])
        self.assertEqual((outcome['status'], outcome['sha256'], outcome['page_url']), ('success', expected, official))
        recorded = companies.by_id(self.w.read()['employers'], employer_id)['logo']
        self.assertEqual((recorded['requested_page'], recorded['url'], recorded['reviewed_url']),
                         (official, candidate, candidate))
        self.assertEqual(company_logos.logo_bytes(self.w, expected), assets.normalize(self.mark, 'image/png'))

        with patch.object(sources, 'request', return_value=response(official, marked_page, 'text/html')) as fetch:
            self.assertEqual(self.backfill([employer_id], {employer_id: request})['counts'], {'already_present': 1})
            fetch.assert_not_called()
            replacement = {**request, 'logo_url': HOME + 'en/marks/stale.png?ver=2'}
            self.assertEqual(self.backfill([employer_id], {employer_id: replacement})['counts'], {'missing': 1})
            self.assertEqual([call.args[0] for call in fetch.call_args_list], [official])
        self.assertEqual(companies.by_id(self.w.read()['employers'], employer_id)['logo'], recorded)
        self.assertIn(official, next(row['sources'] for row in self.inventory()['companies'] if row['id'] == employer_id))

    def test_backfill_accepts_localized_navigation_for_exact_named_header_mark(self):
        employer_id = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})['employer_id']
        official = HOME + 'en/'
        image = HOME + 'en/mark.png'
        markup = (b'<header><a href="/en/personal/"><img src="mark.png" alt="Fictional Systems Logo">'
                  b'</a></header>')
        evidence = {employer_id: {'url': official, 'evidence': 'Independently verified fictional employer site'}}
        with patch.object(sources, 'request', side_effect=[
            response(official, markup, 'text/html'), response(image, self.mark, 'image/png'),
        ]) as fetch:
            self.assertEqual(self.backfill([employer_id], evidence)['counts'], {'success': 1})
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [official, image])

    def test_verified_saved_site_can_backfill_without_extra_operator_evidence(self):
        job, _ = self.listing('Fictional Lab', 'careers/job')
        employer_id = self.confirm_source(job)['employer_id']
        expected = ['https://employer.example.test/', job['url']]
        entry = next(row for row in self.inventory()['companies'] if row['id'] == employer_id)
        self.assertEqual(entry['sources'], expected)
        logo = HOME + 'lab.png?ver=6.9.1&format=png'
        markup = structured_page({'@type': 'Organization', 'name': job['employer'],
                                  'logo': '/lab.png?ver=6.9.1&format=png'})
        with patch.object(sources, 'request', side_effect=[
            response(HOME, markup, 'text/html'), response(logo, self.mark, 'image/png'),
        ]) as fetch:
            self.assertEqual(self.backfill([employer_id])['counts'], {'success': 1})
            self.assertEqual([call.args[0] for call in fetch.call_args_list], [HOME, logo])

    def test_portable_restore_never_serves_oversized_animated_or_corrupt_pngs(self):
        employer_id = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})['employer_id']
        animated = BytesIO()
        Image.new('RGB', (12, 12), 'red').save(
            animated, format='PNG', save_all=True, append_images=[Image.new('RGB', (12, 12), 'blue')],
        )
        for label, data in [('oversized', image_bytes((assets.MAX_SIDE + 1, 1))),
                            ('animated', animated.getvalue()), ('corrupt', self.mark[:40])]:
            sha256 = store.digest(data)
            store.atomic(assets.asset_path(self.w.path, sha256), data)
            with self.w.edit() as state:
                companies.by_id(state['employers'], employer_id)['logo'] = {'sha256': sha256, 'source': 'fixture'}
            archive = self.w.export(self.root / f'{label}.zip')
            for kind in ('zip', 'snapshot'):
                with self.subTest(image=label, restore=kind):
                    target = self.root / f'{label}-{kind}'
                    if kind == 'zip':
                        store.restore(archive, target)
                    else:
                        store.restore_snapshot(self.w.path, target)
                    with closing(store.Workspace(target, create=False)) as restored:
                        self.assertIsNone(company_logos.logo_bytes(restored, sha256))
                        self.assertNotIn('logo_url', Service(restored).state()['jobs'][0]['company'])
                        self.assertEqual(assets.asset_path(target, sha256).read_bytes(), data)

    def test_concurrent_provenance_change_cannot_attach_a_stale_image(self):
        posting = sources.structured_job(job_posting(self.first['employer'], LOGO), HOME + 'official')
        job_id = self.s.import_discovery([posting])[0][0]
        job = next(job for job in self.w.read()['jobs'] if job['id'] == job_id)

        def replace_publisher(*_args, **_kwargs):
            with self.w.edit() as state:
                state['employer_links'][0]['publisher_provenance']['url'] = 'https://other.example.test/role'
            return response(LOGO, self.mark, 'image/png')

        with patch.object(sources, 'request', side_effect=replace_publisher):
            link = self.confirm_source(job)
        self.assertEqual(self.inventory()['companies'][0]['status'], 'missing')
        self.assertFalse((self.w.path / assets.ASSET_FOLDER).exists())
        self.assertIsNone(next(row for row in self.w.read()['employers'] if row['id'] == link['employer_id']).get('logo'))

    def test_zip_and_git_snapshot_restore_logo_bytes_and_metadata(self):
        employer_id = self.confirm_source(self.first)['employer_id']
        listing = sources.structured_job(job_posting(self.first['employer'], LOGO), self.first['url'])
        with patch.object(sources, 'request', return_value=response(LOGO, self.mark, 'image/png')):
            self.s.import_discovery([listing])
        employer = self.w.read()['employers'][0]
        name = assets.asset_path(self.w.path, employer['logo']['sha256']).relative_to(self.w.path)
        original = (self.w.path / name).read_bytes()
        archive_path = self.w.export(self.root / 'workspace.zip')
        with zipfile.ZipFile(archive_path) as archive:
            self.assertEqual(archive.read(name.as_posix()), original)
        state = self.w.read()
        backup = self.root / 'backup'
        snapshot = self.root / 'snapshot'
        store.restore(archive_path, backup)
        source = self.w.path
        if shutil.which('git'):
            source = self.root / 'git-tree'

            def git(*arguments):
                return subprocess.run(['git', '-C', str(self.w.path), *arguments], check=True,
                                      capture_output=True).stdout

            git('init')
            git('add', '.gitattributes', 'state.json', 'state', assets.ASSET_FOLDER)
            tree = git('write-tree').decode().strip()
            archive_bytes = git('-c', 'core.autocrlf=true', 'archive', '--format=zip', tree)
            with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
                archive.extractall(source)
            self.assertFalse((source / 'workspace.sqlite3').exists())
        store.restore_snapshot(source, snapshot)
        for destination in (backup, snapshot):
            with self.subTest(operation=destination.name):
                restored = store.Workspace(destination, create=False)
                try:
                    self.assertNotEqual(restored.workspace_id, self.w.workspace_id)
                    self.assertEqual((destination / name).read_bytes(), original)
                    self.assertEqual(restored.read()['employers'], state['employers'])
                    self.assertEqual(Service(restored).action('company-logo-inventory', {})['companies'][0]['status'],
                                     'already_present')
                    self.assertEqual(Service(restored).state()['jobs'][0]['company']['id'], employer_id)
                finally:
                    restored.close()


class LogoHttpTests(unittest.TestCase):
    setUp = CompanyLogoWorkspaceTests.setUp
    seed = test_workflow.Workflow.seed
    tearDown = test_tailscale.TailscaleHttpContracts.tearDown
    start = test_tailscale.TailscaleHttpContracts.start
    remote_headers = test_tailscale.TailscaleHttpContracts.remote_headers
    request = test_tailscale.TailscaleHttpContracts.request

    def test_logo_serves_only_registered_bytes_through_owner_boundary(self):
        link = self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True})
        data = assets.normalize(self.mark, 'image/png')
        registered = assets.persist(self.w.path, data)
        unregistered = assets.persist(self.w.path, assets.normalize(image_bytes((20, 20)), 'image/png'))
        with self.w.edit() as state:
            employer = next(row for row in state['employers'] if row['id'] == link['employer_id'])
            employer['logo'] = {'sha256': registered, 'source': 'fictional-test'}
        path = f'/api/company-logo/{registered}.png'
        self.start()
        remote = self.remote_headers()
        for headers in ({}, remote):
            status, body, response_headers = self.request(path=path, headers=headers)
            self.assertEqual((status, body), (200, data))
            self.assertEqual(response_headers['Content-Type'], 'image/png')
            self.assertEqual(response_headers['X-Content-Type-Options'], 'nosniff')
            self.assertEqual(response_headers['Cross-Origin-Resource-Policy'], 'same-origin')
            self.assertIn("img-src 'self'", response_headers['Content-Security-Policy'])
            self.assertNotIn('Access-Control-Allow-Origin', response_headers)
            self.assertEqual(self.request('HEAD', path, headers)[:2], (200, b''))
        denied = {**remote, 'Tailscale-User-Login': 'visitor@example.test'}
        self.assertEqual(self.request(path=path, headers=denied)[0], 403)
        self.assertEqual(self.request(path='/api/company-logo-inventory', headers=denied)[0], 403)
        inventory = json.loads(self.request(path='/api/company-logo-inventory')[1])['result']
        self.assertEqual(inventory['workspace_id'], self.w.workspace_id)
        for invalid in (f'/api/company-logo/{unregistered}.png', '/api/company-logo/%2e%2e/workspace.json',
                        path + '/suffix', path + '?private=token'):
            with self.subTest(path=invalid):
                self.assertEqual(self.request(path=invalid)[0], 404)
        self.assertEqual(app.test_client().get(path).status_code, 404)
        disk = assets.asset_path(self.w.path, registered)
        disk.write_bytes(b'changed')
        self.assertEqual(self.request(path=path)[0], 404)
        self.assertNotIn('logo_url', self.s.state()['jobs'][0]['company'])
        disk.unlink()
        self.assertEqual(self.request(path=path)[0], 404)
        if os.name != 'nt':
            target = self.root / 'outside.png'
            target.write_bytes(data)
            disk.symlink_to(target)
            self.assertEqual(self.request(path=path)[0], 404)

    def test_backfill_requires_valid_mutation_token_and_workspace(self):
        self.start(remote=False)
        status, body, _ = self.request(path='/api/state')
        self.assertEqual(status, 200)
        token = json.loads(body)['token']
        headers = {'Origin': self.local_origin, 'Content-Type': 'application/json'}
        item = self.s.action('company-logo-inventory', {})['companies'][0]
        request = {'workspace_id': self.w.workspace_id, 'company_ids': [item['id']]}
        path = '/api/company-logo-backfill'
        with patch.object(sources, 'request') as fetch:
            self.assertEqual(self.request('POST', path, headers, store.encode(request))[0], 403)
            headers['X-Workspace-Token'] = token
            invalid = {**request, 'workspace_id': 'wrong-workspace'}
            self.assertEqual(self.request('POST', path, headers, store.encode(invalid))[0], 400)
            status, body, _ = self.request('POST', path, headers, store.encode(request))
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)['result']['counts'], {'unresolved': 1})
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
