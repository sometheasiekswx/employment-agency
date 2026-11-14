"""Confirmed company cleanup with fictional workspace records."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
from threading import Barrier
import unittest
from unittest.mock import patch

from employment_agency import application_queue, companies, company_cleanup, packages, store
from employment_agency.service import Service
import test_company_cooldown


class CompanyCleanup(unittest.TestCase):
    seed = test_company_cooldown.CompanyCooldown.seed
    setUp = test_company_cooldown.CompanyCooldown.setUp
    tearDown = test_company_cooldown.CompanyCooldown.tearDown
    role = test_company_cooldown.CompanyCooldown.role
    draft = test_company_cooldown.CompanyCooldown.draft
    submit = test_company_cooldown.CompanyCooldown.submit

    def preview(self):
        return self.s.action('company-jobs-cleanup-preview', {})

    def apply(self, preview):
        return self.s.action('company-jobs-cleanup-apply', {'confirmed': True, 'fingerprint': preview['fingerprint']})

    def listing(self, job):
        return companies.by_id(self.w.read()['jobs'], job['id'])

    def february(self):
        return patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc))

    def test_manual_confirmation_moves_only_unsubmitted_jobs_and_retains_version_bytes(self):
        second, standby = self.role('second'), self.role('standby')
        duplicate = self.role('alias', 'first')
        unresolved = self.s.action('job', {**standby, 'id': None, 'url': 'https://employer.example.test/unlinked'})
        saved = self.role('saved')
        manual_removed, rejected = self.role('manual-removed'), self.role('rejected')
        removal_id = store.uid()
        manual = self.s.action('remove-job', {'id': manual_removed['id'], 'removal_id': removal_id})
        self.s.action('review', {'id': self.draft(rejected)['id'], 'status': 'rejected'})
        apps = [self.draft(standby), self.draft(standby)]
        folders = {app['id']: self.w.path / app['folder'] for app in apps}
        files = {path: path.read_bytes() for folder in folders.values() for path in folder.iterdir() if path.is_file()}
        with self.february():
            self.s.action('save-job', {'id': saved['id'], 'saved': True})
            first = self.submit(self.job, '2026-01-10')
            self.submit(duplicate, '2026-01-14')
            self.assertFalse(self.listing(standby).get('removals'))
            final = self.submit(second, '2026-01-20')
            removed, = self.listing(standby)['removals']
            self.assertEqual(removed['reason'], 'Company application limit reached')
            self.assertEqual(removed['source'], application_queue.COMPANY_CLEANUP_SOURCE)
            state = self.w.read()
            self.assertEqual([companies.by_id(state['applications'], app['id']) for app in apps], apps)
            self.assertEqual({path: path.read_bytes() for path in files}, files)
            for app in (first, final):
                self.assertEqual(companies.by_id(state['applications'], app['id']), app)
                self.assertFalse(packages.changed(self.w.path, app))
            for job in (self.job, second, duplicate, unresolved, rejected, saved):
                self.assertFalse(self.listing(job).get('removals'))
            self.assertEqual(self.listing(manual_removed)['removals'], manual['removals'])
            self.assertEqual([row['role_id'] for row in self.s.action('agent-queue', {})['rows']], [saved['id']])
            removed_rows = self.s.action('application-queue', {'stage': 'removed'})['rows']
            self.assertIn((standby['id'], apps[-1]['id']), {(row['job_id'], row['application_id']) for row in removed_rows})
            report = self.preview()
            self.assertEqual(report['candidates'], [])
            self.assertEqual([(item['job_id'], item['code']) for item in report['skipped']],
                             [(unresolved['id'], 'employer_unresolved')])
            self.assertNotIn('employer_id', report['skipped'][0])
            self.assertEqual(state['events'][-1]['records'], report['skipped'])

    def test_confirmed_history_during_manual_pause_counts_only_when_dated(self):
        second, standby = self.role('historical'), self.role('standby')
        with self.february():
            self.submit(self.job, '2026-01-10')
            self.s.action('company-pause', {'job_id': self.job['id']})
            self.s.action('job', {**second, 'prior_application': 'submitted'})
            self.assertEqual(self.preview()['companies'], [])
            self.assertFalse(self.listing(standby).get('removals'))
            with patch.object(companies, 'clock', return_value=datetime(2026, 2, 10, tzinfo=timezone.utc)):
                self.s.action('company-map', {'job_id': second['id'], 'confirmed': True, 'submitted_on': '2026-02-08'})
                self.assertEqual(self.listing(standby)['removals'][-1]['reason'], company_cleanup.REASON)
                self.assertTrue(companies.job_status(self.w.read(), standby['id'])['cooling'])

    def test_late_confirmed_submission_supersedes_only_automatic_removal(self):
        second, late, equivalent, manual = [self.role(name) for name in ('second', 'late', 'equivalent', 'manual')]
        late_draft, manual_draft = self.draft(late), self.draft(manual)
        self.s.action('remove-job', {'id': manual['id'], 'removal_id': store.uid()})
        with self.february():
            self.submit(self.job, '2026-01-10')
            self.submit(second, '2026-01-20')
            original = self.listing(late)['removals']
            equivalent_original = self.listing(equivalent)['removals']
            self.s.action('review', {'id': late_draft['id'], 'status': 'submitted', 'occurred_at': '2026-01-22'})
            self.s.action('review', {'id': manual_draft['id'], 'status': 'submitted', 'occurred_at': '2026-01-23'})
            self.s.action('company-map', {'job_id': equivalent['id'], 'confirmed': True, 'same_job_id': late['id']})
            submitted = self.s.action('application-queue', {'stage': 'submitted'})['rows']
            self.assertIn((late['id'], late_draft['id']), {(row['job_id'], row['application_id']) for row in submitted})
            self.assertNotIn(equivalent['id'], {row['job_id'] for row in submitted})
            self.assertEqual([row['job_id'] for row in self.s.action('application-queue', {'stage': 'removed'})['rows']],
                             [manual['id']])
            for job, events in ((late, original), (equivalent, equivalent_original)):
                self.assertEqual(self.listing(job)['removals'], events)
                projected = companies.by_id(self.s.state()['jobs'], job['id'])
                self.assertTrue(projected['removals'][-1]['superseded_by_submission'])
            self.assertNotIn('superseded_by_submission',
                             companies.by_id(self.s.state()['jobs'], manual['id'])['removals'][-1])
            self.assertFalse(packages.changed(self.w.path, late_draft))

            restored_dir = self.root / 'late-commit-snapshot'
            store.restore_snapshot(self.w.path, restored_dir)
            with closing(store.Workspace(restored_dir, create=False)) as restored:
                self.assertEqual(companies.by_id(restored.read()['jobs'], late['id'])['removals'], original)
                restored_service = Service(restored)
                self.assertTrue(companies.by_id(restored_service.state()['jobs'], late['id'])['removals'][-1][
                    'superseded_by_submission'
                ])
                self.assertIn(late['id'], {row['job_id'] for row in restored_service.action(
                    'application-queue', {'stage': 'submitted'}
                )['rows']})

                override_id = store.uid()
                args = {'id': late['id'], 'removal_id': override_id}
                manual_override = restored_service.action('remove-job', args)
                latest = manual_override['removals'][-1]
                self.assertEqual(latest['id'], override_id)
                self.assertNotIn('superseded_by_submission', latest)
                removed = restored_service.action('application-queue', {'stage': 'removed'})['rows']
                self.assertIn(late['id'], {row['job_id'] for row in removed})
                restored_service.action('restore-job', args)
                submitted = restored_service.action('application-queue', {'stage': 'submitted'})['rows']
                self.assertIn(late['id'], {row['job_id'] for row in submitted})

            self.s.action('correct-submission', {
                'id': late_draft['id'], 'base': late_draft['manifest_hash'], 'confirmed': True,
                'reason': 'The late confirmation was recorded by mistake.',
            })
            self.assertEqual(self.listing(late)['removals'], original)
            self.assertEqual({row['job_id'] for row in self.s.action('application-queue', {'stage': 'removed'})['rows']},
                             {late['id'], equivalent['id'], manual['id']})
            self.assertFalse(packages.changed(self.w.path, late_draft))

    def test_existing_round_requires_current_explicit_preview_and_restore_survives_retry(self):
        second, standby, alternate = self.role('second'), self.role('standby'), self.role('alternate')
        with self.february(), patch.object(company_cleanup, 'after_submission'):
            self.submit(self.job, '2026-01-10')
            self.submit(second, '2026-01-20')
        with self.february():
            manifest = (self.w.path / 'state.json').read_bytes()
            preview = self.preview()
            self.assertEqual(self.preview(), preview)
            self.s.state()
            self.s.action('company-avoid', {})
            self.assertEqual((self.w.path / 'state.json').read_bytes(), manifest)
            backup = self.w.export(self.root / 'round.zip')
            for name, restore, source in [('zip', store.restore, backup),
                                          ('snapshot', store.restore_snapshot, self.w.path)]:
                with self.subTest(restore=name):
                    path = self.root / name
                    restore(source, path)
                    with closing(store.Workspace(path, create=False)) as reopened:
                        service = Service(reopened)
                        self.assertFalse(companies.by_id(reopened.read()['jobs'], standby['id']).get('removals'))
                        copied = service.action('company-jobs-cleanup-preview', {})
                        self.assertNotEqual(copied['fingerprint'], preview['fingerprint'])
                        self.assertEqual(copied['candidates'], preview['candidates'])
            self.s.action('company-cooldown-settings', {'months': 4})
            self.assertFalse(self.listing(standby).get('removals'))
            with self.assertRaisesRegex(companies.CompanyBlocked, 'Preview the current scope'):
                self.apply(preview)
            fresh = self.preview()
            self.s.action('company-map', {'job_id': standby['id'], 'confirmed': True, 'same_job_id': alternate['id']})
            with self.assertRaisesRegex(companies.CompanyBlocked, 'Preview the current scope'):
                self.apply(fresh)
            reviewed = self.preview()
            gate = Barrier(2)

            def execute(_):
                gate.wait()
                try:
                    return self.apply(reviewed)['removed_count']
                except companies.CompanyBlocked as exc:
                    return exc.code

            with ThreadPoolExecutor(2) as executor:
                self.assertCountEqual(executor.map(execute, range(2)), [2, 'company_jobs_cleanup_changed'])
            removal, = self.listing(standby)['removals']
            self.s.action('restore-job', {'id': standby['id'], 'removal_id': removal['id']})
            self.assertEqual(self.apply(self.preview())['removed_count'], 0)
            self.assertTrue(self.listing(standby)['removals'][0]['restored_at'])
            self.assertEqual(len(self.listing(standby)['removals']), 1)
            saved = self.w.export(self.root / 'removed.zip')
            for name, restore, source in [('removed-zip', store.restore, saved),
                                          ('removed-snapshot', store.restore_snapshot, self.w.path)]:
                path = self.root / name
                restore(source, path)
                with closing(store.Workspace(path, create=False)) as reopened:
                    self.assertEqual(reopened.read()['jobs'], self.w.read()['jobs'])

    def test_active_and_resumable_work_is_reported_and_never_swept_on_an_unrelated_write(self):
        second = self.role('second')
        held = self.role('held', 'held')
        held_alias = self.role('held-alias', 'held')
        queued = self.role('queued')
        pending_record = self.role('receipt')
        batch = self.role('batch')
        standby = self.role('standby')
        with self.february():
            self.submit(self.job, '2026-01-10')
            with self.w.edit() as state:
                state['submission_attempts'] = [{
                    'id': store.uid(), 'channel': 'manual', 'status': 'unknown',
                    'binding': {'job_id': held['id']}, 'created_at': store.now(),
                }]
                state['agent_runs'] = [
                    {'id': store.uid(), 'status': status, 'job_id': job['id']}
                    for status, job in [('queued', queued), ('record_pending', pending_record)]
                ]
                state['runs'].append({'id': store.uid(), 'status': 'paused', 'queue': [batch['id']], 'done': []})
            self.submit(second, '2026-01-20')
            protected = {job['id'] for job in (held, held_alias, queued, pending_record, batch)}
            self.assertEqual({row['job_id'] for row in self.preview()['skipped']}, protected)
            self.assertTrue(self.listing(standby).get('removals'))
            with self.w.edit() as state:
                state['submission_attempts'][0]['status'] = 'not_sent'
                for run in state['agent_runs']:
                    run['status'] = 'stopped'
                state['runs'][0]['status'] = 'complete'
            self.assertFalse(any(self.listing(job).get('removals') for job in (held, held_alias, queued, pending_record, batch)))
            self.assertEqual({row['job_id'] for row in self.preview()['candidates']}, protected)
