"""Exercise each follow-up through the normal SQLite-backed service."""

from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch

from employment_agency import packages, providers
from employment_agency.service import Service
from employment_agency.store import Workspace
import test_workflow


class SQLiteFollowups(unittest.TestCase):
    seed = test_workflow.Workflow.seed
    tearDown = test_workflow.Workflow.tearDown

    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.w.close()
        self.w = Workspace(self.root / 'sqlite-followups', sqlite=True)
        self.s = Service(self.w)
        self.fact, self.profile, self.job = self.seed()

    def draft(self, job=None):
        return self.s.action('local-package', {'job_id': (job or self.job)['id'], 'profile_id': self.profile['id']})

    def reopen(self):
        path = self.w.path
        self.w.close()
        self.w = Workspace(path, create=False)
        self.s = Service(self.w)

    def test_queues_preserve_authority_and_paginate_without_document_checks(self):
        old = self.draft()
        current = self.draft()
        self.s.action('save-job', {'id': self.job['id'], 'saved': True})
        self.assertEqual(self.s.action('application-queue', {'stage': 'saved'})['rows'][0]['application_id'], current['id'])
        self.s.action('review', {'id': old['id'], 'status': 'submitted'})
        tag = self.s.action('job', {**self.job, 'id': None, 'url': 'https://example.test/tag',
                                     'prior_application': 'submitted'})
        with patch('employment_agency.service.packages.changed', side_effect=AssertionError('List hashed documents')):
            first = self.s.action('application-queue', {'stage': 'submitted', 'limit': 1})
            second = self.s.action('application-queue', {'stage': 'submitted', 'limit': 1, 'offset': first['next_offset']})
        result = {row['job_id']: row['application_id'] for row in first['rows'] + second['rows']}
        self.assertEqual(result, {self.job['id']: old['id'], tag['id']: None})
        self.assertTrue(packages.path_for(self.w.path, old, 'resume.pdf').read_bytes().startswith(b'%PDF'))
        with self.w.edit() as state:
            state['applications'][0]['archived'] = True
        self.assertEqual([row['job_id'] for row in self.s.action('application-queue', {'stage': 'submitted'})['rows']],
                         [tag['id']])
        self.assertEqual(len(self.s.action('application-queue', {'stage': 'submitted', 'history': True})['rows']), 2)

    def test_atomic_source_refresh_deduplicates_and_keeps_previous_on_failure(self):
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
        posting = {**self.job, 'id': None, 'url': 'https://example.test/old-posting',
                   'source': 'greenhouse:fixture', 'source_requisition': 'greenhouse:fixture:1'}
        with patch('employment_agency.service.sources.discover', return_value=[posting, posting]):
            self.assertEqual(self.s.action('discover', {'id': source['id']}), {'count': 1})
        listed = self.w.read()['jobs'][-1]
        self.s.action('save-job', {'id': listed['id'], 'saved': True})
        moved = {**posting, 'url': 'https://example.test/moved-posting'}
        with patch('employment_agency.service.sources.discover', return_value=[moved, {'title': ''}]):
            self.assertIn('error', self.s.action('discover', {'id': source['id']}))
        self.assertEqual(self.w.read()['jobs'][-1]['url'], posting['url'])
        with patch('employment_agency.service.sources.discover', return_value=[moved]):
            self.assertEqual(self.s.action('discover', {'id': source['id']}), {'count': 1})
        refreshed = self.w.read()['jobs'][-1]
        self.assertEqual(refreshed['id'], listed['id'])
        self.assertEqual(refreshed['url'], moved['url'])
        self.assertTrue(refreshed['saved'])

    def test_concurrent_evidence_confirmation_shares_one_skill_and_survives_reopen(self):
        other = self.s.action('job', {**self.job, 'id': None, 'url': 'https://example.test/other',
                                       'requirements': ['Experience with Python APIs']})
        with ThreadPoolExecutor(max_workers=2) as executor:
            records = list(executor.map(lambda job: self.s.action('requirement-evidence', {
                'job_id': job['id'], 'requirement': job['requirements'][0], 'save_skill': True,
            }), [self.job, other]))
        self.assertEqual(records[0]['fact_ids'], records[1]['fact_ids'])
        self.assertEqual(len(list(self.w.path.glob('state/requirement-evidence/*.json'))), 2)
        self.reopen()
        self.assertEqual(len(self.w.read()['facts']), 2)
        self.s.action('retire', {'id': records[0]['fact_ids'][0]})
        self.assertFalse(any(job.get('matched_skill_evidence') for job in self.s.state()['jobs']))

    def paid_run(self, budget=1):
        self.s.action('consent', {'provider': 'openai', 'grant': True,
                                 'purpose': providers.PURPOSE, 'categories': providers.CATEGORIES})
        with patch.object(self.s, 'launch'):
            return self.s.action('run', {'profile_id': self.profile['id'], 'mode': 'openai',
                'model': 'fixture-model', 'input_per_million': 1, 'output_per_million': 1,
                'budget': budget, 'approve_budget': True, 'discover': False})['id']

    def test_interrupted_paid_attempt_is_durable_and_never_replayed(self):
        run_id = self.paid_run()
        with patch('employment_agency.providers.openai_select', side_effect=KeyboardInterrupt) as provider:
            with self.assertRaises(KeyboardInterrupt):
                self.s.run(run_id)
        provider.assert_called_once()
        self.assertEqual(self.w.read()['run_items'][0]['status'], 'requesting')
        self.reopen()
        row = self.w.read()['run_items'][0]
        self.assertEqual(row['status'], 'unknown')
        self.assertEqual(row['provider_attempt']['status'], 'unknown')
        with patch('employment_agency.providers.openai_select') as provider:
            self.s.run(run_id)
        provider.assert_not_called()
        self.assertEqual(self.w.read()['applications'], [])

    def test_saved_selection_resumes_without_another_request_and_finishes_atomically(self):
        run_id = self.paid_run()
        with patch('employment_agency.providers.openai_select', return_value=[self.fact['id']]), \
             patch.object(self.s, 'prepare', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.s.run(run_id)
        self.reopen()
        self.assertEqual(self.w.read()['run_items'][0]['status'], 'selected')
        with patch('employment_agency.providers.openai_select') as provider:
            self.s.run(run_id)
        provider.assert_not_called()
        state = self.w.read()
        self.assertEqual(state['run_items'][0]['status'], 'prepared')
        self.assertEqual(state['runs'][0]['packages'], [state['applications'][0]['id']])
        self.assertEqual(state['run_items'][0]['application_id'], state['applications'][0]['id'])

    def test_budget_and_cancel_stop_before_reserving(self):
        run_id = self.paid_run(budget=0.000001)
        with patch('employment_agency.providers.openai_select') as provider:
            self.s.run(run_id)
        provider.assert_not_called()
        self.assertEqual(self.w.read()['runs'][0]['status'], 'paused')
        self.s.action('cancel', {'id': run_id})
        self.s.run(run_id)
        self.assertEqual(self.w.read()['runs'][0]['status'], 'cancelled')
