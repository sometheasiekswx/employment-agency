"""Ranking uses matching records without inspecting application documents."""
import unittest
from unittest.mock import patch

import test_workflow


class Ranking(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def test_rank_does_not_run_workspace_document_checks(self):
        _, profile, job = self.seed()
        with self.w.edit() as state:
            state['applications'].append({
                'id': 'fictional-draft', 'job_id': job['id'], 'status': 'draft',
                'folder': 'applications/fictional-unavailable-documents',
            })
        before = (self.w.path / 'state.json').read_bytes()
        with patch('employment_agency.master.status', side_effect=AssertionError('Ranking inspected the master')), \
                patch('employment_agency.packages.changed', side_effect=AssertionError('Ranking inspected documents')):
            rows = self.s.action('rank', {'profile_id': profile['id']})
        self.assertEqual([row['job']['id'] for row in rows], [job['id']])
        self.assertEqual(rows[0]['match']['evidence'][0]['assessment'], 'Related text; verify full requirement')
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)

    def test_rank_preserves_effective_submissions_without_rewriting_job_data(self):
        _, profile, job = self.seed()
        with self.w.edit() as state:
            state['applications'].append({'id': 'fictional-submission', 'job_id': job['id'], 'status': 'submitted'})
        before = (self.w.path / 'state.json').read_bytes()
        rows = self.s.action('rank', {'profile_id': profile['id']})
        self.assertEqual(rows[0]['job']['prior_application'], 'submitted')
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)

    def test_rank_honors_a_corrected_submission_and_rejects_unknown_profiles(self):
        _, profile, job = self.seed()
        with self.w.edit() as state:
            state['applications'].extend([
                {'id': 'original', 'job_id': job['id'], 'status': 'submitted',
                 'submission_correction': {'recovery_application_id': 'recovery'}},
                {'id': 'recovery', 'job_id': job['id'], 'status': 'draft',
                 'submission_recovery': {'original_id': 'original'}},
            ])
        rows = self.s.action('rank', {'profile_id': profile['id']})
        self.assertNotEqual(rows[0]['job'].get('prior_application'), 'submitted')
        with self.assertRaisesRegex(ValueError, 'Record not found'):
            self.s.action('rank', {'profile_id': 'missing-profile'})
