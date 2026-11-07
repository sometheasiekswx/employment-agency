"""Opportunity removal preserves application evidence and survives rediscovery."""
import copy
import unittest
from unittest.mock import patch

import test_workflow
from test_cloud import Backend, OWNER, OTHER
from employment_agency.cloud import execute
from employment_agency.service import Service
from employment_agency.store import Workspace, digest, restore


FIRST = '1' * 32
SECOND = '2' * 32


class JobRemoval(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def operation(self, action, job, removal_id=FIRST, **args):
        return self.s.action(action, {'id': job['id'], 'removal_id': removal_id, **args})

    def test_removal_reason_and_restore_survive_reopening_and_backup(self):
        _, _, job = self.seed()
        self.s.action('save-job', {'id': job['id'], 'saved': True})
        removed = self.operation('remove-job', job)
        self.assertEqual(set(removed), {'id', 'removals'})
        self.assertEqual(removed['id'], job['id'])
        self.assertEqual(removed['removals'][0]['id'], FIRST)
        self.assertEqual(removed['removals'][0]['reason'], '')
        self.assertTrue(removed['removals'][0]['at'])
        reason = self.operation('job-removal-reason', job, comment='Outside my preferred location.')
        self.w.close()
        self.w = Workspace(self.root / 'private')
        self.s = Service(self.w)
        self.assertEqual(self.w.read()['jobs'][0]['removals'], reason['removals'])
        restored = self.operation('restore-job', job)
        self.assertTrue(restored['removals'][0]['restored_at'])
        self.assertEqual(restored['removals'][0]['reason'], 'Outside my preferred location.')
        self.assertTrue(self.w.read()['jobs'][0]['saved'])
        archive = self.w.export(self.root / 'backup.zip')
        restore(archive, self.root / 'restored')
        recovered = Workspace(self.root / 'restored')
        try:
            self.assertEqual(recovered.read()['schema'], 2)
            self.assertEqual(recovered.read()['jobs'][0], self.w.read()['jobs'][0])
        finally:
            recovered.close()

    def test_retries_and_stale_undo_do_not_change_a_newer_removal(self):
        _, _, job = self.seed()
        first = self.operation('remove-job', job)
        self.assertEqual(self.operation('remove-job', job), first)
        with self.assertRaisesRegex(ValueError, 'already removed'):
            self.operation('remove-job', job, SECOND)
        restored = self.operation('restore-job', job)
        self.assertEqual(self.operation('restore-job', job), restored)
        # A delayed retry cannot reapply an event that has already been undone.
        self.assertEqual(self.operation('remove-job', job), restored)
        second = self.operation('remove-job', job, SECOND)
        self.assertEqual(len(second['removals']), 2)
        self.assertNotIn('restored_at', second['removals'][-1])
        self.assertEqual(self.operation('restore-job', job), second)
        self.assertEqual(self.operation('remove-job', job), second)
        self.assertEqual(self.operation('remove-job', job, SECOND), second)

    def test_reasons_can_target_history_and_be_edited_or_cleared(self):
        _, _, job = self.seed()
        self.operation('remove-job', job)
        self.operation('restore-job', job)
        self.operation('remove-job', job, SECOND)
        with patch('employment_agency.service.now', return_value='2026-11-07T01:00:00+00:00'):
            result = self.operation('job-removal-reason', job, comment='  First reason\nMore detail.  ')
        self.assertEqual(result['removals'][0]['reason'], 'First reason\nMore detail.')
        self.assertEqual(result['removals'][0]['reason_updated_at'], '2026-11-07T01:00:00+00:00')
        self.assertIn('restored_at', result['removals'][0])
        self.assertEqual(result['removals'][1]['reason'], '')
        self.assertNotIn('restored_at', result['removals'][1])
        self.assertEqual(self.operation('job-removal-reason', job, comment='First reason\nMore detail.'), result)
        edited = self.operation('job-removal-reason', job, comment='Updated reason')
        self.assertEqual(edited['removals'][0]['reason'], 'Updated reason')
        cleared = self.operation('job-removal-reason', job, comment='  ')
        self.assertEqual(cleared['removals'][0]['reason'], '')
        maximum = self.operation('job-removal-reason', job, SECOND, comment='x' * 4000)
        self.assertEqual(len(maximum['removals'][1]['reason']), 4000)

    def test_job_import_and_source_rediscovery_preserve_user_history(self):
        _, _, job = self.seed()
        self.s.action('save-job', {'id': job['id'], 'saved': True})
        self.operation('remove-job', job)
        history = self.operation('job-removal-reason', job, comment='Keep this decision')['removals']
        for by_url in (False, True):
            with self.subTest(by_url=by_url):
                incoming = {**job, 'title': 'Updated Engineer', 'removals': [], 'saved': False}
                if by_url:
                    incoming.pop('id')
                updated = self.s.action('job', incoming)
                self.assertEqual(updated['removals'], history)
                self.assertTrue(updated['saved'])
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fictional'})
        refreshed_job = {**job, 'source': 'greenhouse:fictional', 'removals': []}
        with patch('employment_agency.sources.discover', return_value=[refreshed_job]):
            self.assertEqual(self.s.action('discover', {'id': source['id']}), {'count': 1})
        self.assertEqual(self.w.read()['jobs'][0]['removals'], history)
        restored = self.operation('restore-job', job)
        updated = self.s.action('job', {**job, 'removals': history})
        self.assertEqual(updated['removals'], restored['removals'])
        # Advert metadata cannot inject a user decision into a new listing.
        new = self.s.action('job', {**job, 'id': '3' * 32, 'removals': history})
        self.assertFalse(new.get('removals'))

    def test_invalid_arguments_or_unknown_events_leave_state_unchanged(self):
        _, _, job = self.seed()
        self.operation('remove-job', job)
        invalid = []
        for action in ('remove-job', 'restore-job', 'job-removal-reason'):
            valid = {'id': job['id'], 'removal_id': FIRST, 'comment': 'Reason'}
            for value in (None, '', [], {}, 12, 'z' * 32, '../state.json', 'a' * 33):
                invalid.append((action, {**valid, 'id': value}))
                invalid.append((action, {**valid, 'removal_id': value}))
            invalid.extend([(action, {}), (action, {'id': job['id']})])
        for value in (None, [], {}, 12, 'x' * 4001, 'bad\x00text'):
            invalid.append(('job-removal-reason', {'id': job['id'], 'removal_id': FIRST, 'comment': value}))
        invalid.extend([
            ('job-removal-reason', {'id': job['id'], 'removal_id': FIRST}),
            ('restore-job', {'id': job['id'], 'removal_id': SECOND}),
            ('job-removal-reason', {'id': job['id'], 'removal_id': SECOND, 'comment': ''}),
            ('remove-job', {'id': 'f' * 32, 'removal_id': FIRST}),
        ])
        before = (self.w.path / 'state.json').read_bytes()
        for action, args in invalid:
            with self.subTest(action=action, args=args):
                with self.assertRaises(ValueError):
                    self.s.action(action, args)
                self.assertEqual((self.w.path / 'state.json').read_bytes(), before)

    def test_idless_url_reimport_retains_custom_id_and_application_links(self):
        _, profile, original = self.seed()
        job = self.s.action('job', {
            **original, 'id': 'c' * 32, 'url': 'https://example.test/roles/custom-engineer',
        })
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
        self.s.action('save-job', {'id': job['id'], 'saved': True})
        history = self.operation('remove-job', job)['removals']
        applications = self.w.read()['applications']
        incoming = {key: value for key, value in job.items() if key != 'id'}
        incoming.update({'title': 'Updated custom engineer', 'removals': [], 'saved': False})
        updated = self.s.action('job', incoming)
        self.assertEqual(updated['id'], job['id'])
        self.assertEqual(updated['removals'], history)
        self.assertTrue(updated['saved'])
        self.assertEqual(updated['prior_application'], 'submitted')
        state = self.w.read()
        self.assertEqual({item['id'] for item in state['jobs']}, {original['id'], job['id']})
        self.assertEqual(state['applications'], applications)

    def test_source_generated_ids_reuse_unique_url_identity_without_closing_it(self):
        _, _, original = self.seed()
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fictional'})
        job = self.s.action('job', {
            **original, 'id': 'c' * 24, 'url': 'https://example.test/roles/legacy-engineer',
            'source': 'greenhouse:fictional', 'availability': 'retrieved',
        })
        history = self.operation('remove-job', job)['removals']
        incoming = {**job, 'id': digest(job['url'].encode())[:24],
                    'title': 'Refreshed legacy engineer', 'removals': [],
                    'checked_at': '2026-11-07T02:00:00Z'}
        with patch('employment_agency.sources.url_job', return_value=incoming):
            imported = self.s.action('url', {'url': job['url']})
        self.assertEqual(imported['id'], job['id'])
        self.assertEqual(imported['removals'], history)
        with patch('employment_agency.sources.discover', return_value=[incoming]):
            self.assertEqual(self.s.action('discover', {'id': source['id']}), {'count': 1})
        jobs = [item for item in self.w.read()['jobs'] if item['url'] == job['url']]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]['id'], job['id'])
        self.assertEqual(jobs[0]['removals'], history)
        self.assertEqual(jobs[0]['availability'], 'retrieved')
        self.assertEqual(jobs[0]['checked_at'], incoming['checked_at'])

    def test_ambiguous_url_reimport_rejects_without_merging_records(self):
        _, _, job = self.seed()
        duplicate = self.s.action('job', {**job, 'id': 'c' * 32})
        self.operation('remove-job', duplicate)
        incoming = {key: value for key, value in job.items() if key != 'id'}
        before = (self.w.path / 'state.json').read_bytes()
        for action, args in (('job', incoming), ('url', {'url': job['url']})):
            with self.subTest(action=action), patch('employment_agency.sources.url_job', return_value=job):
                with self.assertRaisesRegex(ValueError, 'Multiple jobs share this URL'):
                    self.s.action(action, args)
                self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        # An explicit user ID can still update exactly one ambiguous listing.
        updated = self.s.action('job', {**job, 'title': 'Explicitly selected listing'})
        self.assertEqual(updated['id'], job['id'])
        self.assertFalse(updated.get('removals'))
        jobs = self.w.read()['jobs']
        self.assertEqual(len(jobs), 2)
        preserved = next(item for item in jobs if item['id'] == duplicate['id'])
        self.assertEqual(preserved['removals'][0]['id'], FIRST)

    def test_generated_id_conflict_cannot_overwrite_another_url(self):
        _, _, original = self.seed()
        target_url = 'https://example.test/roles/new-listing'
        job = self.s.action('job', {
            **original, 'id': digest(target_url.encode())[:24],
            'url': 'https://example.test/roles/existing-custom-listing',
        })
        self.operation('remove-job', job)
        incoming = {key: value for key, value in original.items() if key != 'id'}
        incoming['url'] = target_url
        generated = {**incoming, 'id': digest(target_url.encode())[:24]}
        before = (self.w.path / 'state.json').read_bytes()
        for action, args in (('job', incoming), ('url', {'url': target_url})):
            with self.subTest(action=action), patch('employment_agency.sources.url_job', return_value=generated):
                with self.assertRaisesRegex(ValueError, 'Job ID conflicts with another URL'):
                    self.s.action(action, args)
                self.assertEqual((self.w.path / 'state.json').read_bytes(), before)

    def test_removal_does_not_change_application_status_documents_or_other_state(self):
        _, profile, job = self.seed()
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
        self.s.action('save-job', {'id': job['id'], 'saved': True})
        before = copy.deepcopy(self.w.read())
        files = {path.relative_to(self.w.path): path.read_bytes()
                 for path in self.w.path.rglob('*') if path.is_file() and path.name not in {'state.json', '.lock'}}
        for action, args in [('remove-job', {}), ('job-removal-reason', {'comment': 'Optional note'}), ('restore-job', {})]:
            with self.subTest(action=action):
                self.operation(action, job, **args)
                current = self.w.read()
                current['jobs'][0].pop('removals')
                self.assertEqual(current, before)
                self.assertEqual({path.relative_to(self.w.path): path.read_bytes()
                                  for path in self.w.path.rglob('*') if path.is_file() and path.name not in {'state.json', '.lock'}}, files)

    def test_removed_jobs_remain_ranked_and_can_be_prepared_and_reviewed(self):
        _, profile, job = self.seed()
        ranking = self.s.action('rank', {'profile_id': profile['id']})
        self.operation('remove-job', job)
        rows = self.s.action('rank', {'profile_id': profile['id']})
        self.assertEqual([row['job']['id'] for row in rows], [job['id']])
        self.assertEqual(rows[0]['match'], ranking[0]['match'])
        self.assertEqual(rows[0]['job']['removals'][0]['id'], FIRST)
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.assertEqual(self.s.action('review', {'id': app['id'], 'status': 'reviewed'})['status'], 'reviewed')
        self.assertNotIn('restored_at', self.w.read()['jobs'][0]['removals'][0])

    def test_legacy_rejection_restores_as_draft_with_review_history(self):
        _, profile, job = self.seed()
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.s.action('review', {'id': app['id'], 'status': 'rejected', 'comment': 'Earlier decision.'})
        before = self.w.read()
        event = self.s.state()['jobs'][0]['removals'][-1]
        self.assertEqual(self.w.read(), before)
        self.assertEqual(event['legacy_application_id'], app['id'])
        self.operation('job-removal-reason', job, event['id'], comment='Still considering it.')
        self.operation('restore-job', job, event['id'])
        restored = self.w.read()['applications'][0]
        self.assertEqual(restored['status'], 'draft')
        self.assertEqual(restored['documents'], app['documents'])
        self.assertEqual(restored['comments'][:-1], before['applications'][0]['comments'])
        self.assertEqual(restored['comments'][-1]['text'], 'Restored from Removed.')
        self.assertIn('restored_at', self.s.state()['jobs'][0]['removals'][-1])

    def test_old_rejection_does_not_remove_a_preserved_submission(self):
        _, profile, job = self.seed()
        submitted = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        rejected = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.s.action('review', {'id': submitted['id'], 'status': 'submitted'})
        self.s.action('review', {'id': rejected['id'], 'status': 'rejected'})
        self.assertFalse(self.s.state()['jobs'][0].get('removals'))

    def test_application_with_no_listing_can_be_removed_and_keeps_removal_after_reimport(self):
        _, profile, job = self.seed()
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        with self.w.edit() as state:
            state['jobs'].clear()
        removed = self.operation('remove-job', job)
        self.assertEqual(self.s.state()['unlisted_removals'][job['id']], removed['removals'])
        self.assertEqual(self.w.read()['applications'][0], app)
        imported = self.s.action('job', job)
        self.assertEqual(imported['removals'], removed['removals'])
        self.assertIn('restored_at', self.operation('restore-job', job)['removals'][-1])


