"""A submitted snapshot remains authoritative when editable job flags are stale."""
import unittest
from unittest.mock import patch

import test_workflow
from employment_agency import matching
from employment_agency.application_delivery import Delivery


class NoSendMail:
    def sender(self):
        return 'alex@example.test'

    def send(self, raw):
        raise AssertionError('No delivery is permitted in these checks')


class SubmissionAuthority(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    seed = test_workflow.Workflow.seed

    def tearDown(self):
        if self.s.delivery:
            self.s.delivery.close()
        test_workflow.Workflow.tearDown(self)

    def submitted_with_sibling(self, *, archived=False):
        fact, profile, job = self.seed()
        args = {'profile_id': profile['id'], 'job_id': job['id']}
        submitted = self.s.action('local-package', args)
        sibling = self.s.action('local-package', args)
        self.s.action('review', {'id': submitted['id'], 'status': 'submitted'})
        # Existing/imported workspaces can contain stale editable metadata.
        with self.w.edit() as state:
            state['jobs'][0]['prior_application'] = 'none'
            if archived:
                state['applications'][0]['archived'] = True
        return fact, profile, job, submitted, sibling

    def test_state_reports_submission_without_rewriting_workspace(self):
        _, _, job, _, _ = self.submitted_with_sibling(archived=True)
        before = (self.w.path / 'state.json').read_bytes()
        reported = next(j for j in self.s.state()['jobs'] if j['id'] == job['id'])
        self.assertEqual(reported['prior_application'], 'submitted')
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        self.assertEqual(self.w.read()['jobs'][0]['prior_application'], 'none')

    def test_job_edits_cannot_clear_a_submitted_snapshot(self):
        _, _, job, _, _ = self.submitted_with_sibling()
        for prior in ('none', 'rejected'):
            with self.subTest(prior=prior):
                saved = self.s.action('job', {**job, 'prior_application': prior})
                self.assertEqual(saved['prior_application'], 'submitted')
                self.assertEqual(self.w.read()['jobs'][0]['prior_application'], 'submitted')

    def test_local_and_agent_preparation_reject_stale_submission_flags(self):
        fact, profile, job, _, _ = self.submitted_with_sibling()
        before = len(self.w.read()['applications'])
        for operation in ('local-package', 'agent-package'):
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                self.s.action(operation, {'profile_id': profile['id'], 'job_id': job['id'],
                                          'selection': {'fact_ids': [fact['id']]}})
        self.assertEqual(len(self.w.read()['applications']), before)

    def test_queued_run_rechecks_a_submitted_job_before_preparing(self):
        _, profile, job, _, _ = self.submitted_with_sibling()
        with patch.object(self.s, 'launch'):
            run = self.s.action('run', {'profile_id': profile['id'], 'count': 1,
                                        'mode': 'local', 'discover': False})
        with self.w.edit() as state:
            state['runs'][0]['queue'] = [job['id']]
        before = len(self.w.read()['applications'])
        self.s.run(run['id'])
        saved = self.w.read()['runs'][0]
        self.assertEqual(saved['packages'], [])
        self.assertEqual(len(self.w.read()['applications']), before)
        self.assertEqual(saved['done'], [job['id']])

    def test_delivery_rejects_a_sibling_even_with_stale_job_metadata(self):
        _, _, _, _, sibling = self.submitted_with_sibling()
        self.s.delivery = Delivery(self.s, mail=NoSendMail())
        with self.assertRaisesRegex(ValueError, 'already recorded as submitted'):
            self.s.action('apply-start', {'application_id': sibling['id'], 'channel': 'gmail',
                'subject': 'Controlled application', 'body': 'Do not send.', 'disclosure_confirmed': True})
        self.assertEqual(self.s.delivery.records(), [])

    def test_preparation_rechecks_submission_after_eligibility_was_calculated(self):
        fact, profile, job, _, _ = self.submitted_with_sibling()
        state = self.w.read()
        facts = matching.available(state['facts'])
        stale_match = matching.match(job, profile, facts)
        self.assertTrue(stale_match['eligible_for_preparation'])
        before = len(self.s.action('history', {}))
        with self.assertRaisesRegex(ValueError, 'already recorded as submitted'):
            self.s.prepare(job, profile, state['identity'], facts, stale_match, [fact['id']])
        self.assertEqual(len(self.s.action('history', {})), before)

    def test_another_requisition_with_same_title_and_employer_can_be_prepared(self):
        _, profile, job, _, _ = self.submitted_with_sibling()
        other = self.s.action('job', {**job, 'id': '', 'url': 'https://example.test/another-requisition'})
        self.assertNotEqual(other['id'], job['id'])
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': other['id']})
        self.assertEqual(app['status'], 'draft')
