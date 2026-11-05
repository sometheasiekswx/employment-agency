"""Explicit recovery preserves document snapshots, receipt authority and provenance."""
import copy
import itertools
import json
import unittest
from unittest.mock import patch

import test_workflow
from test_cloud import Backend, OWNER, OTHER
from employment_agency import matching, packages
from employment_agency.application_delivery import Delivery
from employment_agency.cloud import CloudError, execute
from employment_agency.service import Service, submitted_job_ids
from employment_agency.store import Workspace, restore, uid


class NoSendMail:
    def sender(self):
        return 'alex@example.test'

    def send(self, raw):
        raise AssertionError('Recovery must never send an application')


class ActionRecovery(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    seed = test_workflow.Workflow.seed

    def tearDown(self):
        if self.s.delivery:
            self.s.delivery.close()
        test_workflow.Workflow.tearDown(self)

    def package(self):
        fact, profile, job = self.seed()
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        return fact, profile, job, app

    def mark(self, app):
        return self.s.action('review', {'id': app['id'], 'status': 'submitted', 'comment': 'Manual fixture record'})

    def correct(self, app, **extra):
        return self.s.action('correct-submission', {'id': app['id'], 'base': app['manifest_hash'],
            'confirmed': True, 'reason': 'Marked Submitted before the application was sent.', **extra})

    def receipt(self, app, status, *, body=None, filename=None):
        identity = uid()
        record = {'id': identity, 'application_id': app['id'], 'status': status,
                  'binding': {'job_id': app['job_id'], 'application_id': app['id']}}
        folder = self.w.path / 'records/submissions'
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / (filename or identity + '.json')
        path.write_text(json.dumps(record) if body is None else body, encoding='utf-8')
        return path

    def test_restore_keeps_fact_identity_and_provenance_but_requires_confirmation(self):
        fact, _, _, app = self.package()
        original = copy.deepcopy(self.w.read()['facts'][0])
        files = {role: packages.path_for(self.w.path, app, role).read_bytes() for role in app['documents']}
        self.s.action('retire', {'id': fact['id']})
        restored = self.s.action('restore-fact', {'id': fact['id']})
        for field in ('id', 'text', 'association', 'dates', 'category', 'source'):
            self.assertEqual(restored[field], original[field])
        self.assertFalse(restored['retired'])
        self.assertFalse(restored['confirmed'])
        self.assertEqual(matching.available(self.w.read()['facts']), [])
        events = copy.deepcopy(self.w.read()['events'])
        self.s.action('restore-fact', {'id': fact['id']})
        self.assertEqual(self.w.read()['events'], events)
        self.assertEqual([event['type'] for event in events], ['fact_retired', 'fact_restored'])
        self.s.action('confirm', {'id': fact['id']})
        self.s.action('restore-fact', {'id': fact['id']})
        self.assertTrue(self.w.read()['facts'][0]['confirmed'], 'Restoring an active fact is a no-op')
        for role, body in files.items():
            self.assertEqual(packages.path_for(self.w.path, app, role).read_bytes(), body)

    def test_restored_conflicts_and_master_provenance_are_not_automatically_confirmed(self):
        fact = self.s.action('fact', {'text': 'First claim', 'claim_key': 'same-role'})
        self.s.action('confirm', {'id': fact['id']})
        with self.w.edit() as state:
            state['facts'][0]['source'] = {'name': 'master/main.tex', 'master': 'master/main.tex', 'sha256': 'old-master'}
        self.s.action('retire', {'id': fact['id']})
        other = self.s.action('fact', {'text': 'Competing claim', 'claim_key': 'same-role'})
        self.s.action('confirm', {'id': other['id']})
        restored = self.s.action('restore-fact', {'id': fact['id']})
        self.assertFalse(restored['confirmed'])
        self.assertEqual(restored['source']['sha256'], 'old-master')
        self.assertTrue(all(item['conflict'] for item in self.w.read()['facts']))
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            self.s.action('confirm', {'id': fact['id']})

    def test_correction_preserves_snapshot_and_creates_one_linked_review_record(self):
        _, profile, job, app = self.package()
        original = self.mark(app)
        files = {role: packages.path_for(self.w.path, app, role).read_bytes() for role in app['documents']}
        history = self.s.action('history', {})
        recovered = self.correct(app)
        state = self.w.read()
        preserved = state['applications'][0]
        for field in ('status', 'submitted_at', 'reviewed_at', 'created_at', 'folder', 'manifest_hash', 'documents'):
            self.assertEqual(preserved[field], original[field])
        self.assertEqual(preserved['comments'][:-1], original['comments'])
        self.assertEqual(preserved['comments'][-1]['kind'], 'submission-correction')
        self.assertEqual(preserved['submission_correction']['recovery_application_id'], recovered['id'])
        self.assertEqual(recovered['status'], 'draft')
        self.assertEqual(recovered['folder'], app['folder'])
        self.assertEqual(recovered['manifest_hash'], app['manifest_hash'])
        self.assertEqual(recovered['documents'], app['documents'])
        self.assertEqual(recovered['submission_recovery']['original_id'], app['id'])
        self.assertEqual(recovered['submission_recovery']['recorded_at'], original['submitted_at'])
        for field in ('submitted_at', 'reviewed_at', 'submission_record', 'submission_correction'):
            self.assertNotIn(field, recovered)
        self.assertEqual(submitted_job_ids(state), set())
        self.assertEqual(state['jobs'][0]['prior_application'], 'none')
        self.assertNotIn('submission_record_token', state['jobs'][0])
        self.assertEqual(self.s.action('history', {}), history, 'No new document version was generated')
        for role, body in files.items():
            self.assertEqual(packages.path_for(self.w.path, app, role).read_bytes(), body)
        self.assertEqual(self.correct(app)['id'], recovered['id'])
        self.assertEqual(len(self.w.read()['applications']), 2)
        self.assertEqual(len([event for event in self.w.read()['events'] if event['type'] == 'submission_corrected']), 1)
        self.s.delivery = Delivery(self.s, mail=NoSendMail())
        self.assertEqual(self.s.delivery.document(recovered['id'])[0]['id'], recovered['id'])
        self.assertEqual(self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})['status'], 'draft')

    def test_acknowledgement_reason_base_and_integrity_fail_without_changes(self):
        _, _, _, app = self.package()
        self.mark(app)
        before = (self.w.path / 'state.json').read_bytes()
        for args in ({'confirmed': False}, {'reason': ''}, {'reason': ' '}, {'reason': None},
                     {'reason': 'x' * 4001}, {'base': 'stale-version'}, {'base': None}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                self.correct(app, **args)
            self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        pdf = packages.path_for(self.w.path, app, 'resume.pdf')
        original = pdf.read_bytes()
        pdf.write_bytes(b'Changed externally')
        with self.assertRaisesRegex(ValueError, 'Files changed'):
            self.correct(app)
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        pdf.write_bytes(original)

    def test_ordinary_downgrades_and_reasserting_a_corrected_original_remain_blocked(self):
        _, _, _, app = self.package()
        original = self.mark(app)
        with self.assertRaisesRegex(ValueError, 'immutable'):
            self.s.action('review', {'id': app['id'], 'status': 'draft'})
        self.correct(app)
        for status in ('submitted', 'draft', 'reviewed', 'rejected'):
            with self.subTest(status=status), self.assertRaisesRegex(ValueError, 'corrected'):
                self.s.action('review', {'id': app['id'], 'status': status})
        self.s.action('review', {'id': app['id'], 'comment': 'Preserved original remains available for audit.'})
        self.assertEqual(self.w.read()['applications'][0]['submitted_at'], original['submitted_at'])

    def test_only_the_owned_prior_flag_is_restored(self):
        _, _, job, app = self.package()
        with self.w.edit() as state:
            state['jobs'][0]['prior_application'] = 'rejected'
        marked = self.mark(app)
        self.assertEqual(marked['submission_record']['previous_status'], 'draft')
        self.assertEqual(marked['submission_record']['prior_application'], 'rejected')
        self.correct(app)
        self.assertEqual(self.w.read()['jobs'][0]['prior_application'], 'rejected')

    def test_explicit_job_decisions_and_legacy_flags_are_never_guessed_away(self):
        _, _, job, app = self.package()
        self.mark(app)
        edited = self.s.action('job', {**job, 'prior_application': 'submitted'})
        self.assertNotIn('submission_record_token', edited)
        self.correct(app)
        self.assertEqual(self.w.read()['jobs'][0]['prior_application'], 'submitted')
        with self.assertRaises(ValueError):
            self.s.delivery = Delivery(self.s, mail=NoSendMail())
            self.s.delivery.document(self.w.read()['applications'][-1]['id'])
        # A separate legacy record has no captured token/pre-value at all.
        other = self.s.action('job', {**job, 'id': '', 'url': 'https://example.test/legacy-role'})
        legacy = self.s.action('local-package', {'profile_id': self.w.read()['profiles'][0]['id'], 'job_id': other['id']})
        self.mark(legacy)
        with self.w.edit() as state:
            next(item for item in state['applications'] if item['id'] == legacy['id']).pop('submission_record')
            next(item for item in state['jobs'] if item['id'] == other['id']).pop('submission_record_token')
        self.correct(legacy)
        self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == other['id'])['prior_application'], 'submitted')

    def test_other_submitted_siblings_keep_preparation_and_delivery_blocked(self):
        _, profile, job, app = self.package()
        sibling = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.mark(app)
        self.mark(sibling)
        recovered = self.correct(app)
        self.assertEqual(submitted_job_ids(self.w.read()), {job['id']})
        self.assertEqual(self.w.read()['jobs'][0]['prior_application'], 'submitted')
        with self.assertRaises(ValueError):
            self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.s.delivery = Delivery(self.s, mail=NoSendMail())
        with self.assertRaises(ValueError):
            self.s.delivery.document(recovered['id'])

    def submitted_siblings(self, count, *, independent_prior=False):
        _, profile, source_job = self.seed()
        job = self.s.action('job', {**source_job, 'id': '', 'url': 'https://example.test/siblings/' + uid(),
                                    'prior_application': 'none'})
        first = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        apps = [first] + [self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
                          for _ in range(count - 1)]
        if independent_prior:
            self.s.action('job', {**job, 'prior_application': 'submitted'})
        return profile, job, apps

    def test_all_sibling_manual_records_can_be_corrected_in_either_order(self):
        for order in ((0, 1), (1, 0)):
            with self.subTest(order=order):
                profile, job, apps = self.submitted_siblings(2)
                for app in apps:
                    self.mark(app)
                self.correct(apps[order[0]])
                self.assertIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')
                recovered = self.correct(apps[order[1]])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                saved_job = next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])
                self.assertEqual(saved_job['prior_application'], 'none')
                self.assertNotIn('submission_record_token', saved_job)
                self.s.delivery = Delivery(self.s, mail=NoSendMail())
                self.assertEqual(self.s.delivery.document(recovered['id'])[0]['id'], recovered['id'])
                self.assertEqual(self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})['status'], 'draft')
                for app in apps:
                    original = next(item for item in self.w.read()['applications'] if item['id'] == app['id'])
                    self.assertEqual(original['status'], 'submitted')
                    self.assertEqual(packages.changed(self.w.path, original), [])

    def test_three_sibling_corrections_restore_the_prior_in_every_order(self):
        for order in itertools.permutations(range(3)):
            with self.subTest(order=order):
                _, job, apps = self.submitted_siblings(3)
                for app in apps:
                    self.mark(app)
                for index in order:
                    self.correct(apps[index])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                saved_job = next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])
                self.assertEqual(saved_job['prior_application'], 'none')
                self.assertNotIn('submission_record_token', saved_job)

    def test_explicit_prior_decision_between_sibling_recordings_breaks_the_chain(self):
        for order in ((0, 1), (1, 0)):
            with self.subTest(order=order):
                _, job, apps = self.submitted_siblings(2)
                self.mark(apps[0])
                self.s.action('job', {**job, 'prior_application': 'submitted'})
                self.mark(apps[1])
                for index in order:
                    self.correct(apps[index])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')

    def test_explicit_prior_decision_between_corrections_remains_authoritative(self):
        for order in ((0, 1), (1, 0)):
            with self.subTest(order=order):
                _, job, apps = self.submitted_siblings(2)
                for app in apps:
                    self.mark(app)
                self.correct(apps[order[0]])
                self.s.action('job', {**job, 'prior_application': 'submitted'})
                self.correct(apps[order[1]])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')

    def test_independent_prior_submission_survives_all_sibling_corrections(self):
        for order in ((0, 1), (1, 0)):
            with self.subTest(order=order):
                _, job, apps = self.submitted_siblings(2, independent_prior=True)
                for app in apps:
                    self.mark(app)
                for index in order:
                    self.correct(apps[index])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')

    def test_a_legacy_sibling_with_stale_job_metadata_cannot_supply_a_reversible_root(self):
        for order in ((0, 1), (1, 0)):
            with self.subTest(order=order):
                _, job, apps = self.submitted_siblings(2)
                self.mark(apps[0])
                with self.w.edit() as state:
                    next(item for item in state['applications'] if item['id'] == apps[0]['id']).pop('submission_record')
                    saved_job = next(item for item in state['jobs'] if item['id'] == job['id'])
                    saved_job.pop('submission_record_token')
                    saved_job['prior_application'] = 'none'
                self.mark(apps[1])
                for index in order:
                    self.correct(apps[index])
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')

    def test_missing_or_cyclic_submission_chains_never_clear_the_prior(self):
        for invalid_chain in ('missing', 'cycle'):
            with self.subTest(invalid_chain=invalid_chain):
                _, job, apps = self.submitted_siblings(2)
                for app in apps:
                    self.mark(app)
                with self.w.edit() as state:
                    first = next(item for item in state['applications'] if item['id'] == apps[0]['id'])
                    last = next(item for item in state['applications'] if item['id'] == apps[1]['id'])
                    if invalid_chain == 'missing':
                        last['submission_record']['prior_token'] = uid()
                    else:
                        first['submission_record']['prior_application'] = 'submitted'
                        first['submission_record']['prior_token'] = last['submission_record']['token']
                for app in apps:
                    self.correct(app)
                self.assertNotIn(job['id'], submitted_job_ids(self.w.read()))
                self.assertEqual(next(item for item in self.w.read()['jobs'] if item['id'] == job['id'])['prior_application'], 'submitted')

    def test_active_uncertain_and_confirmed_receipts_block_correction_without_mutation(self):
        _, _, _, app = self.package()
        self.mark(app)
        before = (self.w.path / 'state.json').read_bytes()
        for status in ('preparing', 'needs_user', 'awaiting_approval', 'executing', 'unknown', 'confirmed'):
            with self.subTest(status=status):
                path = self.receipt(app, status)
                receipt = path.read_bytes()
                with self.assertRaisesRegex(ValueError, 'delivery'):
                    self.correct(app)
                self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
                self.assertEqual(path.read_bytes(), receipt)
                self.assertIn('submission_correction_blocked', self.s.state()['applications'][0])
                path.unlink()

    def test_malformed_receipt_data_fails_closed_without_constructing_delivery(self):
        _, _, _, app = self.package()
        self.mark(app)
        before = (self.w.path / 'state.json').read_bytes()
        for body in ('not JSON', '{}', '[]', '{"binding":null}', '{"id":"bad","binding":{}}'):
            with self.subTest(body=body):
                path = self.receipt(app, 'confirmed', body=body)
                with patch('employment_agency.application_delivery.Delivery', side_effect=AssertionError('Do not start delivery')):
                    with self.assertRaisesRegex(ValueError, 'evidence'):
                        self.correct(app)
                self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
                self.assertIn('submission_correction_blocked', self.s.state()['applications'][0])
                path.unlink()
        path = self.receipt(app, 'confirmed', filename='unexpected.json')
        with self.assertRaisesRegex(ValueError, 'evidence'):
            self.correct(app)
        path.unlink()

    def test_finished_unsent_attempt_does_not_block_manual_recovery(self):
        _, _, _, app = self.package()
        self.mark(app)
        paths = [self.receipt(app, status) for status in ('cancelled', 'failed', 'not_sent')]
        before = [path.read_bytes() for path in paths]
        self.assertEqual(self.correct(app)['status'], 'draft')
        self.assertEqual([path.read_bytes() for path in paths], before)

    def test_unreadable_receipt_directory_fails_closed_without_mutation(self):
        _, _, _, app = self.package()
        self.mark(app)
        receipt = self.receipt(app, 'confirmed')
        before = (self.w.path / 'state.json').read_bytes()
        receipt_bytes = receipt.read_bytes()
        with patch('employment_agency.service.os.scandir', side_effect=PermissionError('Fixture denial')):
            with self.assertRaisesRegex(ValueError, 'unreadable'):
                self.correct(app)
            self.assertIn('unreadable', self.s.state()['applications'][0]['submission_correction_blocked'])
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        self.assertEqual(receipt.read_bytes(), receipt_bytes)

    def test_new_editor_and_external_edit_versions_do_not_inherit_submission_markers(self):
        _, _, _, app = self.package()
        self.mark(app)
        recovered = self.correct(app)
        edit = self.s.action('document-editor', {'id': app['id'], 'document': 'resume'})
        edit['blocks'].append(['text', 'Reviewed companion wording.'])
        edited = self.s.action('save-document', edit)
        for field in ('submission_record', 'submission_correction', 'submitted_at'):
            self.assertNotIn(field, edited)
        edit = self.s.action('document-editor', {'id': recovered['id'], 'document': 'resume'})
        draft = self.s.action('save-document', edit)
        self.assertEqual(draft['submission_recovery'], recovered['submission_recovery'])
        evidence = packages.path_for(self.w.path, app, 'evidence.json')
        evidence.write_bytes(evidence.read_bytes() + b'\n')
        adopted = self.s.action('adopt-edits', {'id': app['id']})
        for field in ('submission_record', 'submission_correction', 'submitted_at'):
            self.assertNotIn(field, adopted)
        self.assertEqual(self.w.read()['applications'][0]['status'], 'submitted')
        self.assertEqual(packages.changed(self.w.path, app), [])

    def test_recovery_and_fact_audits_survive_export_restore(self):
        fact, _, _, app = self.package()
        self.mark(app)
        recovered = self.correct(app)
        self.s.action('retire', {'id': fact['id']})
        self.s.action('restore-fact', {'id': fact['id']})
        archive = self.w.export(self.root / 'recovery.zip')
        destination = self.root / 'reopened'
        restore(archive, destination)
        copy_workspace = Workspace(destination)
        try:
            state = Service(copy_workspace).state()
            self.assertEqual(state['applications'][0]['submission_correction']['recovery_application_id'], recovered['id'])
            self.assertFalse(state['facts'][0]['confirmed'])
            self.assertEqual(len(state['events']), 3)
            self.assertEqual(submitted_job_ids(state), set())
        finally:
            copy_workspace.close()


    def backend(self):
        archive = self.w.export(self.root / 'hosted-recovery.zip')
        backend = Backend()
        backend.commit(OWNER, 0, archive.read_bytes())
        return backend

    def test_hosted_recovery_is_owner_scoped_and_uses_the_mutation_guard(self):
        fact, _, _, app = self.package()
        self.mark(app)
        self.s.action('retire', {'id': fact['id']})
        original_pdf = packages.path_for(self.w.path, app, 'resume.pdf').read_bytes()
        backend = self.backend()
        with patch.object(backend, 'mutation_guard', wraps=backend.mutation_guard) as guard:
            with self.assertRaises(ValueError):
                execute(backend, OTHER, 'restore-fact', {'id': fact['id']})
            restored = execute(backend, OWNER, 'restore-fact', {'id': fact['id']})['result']
            self.assertFalse(restored['confirmed'])
            recovered = execute(backend, OWNER, 'correct-submission', {'id': app['id'], 'base': app['manifest_hash'],
                'confirmed': True, 'reason': 'The manual record was entered before applying.'})['result']
            self.assertEqual(guard.call_count, 3)
        self.assertEqual(recovered['status'], 'draft')
        state = execute(backend, OWNER, 'state', {})['state']
        self.assertEqual(state['applications'][0]['status'], 'submitted')
        self.assertEqual(state['applications'][0]['submission_correction']['recovery_application_id'], recovered['id'])
        self.assertEqual(execute(backend, OTHER, 'state', {})['state']['applications'], [])
        self.assertEqual(execute(backend, OWNER, 'file', {'id': app['id'], 'name': 'resume.pdf'})['binary'], original_pdf)

    def test_hosted_failed_commit_preserves_the_original_snapshot(self):
        _, _, _, app = self.package()
        self.mark(app)
        backend = self.backend()
        before = copy.deepcopy((backend.rows, backend.files))
        with patch.object(backend, 'commit', side_effect=CloudError('Conflict', 409)), self.assertRaises(CloudError):
            execute(backend, OWNER, 'correct-submission', {'id': app['id'], 'base': app['manifest_hash'],
                'confirmed': True, 'reason': 'Manual record was incorrect.'})
        self.assertEqual((backend.rows, backend.files), before)
        self.assertNotIn('submission_correction', execute(backend, OWNER, 'state', {})['state']['applications'][0])

    def test_hosted_package_cap_does_not_partially_publish_a_recovery(self):
        _, _, _, app = self.package()
        self.mark(app)
        with self.w.edit() as state:
            state['applications'].extend({**app, 'id': uid(), 'status': 'draft'} for _ in range(24))
        backend = self.backend()
        before = copy.deepcopy((backend.rows, backend.files))
        with self.assertRaisesRegex(CloudError, 'Pilot limit'):
            execute(backend, OWNER, 'correct-submission', {'id': app['id'], 'base': app['manifest_hash'],
                'confirmed': True, 'reason': 'Manual record was incorrect.'})
        self.assertEqual((backend.rows, backend.files), before)


if __name__ == '__main__':
    unittest.main()
