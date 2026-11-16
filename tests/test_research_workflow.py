"""Research receipts belong to a task and cannot be replaced by a completion claim."""

from contextlib import closing
from datetime import datetime, timedelta
import json
import threading
from time import monotonic
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from employment_agency import company_logo_assets, research_workflow, sources, store
from employment_agency.company_best_matches import ResearchIncomplete
from employment_agency.discovery_fetch import Fetch
from employment_agency.server import server
from employment_agency.service import Service
import test_company_avoid
from test_company_logos import image_bytes


class ResearchWorkflow(unittest.TestCase):
    setUp = test_company_avoid.CompanyAvoid.setUp
    tearDown = test_company_avoid.CompanyAvoid.tearDown
    seed = test_company_avoid.CompanyAvoid.seed

    def tearDown(self):
        if self.s.discovery:
            self.s.discovery.close()
        test_company_avoid.CompanyAvoid.tearDown(self)

    def start(self):
        return self.s.action('company-research-start', {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
        })['id']

    def record(self, run_id, **changes):
        return self.s.action('company-research-record', {
            'workspace_id': self.w.workspace_id, 'research_id': run_id,
            'url': self.first['url'], 'status': 'retrieved', 'job_ids': [self.first['id']],
            'evidence': 'Fictional browser verified the original listing and requirements.', **changes,
        })

    def logo(self, run_id, *, missing=False):
        args = {'workspace_id': self.w.workspace_id, 'research_id': run_id,
                'company_ids': [self.employer], 'sources': {self.employer: {
                    'url': 'https://employer.example.test/', 'evidence': 'Official fictional employer home page.',
                }}}
        with patch('employment_agency.company_logo_pages.fetch',
                   return_value=(None if missing else 'https://employer.example.test/logo.png',
                                 'https://employer.example.test/')):
            with patch('employment_agency.company_logo_assets.retrieve',
                       return_value=(company_logo_assets.normalize(image_bytes(), 'image/png'),
                                     'https://employer.example.test/logo.png')):
                return self.s.action('company-logo-backfill', args)

    def complete(self, run_id):
        return self.s.action('company-research-complete', self.scope(research_id=run_id))['completion']

    def scope(self, **extra):
        return {'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
                'job_ids': [self.first['id']], **extra}

    def test_old_completion_cannot_claim_unchecked_sources_and_logos_are_done(self):
        with self.assertRaises(ValueError):
            self.s.action('company-research-complete', self.scope())

    def test_new_task_requires_source_and_logo_evidence(self):
        run = self.s.action('company-research-start', {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
        })
        with self.assertRaises(ResearchIncomplete) as refused:
            self.s.action('company-research-complete', self.scope(research_id=run['id']))
        codes = {row['code'] for row in refused.exception.result['completion']['blockers']}
        self.assertIn('source_check_missing', codes)
        self.assertIn('logo_check_missing', codes)

    def test_external_check_and_verified_logo_pass_and_another_task_cannot_reuse_source(self):
        run_id = self.start()
        receipt = self.record(run_id)
        self.assertEqual(receipt['method'], 'external')
        self.assertIn('recorded_at', receipt)
        self.assertNotIn('checked_at', receipt)
        self.assertEqual(self.logo(run_id)['companies'][0]['status'], 'success')
        result = self.complete(run_id)
        self.assertTrue(result['ready'])
        self.assertTrue(result['coverage_complete'])
        another = self.start()
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(another)
        self.assertEqual([row['code'] for row in refused.exception.result['completion']['blockers']],
                         ['research_source_required', 'source_check_missing'])
        self.record(another)
        self.assertTrue(self.complete(another)['ready'])

    def test_missing_logo_needs_an_actual_attempt_and_remains_a_visible_gap(self):
        run_id = self.start()
        self.record(run_id)
        self.s.action('company-logo-backfill', {'workspace_id': self.w.workspace_id,
                      'research_id': run_id, 'company_ids': [self.employer]})
        with self.assertRaises(ResearchIncomplete):
            self.complete(run_id)
        self.logo(run_id, missing=True)
        result = self.complete(run_id)
        self.assertTrue(result['ready'])
        self.assertFalse(result['coverage_complete'])
        gap = result['gaps'][0]
        self.assertEqual(gap['kind'], 'logo')
        self.assertEqual(gap['attempted_urls'], ['https://employer.example.test/'])
        self.assertIn('No explicit matching logo', gap['reason'])
        self.s.action('company-logo-backfill', {'workspace_id': self.w.workspace_id,
                      'research_id': run_id, 'company_ids': [self.employer]})
        self.assertEqual(self.complete(run_id)['gaps'], [gap])
        self.logo(run_id)
        self.assertTrue(self.complete(run_id)['coverage_complete'])

    def test_source_content_changes_and_later_failures_invalidate_prior_success(self):
        run_id = self.start()
        self.record(run_id)
        self.logo(run_id)
        self.s.action('save-job', {'id': self.first['id'], 'saved': True})
        self.assertTrue(self.complete(run_id)['ready'])
        self.s.action('job', {**self.first, 'description': 'Changed requirements needing a fresh review.'})
        with self.assertRaises(ResearchIncomplete):
            self.complete(run_id)
        self.record(run_id)
        self.assertTrue(self.complete(run_id)['ready'])
        self.record(run_id, status='blocked', job_ids=[], evidence='The original page now blocks retrieval.')
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        self.assertEqual(refused.exception.result['completion']['gaps'][0]['status'], 'blocked')

    def test_changed_publication_dates_and_careers_page_invalidate_the_receipt(self):
        run_id = self.start()
        self.logo(run_id)
        listing = dict(self.first)
        self.record(run_id)
        for field, value in (
            ('posted_at', '2026-06-03'),
            ('reposted_at', '2026-06-07'),
            ('careers_url', 'https://employer.example.test/our-careers'),
        ):
            with self.subTest(field=field):
                listing[field] = value
                self.s.action('job', listing)
                with self.assertRaises(ResearchIncomplete) as refused:
                    self.complete(run_id)
                self.assertEqual([row['code'] for row in refused.exception.result['completion']['blockers']],
                                 ['source_check_missing'])
                self.record(run_id)
                self.assertTrue(self.complete(run_id)['ready'])

    def test_external_receipt_rejects_stale_naive_and_future_checks(self):
        run_id = self.start()
        self.logo(run_id)
        for checked_at in ('2000-01-01T00:00:00+00:00', '2026-11-17T00:00:00',
                           '2999-01-01T00:00:00+00:00'):
            with self.subTest(checked_at=checked_at):
                self.s.action('job', {**self.first, 'checked_at': checked_at})
                with self.assertRaisesRegex(ValueError, 'timezone-aware checked_at'):
                    self.record(run_id)
        checked_at = store.now()
        self.s.action('job', {**self.first, 'checked_at': checked_at})
        receipt = self.record(run_id)
        self.assertEqual(receipt['job_checked_at'], {self.first['id']: checked_at})
        self.assertTrue(self.complete(run_id)['ready'])
        future = (datetime.fromisoformat(checked_at) + timedelta(hours=25)).isoformat()
        self.s.action('job', {**self.first, 'checked_at': future})
        with patch.object(research_workflow, 'now', return_value=future):
            with self.assertRaises(ResearchIncomplete) as refused:
                self.complete(run_id)
        self.assertEqual([row['code'] for row in refused.exception.result['completion']['blockers']],
                         ['source_check_missing'])

    def test_stale_source_that_found_no_jobs_remains_a_coverage_gap(self):
        stale_time = (datetime.fromisoformat(store.now()) - timedelta(days=2)).isoformat()
        empty_careers = 'https://other.example.test/careers'
        with patch.object(research_workflow, 'now', return_value=stale_time):
            run_id = self.start()
            self.record(run_id, url=empty_careers, job_ids=[], evidence='No roles on the fictional careers page.')
        self.logo(run_id)
        self.record(run_id)
        completion = self.complete(run_id)
        self.assertTrue(completion['ready'])
        self.assertFalse(completion['coverage_complete'])
        self.assertEqual(
            [(row['url'], row['status'], row['code']) for row in completion['gaps']],
            [(empty_careers, 'retrieved', 'source_check_stale')],
        )
        self.record(run_id, url=empty_careers, job_ids=[], evidence='No roles on the rechecked fictional page.')
        self.assertTrue(self.complete(run_id)['coverage_complete'])

    def test_closed_listing_requires_observation_or_authoritative_snapshot(self):
        run_id = self.start()
        self.logo(run_id)
        board = self.s.action('source', {'kind': 'greenhouse', 'board': 'fictional'})
        listing = {**self.first, 'availability': 'closed', 'source': 'greenhouse:fictional'}
        self.s.action('job', listing)
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        self.assertIn('research_source_required', {row['code'] for row in refused.exception.result['completion']['blockers']})
        self.record(run_id, url='https://other.example.test/careers', job_ids=[])
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        self.assertEqual([row['code'] for row in refused.exception.result['completion']['blockers']],
                         ['source_check_missing'])
        self.s.action('job', {**listing, 'availability': 'retrieved'})
        self.record(run_id)
        self.assertTrue(self.complete(run_id)['coverage_complete'])
        self.s.action('job', listing)
        with self.assertRaises(ResearchIncomplete):
            self.complete(run_id)
        with patch.object(sources, 'discover', return_value=[]):
            self.s.action('company-research-source', {
                'name': self.first['employer'], 'source_id': board['id'], 'research_id': run_id,
            })
        self.assertTrue(self.complete(run_id)['coverage_complete'])

    def test_task_cannot_omit_checked_jobs_or_continue_with_a_different_guide(self):
        run_id = self.start()
        self.record(run_id)
        other = self.s.action('job', {**self.first, 'id': None, 'url': 'https://other.example.test/role'})
        self.record(run_id, url=other['url'], job_ids=[other['id']])
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        omitted = next(row for row in refused.exception.result['completion']['blockers']
                       if row['code'] == 'research_jobs_omitted')
        self.assertEqual(omitted['job_ids'], [other['id']])
        with self.w.edit() as state:
            state['research_runs'][0]['guide_sha256'] = 'old-build'
        with self.assertRaisesRegex(ValueError, 'workflow changed'):
            self.complete(run_id)

    def test_scraper_receipt_survives_nested_field_order_and_detects_corrupt_logo(self):
        run_id = self.start()
        listing = {**self.first, 'id': None, 'salary': {'min': 1000, 'max': 2000, 'currency': 'USD',
                                                     'period': 'month', 'basis': 'published'}}
        self.s.import_discovery([listing], research={'research_id': run_id, 'method': 'http',
                                'status': 'retrieved', 'url': self.first['url']})
        logo = self.logo(run_id)['companies'][0]
        self.assertTrue(self.complete(run_id)['ready'])
        company_logo_assets.asset_path(self.w.path, logo['sha256']).write_bytes(b'corrupt image')
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        self.assertIn('logo_check_missing', {row['code'] for row in refused.exception.result['completion']['blockers']})

    def test_completion_waits_for_active_discovery_and_records_a_stop(self):
        run_id = self.start()
        self.record(run_id)
        self.logo(run_id)
        entered, release = threading.Event(), threading.Event()
        def slow_page(url, **kwargs):
            entered.set()
            release.wait(5)
            raise sources.SourceError('Stopped fictional check')
        with patch.object(Fetch, 'page', side_effect=slow_page):
            try:
                discovery = self.s.action('discovery-start', {'profile_id': self.profile['id'],
                    'research_id': run_id, 'urls': [self.first['url']]})
                self.assertTrue(entered.wait(2))
                with self.assertRaises(ResearchIncomplete) as refused:
                    self.complete(run_id)
                self.assertIn('research_fetch_in_progress',
                              {row['code'] for row in refused.exception.result['completion']['blockers']})
                self.s.action('discovery-stop', {'id': discovery['id']})
            finally:
                release.set()
                self.s.discovery.wait()
        with self.assertRaises(ResearchIncomplete) as refused:
            self.complete(run_id)
        self.assertEqual(refused.exception.result['completion']['gaps'][0]['status'], 'stopped')

    def test_delayed_failure_receipt_does_not_override_later_external_retry(self):
        run_id = self.start()
        self.logo(run_id)
        second_url = 'https://employer.example.test/slow-careers'
        release = threading.Event()

        def fetch_page(url, **kwargs):
            if url == self.first['url']:
                raise sources.SourceError('Fictional source blocked', status=403)
            release.wait(5)
            return 'http', {'url': url, 'title': 'Careers', 'text': 'No further listed roles.',
                            'links': [], 'jobs': []}

        with patch.object(Fetch, 'page', side_effect=fetch_page):
            discovery = self.s.action('discovery-start', {'profile_id': self.profile['id'],
                'research_id': run_id, 'urls': [self.first['url'], second_url]})
            try:
                deadline = monotonic() + 3
                while monotonic() < deadline:
                    result = self.s.action('discovery-status', {'id': discovery['id']})
                    if result['sources'][0]['status'] == 'blocked':
                        break
                    release.wait(0.01)
                self.assertEqual(result['sources'][0]['status'], 'blocked')
                self.assertEqual(result['status'], 'running')
                self.record(run_id)
            finally:
                release.set()
                self.s.discovery.wait()
        evidence = self.s.action('company-research-status', {'workspace_id': self.w.workspace_id,
                                                            'research_id': run_id})
        first_source = {receipt['status']: receipt for receipt in evidence['sources']
                        if receipt['url'] == self.first['url']}
        self.assertEqual(first_source.keys(), {'retrieved', 'blocked'})
        self.assertLess(first_source['blocked']['checked_at'], first_source['retrieved']['recorded_at'])
        self.assertTrue(self.complete(run_id)['coverage_complete'])

    def test_profile_workspace_and_external_receipts_are_validated(self):
        run_id = self.start()
        for changes in ({'workspace_id': 'other'}, {'research_id': 'other'}, {'job_ids': 'bad'},
                        {'job_ids': None}, {'job_ids': ['outside']}, {'url': 'http://127.0.0.1/'},
                        {'evidence': ''}, {'status': 'done'}, {'status': 'failed'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.record(run_id, **changes)
        other = self.s.action('profile', {'name': 'Other profile', 'roles': ['Engineer']})
        with self.assertRaisesRegex(ValueError, 'selected profile'):
            self.s.action('company-research-complete', self.scope(research_id=run_id, profile_id=other['id']))
        with patch.object(Fetch, 'page') as fetch, self.assertRaises(ValueError):
            self.s.action('discovery-start', {'research_id': run_id, 'profile_id': other['id'],
                                             'urls': [self.first['url']]})
        fetch.assert_not_called()

    def test_shared_discovery_records_success_and_blocked_sources(self):
        run_id = self.start()
        page = {'url': self.first['url'], 'title': self.first['title'], 'text': 'Fictional listing',
                'links': [], 'jobs': [self.first], 'leads': []}
        blocked = 'https://employer.example.test/blocked'
        def fetch(url, **kwargs):
            if url == blocked:
                raise sources.SourceError('Fictional source blocked')
            return 'http', page
        with patch.object(Fetch, 'page', side_effect=fetch):
            self.s.action('discovery-start', {'research_id': run_id, 'profile_id': self.profile['id'],
                                             'urls': [self.first['url'], blocked]})
            result = self.s.discovery.wait()
        self.assertEqual(result['status'], 'complete', result)
        evidence = self.s.action('company-research-status', {'workspace_id': self.w.workspace_id,
                                                            'research_id': run_id})
        self.assertEqual(len(evidence['sources']), 2)
        self.assertEqual(evidence['active_discoveries'], [])
        self.assertTrue(any(self.first['id'] in row['jobs'] for row in evidence['sources']))
        self.assertNotIn('research_runs', self.s.state())
        self.logo(run_id)
        completed = self.complete(run_id)
        self.assertTrue(completed['ready'])
        self.assertFalse(completed['coverage_complete'])
        self.assertEqual(completed['gaps'][0]['url'], blocked)

    def test_registered_board_records_automatic_evidence(self):
        run_id = self.start()
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
        self.s.action('company-map', {'job_id': self.first['id'], 'confirmed': True,
                                     'source_id': source['id']})
        listing = {**self.first, 'source': 'greenhouse:fixture'}
        with patch('employment_agency.service.sources.discover', return_value=[listing]):
            result = self.s.action('company-research-source', {
                'name': self.first['employer'], 'source_id': source['id'], 'research_id': run_id,
            })
        self.assertEqual(result['job_ids'], [self.first['id']])
        self.logo(run_id)
        self.assertTrue(self.complete(run_id)['ready'])
        future = (datetime.fromisoformat(store.now()) + timedelta(hours=25)).isoformat()
        with patch.object(research_workflow, 'now', return_value=future):
            with self.assertRaises(ResearchIncomplete):
                self.complete(run_id)
        with patch('employment_agency.service.sources.discover', side_effect=sources.SourceError('offline')):
            self.s.action('company-research-source', {
                'name': self.first['employer'], 'source_id': source['id'], 'research_id': run_id,
            })
        with self.assertRaises(ResearchIncomplete):
            self.complete(run_id)

    def test_receipts_survive_export_and_snapshot_restore(self):
        run_id = self.start()
        self.record(run_id)
        self.logo(run_id, missing=True)
        original = self.w.read()['research_runs']
        backup = self.root / 'research.zip'
        self.w.export(backup)
        for method in ('zip', 'snapshot'):
            destination = self.root / method
            if method == 'zip':
                store.restore(backup, destination)
            else:
                store.restore_snapshot(self.w.path, destination)
            with closing(store.Workspace(destination)) as restored:
                self.assertEqual(restored.read()['research_runs'], original)
                result = Service(restored).action('company-research-complete',
                                                  self.scope(research_id=run_id, workspace_id=restored.workspace_id))
                self.assertTrue(result['completion']['ready'])
                self.assertFalse(result['completion']['coverage_complete'])

    def test_live_prompt_resolves_guide_without_mutation_and_http_checks_are_protected(self):
        before = self.w.read()
        http = server(self.s, port=0)
        origin = f'http://127.0.0.1:{http.server_port}'
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        try:
            with urlopen(origin + '/api/state') as response:
                token = json.load(response)['token']
            with urlopen(origin + '/api/research-workflow') as response:
                guide = json.load(response)['result']
            self.assertEqual(store.digest(guide['text'].encode()), guide['sha256'])
            def post(operation, args, supplied_token=token):
                request = Request(origin + '/api/' + operation, data=store.encode(args), headers={
                    'Content-Type': 'application/json', 'Origin': origin, 'X-Workspace-Token': supplied_token,
                })
                return urlopen(request)
            with post('research-handoff', {'profile_id': self.profile['id']}) as response:
                prompt = json.load(response)['result']
            self.assertIn(origin + '/api/research-workflow', prompt['text'])
            self.assertIn(guide['sha256'], prompt['text'])
            self.assertNotIn(token, prompt['text'])
            self.assertEqual(self.w.read(), before)
            with self.assertRaises(HTTPError) as denied:
                post('company-research-start', {'workspace_id': self.w.workspace_id,
                                               'profile_id': self.profile['id']}, 'bad-token')
            self.assertEqual(denied.exception.code, 403)
            run_id = self.start()
            with self.assertRaises(HTTPError) as refused:
                post('company-research-complete', self.scope(research_id=run_id))
            self.assertEqual(refused.exception.code, 409)
            with refused.exception as response:
                self.assertFalse(json.load(response)['result']['completion']['ready'])
        finally:
            http.shutdown()
            worker.join()
            http.server_close()


if __name__ == '__main__':
    unittest.main()