class HostedJobRemoval(unittest.TestCase):
    def test_removal_restore_and_reasons_are_owner_isolated_and_guarded(self):
        backend = Backend()
        data = {'title': 'Software Engineer', 'description': 'Build Python services.',
                'url': 'https://example.test/roles/engineer'}
        job = execute(backend, OWNER, 'job', data)['result']
        other = execute(backend, OTHER, 'job', data)['result']
        self.assertEqual(job['id'], other['id'])
        args = {'id': job['id'], 'removal_id': FIRST}
        with patch.object(backend, 'mutation_guard', wraps=backend.mutation_guard) as guard:
            removed = execute(backend, OWNER, 'remove-job', args)['result']
            reason = execute(backend, OWNER, 'job-removal-reason', {**args, 'comment': 'Private reason'})['result']
            restored = execute(backend, OWNER, 'restore-job', args)['result']
            self.assertEqual([call.args for call in guard.call_args_list], [(OWNER,)] * 3)
        self.assertEqual(removed['removals'][0]['reason'], '')
        self.assertEqual(reason['removals'][0]['reason'], 'Private reason')
        self.assertIn('restored_at', restored['removals'][0])
        self.assertEqual(execute(backend, OWNER, 'state', {})['state']['jobs'][0]['removals'], restored['removals'])
        self.assertFalse(execute(backend, OTHER, 'state', {})['state']['jobs'][0].get('removals'))
        before = copy.deepcopy(backend.files)
        with self.assertRaises(ValueError):
            execute(backend, OTHER, 'job-removal-reason', {**args, 'comment': 'Other account'})
        self.assertEqual(backend.files, before)
        other_removal = execute(backend, OTHER, 'remove-job', args)['result']
        self.assertEqual(other_removal['removals'][0]['reason'], '')
        self.assertNotIn('restored_at', other_removal['removals'][0])
        self.assertEqual(execute(backend, OWNER, 'state', {})['state']['jobs'][0]['removals'], restored['removals'])


if __name__ == '__main__':
    unittest.main()
