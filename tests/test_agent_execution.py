"""Connected authorization, worker lifecycle and recoverable artifact recording."""

from pathlib import Path
import shutil
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from employment_agency import companies, packages
from employment_agency.agent_execution import AgentExecution
from employment_agency.agent_website import Help
from employment_agency.codex_runtime import CodexError
from employment_agency.service import Service
from employment_agency.store import Workspace, digest, restore, restore_snapshot
import agent_fixture as fixture


class RecordingWebsite:
    def __init__(self, *, before=lambda: None, after=lambda: None):
        self.requests = []
        self.before = before
        self.after = after

    def readiness(self):
        return {'available': True, 'reason': ''}

    def submit(self, destination, documents, identity, answers, *, before_dispatch, **kwargs):
        assert destination == fixture.TARGET
        self.before()
        before_dispatch({'kind': 'submit', 'documents': [{k: doc[k] for k in ('role', 'filename', 'sha256')}
                                                        for doc in documents.values()]})
        self.requests.append((destination, documents))
        self.after()
        return {'provider': 'website', 'url': destination, 'confirmation': 'Fixture submitted',
                'response_sha256': digest(b'Fictional receipt')}


class AgentTestWorkspace(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='ea-agent-tests-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        config = patch.dict('os.environ', {'EA_CONFIG_HOME': str(self.root / 'config')})
        config.start()
        self.addCleanup(config.stop)
        self.service, self.job, self.profile = fixture.service(self.root / 'workspace')
        self.addCleanup(self.service.w.close)
        self.runtime, self.site = fixture.CallingRuntime(), RecordingWebsite()
        self.mail, self.telegram = fixture.RecordingMail(), fixture.RecordingTelegram()
        self.agent = self.connect(self.service)

    def connect(self, service, **kwargs):
        dependencies = {'runtime': self.runtime, 'website': self.site, 'mail': self.mail, 'telegram': self.telegram, **kwargs}
        agent = service.agent_execution = AgentExecution(service, **dependencies)
        self.addCleanup(agent.close)
        return agent

    def start(self, *, key='fictional-start-request', **values):
        args = {'job_ids': [self.job['id']], 'request_key': key, **values}
        return self.service.action('agent-application-start', args)['runs'][0]

    def status(self, run, statuses, *, settled=True):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            row = self.service.action('agent-application-status', {'id': run['id']})['runs'][0]
            if row['status'] in statuses and (not settled or not self.agent.busy):
                return row
            time.sleep(0.02)
        self.fail(f'Run did not reach {statuses}: {row}')


class AgentTests(AgentTestWorkspace):
    def test_start_is_idempotent_and_bindings_are_exact(self):
        with self.assertRaisesRegex(ValueError, 'request key'):
            self.start(key='')
        self.assertEqual(self.runtime.calls, [])
        run = self.start()
        self.assertEqual(run['id'], self.start()['id'])
        result = self.status(run, {'submitted'})
        state = self.service.w.read()
        attempt = state['submission_attempts'][0]
        self.assertEqual(result['attempt_id'], attempt['id'])
        self.assertEqual(len(self.site.requests), 1)
        self.assertEqual(attempt['receipt']['provider'], 'website')
        self.assertEqual([call.get('ok') for call in self.runtime.calls], [False, False, None, False])
        app = state['applications'][0]
        self.assertEqual(app['status'], 'submitted')
        self.assertEqual(result['application_id'], app['id'])
        for role, document in self.site.requests[0][1].items():
            self.assertEqual(document['data'], packages.path_for(self.service.w.path, app, role).read_bytes())
        self.assertFalse(self.mail.messages or self.telegram.messages)
        with self.assertRaisesRegex(ValueError, 'submitted'):
            self.start(key='fictional-second-request')

    def test_last_company_slot_requires_a_fixed_selection(self):
        link = companies.employer_link(self.service.w.read(), self.job['id'])
        first = self.service.action('job', {**self.job, 'id': None, 'url': 'https://employer.example.test/first'})
        other = self.service.action('job', {**self.job, 'id': None, 'url': 'https://employer.example.test/second'})
        for job in (first, other):
            self.service.action('company-map', {'job_id': job['id'], 'employer_id': link['employer_id'], 'confirmed': True})
        app = self.service.action('local-package', {'job_id': first['id'], 'profile_id': self.profile['id']})
        self.service.action('review', {'id': app['id'], 'status': 'submitted'})
        with self.assertRaisesRegex(ValueError, 'available slots'):
            self.start(job_ids=[self.job['id'], other['id']])
        self.assertEqual(self.service.w.read().get('agent_runs', []), [])

    def test_two_pending_roles_can_start_and_submit_in_their_existing_slots(self):
        employer = companies.employer_link(self.service.w.read(), self.job['id'])['employer_id']
        other = self.service.action('job', {**self.job, 'id': None, 'url': 'https://employer.example.test/another'})
        self.service.action('company-map', {'job_id': other['id'], 'employer_id': employer, 'confirmed': True})
        fixture.destination(self.service, other, 'website', fixture.TARGET)
        ids = [self.job['id'], other['id']]
        for job_id in ids:
            self.service.action('save-job', {'id': job_id, 'saved': True})
        result = self.service.action('agent-application-start', {'job_ids': ids, 'request_key': 'fictional-two-pending'})
        for run in result['runs']:
            self.status(run, {'submitted'})
        self.assertEqual(len(self.site.requests), 2)
        self.assertEqual(self.service.action('agent-queue', {})['total'], 0)
        status = self.service.action('company-roles', {'job_id': other['id']})['status']
        self.assertTrue(status['cooling'])
        self.assertEqual(len(status['submitted_vacancies']), 2)

    def test_unknown_dispatch_never_falls_back_and_can_reconcile(self):
        def timeout():
            raise TimeoutError('fictional connection lost')

        self.site.after = timeout
        fixture.destination(self.service, self.job, 'telegram', fixture.TELEGRAM)
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL)
        run = self.start()
        self.status(run, {'uncertain'})
        self.assertEqual(len(self.site.requests), 1)
        self.assertFalse(self.mail.messages or self.telegram.messages)
        with self.assertRaisesRegex(ValueError, 'reconciliation'):
            self.service.action('agent-application-resume', {'id': run['id']})
        result = self.service.action('agent-application-resolve', {'id': run['id'], 'outcome': 'not_sent',
                                     'evidence': 'The controlled receiver verified no submission.', 'confirmed': True})['runs'][0]
        self.assertEqual(result['status'], 'stopped')
        self.assertEqual(len(self.site.requests), 1)
        self.assertEqual(companies.job_status(self.service.w.read(), self.job['id'])['remaining'], 2)

    def test_user_confirmed_outcome_keeps_unknown_version_unassociated(self):
        def timeout():
            raise TimeoutError('fictional connection lost')

        self.site.after = timeout
        run = self.start()
        self.status(run, {'uncertain'})
        result = self.service.action('agent-application-resolve', {'id': run['id'], 'outcome': 'confirmed',
                                     'evidence': 'I verified the other document on the controlled website.',
                                     'occurred_at': '2026-11-13T14:00:00+00:00', 'confirmed': True})['runs'][0]
        self.assertEqual(result['status'], 'submitted')
        self.assertIsNone(result['document_application_id'])
        self.assertNotIn('application_id', result)
        self.assertEqual(self.service.w.read()['applications'][0]['status'], 'draft')
        self.assertEqual(len(self.site.requests), 1)

    def test_expired_undispatched_reservation_can_be_stopped_and_replaced(self):
        arrived = threading.Event()
        release = threading.Event()

        def wait():
            arrived.set()
            self.assertTrue(release.wait(5))
            raise Help('Fictional connection failed.')

        self.site.before = wait
        run = self.start()
        self.assertTrue(arrived.wait(5))
        try:
            with self.service.w.edit() as state:
                state['agent_runs'][0]['authority']['expires_at'] = '2020-01-01T00:00:00+00:00'
            # Simulate interruption before the worker can persist its status update.
            with patch.object(self.agent, 'fail', side_effect=sqlite3.OperationalError('database unavailable')):
                release.set()
                self.status(run, {'interrupted'})
        finally:
            release.set()
        result = self.service.action('agent-application-stop', {'id': run['id']})['runs'][0]
        self.assertEqual(result['status'], 'stopped')
        self.assertEqual(companies.job_status(self.service.w.read(), self.job['id'])['remaining'], 2)
        self.site.before = lambda: None
        replacement = self.start(key='replacement-start-request')
        self.status(replacement, {'submitted'})
        self.assertEqual(len(self.site.requests), 1)

    def test_unprepared_authority_refuses_a_changed_selected_profile(self):
        arrived = threading.Event()
        release = threading.Event()

        class Pause(fixture.CallingRuntime):
            def run(runtime, *args, **kwargs):
                arrived.set()
                self.assertTrue(release.wait(5))
                super().run(*args, **kwargs)

        self.agent.runtime = Pause()
        run = self.start()
        self.assertTrue(arrived.wait(5))
        try:
            with self.service.w.edit() as state:
                state['profiles'][0]['minimum'] = {'CAD': 123456}
        finally:
            release.set()
        result = self.status(run, {'needs_help'})
        self.assertIn('search profile', result['message'])
        self.assertEqual(self.service.w.read()['applications'], [])
        self.assertEqual(self.site.requests, [])

    def test_unprepared_authority_refuses_changed_document_settings(self):
        arrived = threading.Event()
        release = threading.Event()

        class Pause(fixture.CallingRuntime):
            def run(runtime, *args, **kwargs):
                arrived.set()
                self.assertTrue(release.wait(5))
                super().run(*args, **kwargs)

        self.agent.runtime = Pause()
        run = self.start()
        self.assertTrue(arrived.wait(5))
        try:
            self.service.action('workspace-settings', {'preferred_locations': ['Toronto Harbour']})
            self.service.action('workspace-settings', {'location_aliases': {'Toronto': 'Toronto Harbour'}})
        finally:
            release.set()
        result = self.status(run, {'needs_help'})
        self.assertIn('document settings', result['message'])
        self.assertEqual(self.service.w.read()['applications'], [])
        self.assertEqual(self.site.requests, [])

    def test_stop_before_dispatch_releases_slot(self):
        arrived = threading.Event()
        release = threading.Event()

        def wait():
            arrived.set()
            self.assertTrue(release.wait(5))

        self.site.before = wait
        run = self.start()
        self.assertTrue(arrived.wait(5))
        try:
            self.assertEqual(companies.job_status(self.service.w.read(), self.job['id'])['remaining'], 1)
            result = self.service.action('agent-application-stop', {'id': run['id']})['runs'][0]
            self.assertEqual(result['status'], 'stopping')
        finally:
            release.set()
        self.status(run, {'stopped'})
        self.assertEqual(self.site.requests, [])
        self.assertEqual(companies.job_status(self.service.w.read(), self.job['id'])['remaining'], 2)

    def test_stop_serializes_with_the_external_dispatch_checkpoint(self):
        ready = threading.Event()
        release = threading.Event()
        dispatch_entered = threading.Event()
        dispatch_finished = threading.Event()
        original = self.agent.dispatch

        def wait():
            ready.set()
            self.assertTrue(release.wait(5))

        def dispatch(*args):
            dispatch_entered.set()
            try:
                return original(*args)
            finally:
                dispatch_finished.set()

        self.site.before = wait
        with patch.object(self.agent, 'dispatch', side_effect=dispatch):
            run = self.start()
            try:
                self.assertTrue(ready.wait(5))
                with self.agent.changed:
                    release.set()
                    self.assertTrue(dispatch_entered.wait(5))
                    dispatch_finished.wait(0.25)
                    self.service.action('agent-application-stop', {'id': run['id']})
            finally:
                release.set()
            self.status(run, {'stopped', 'submitted', 'uncertain'})
        self.assertEqual(self.site.requests, [])

    def test_changed_document_while_reserved_prevents_upload(self):
        arrived = threading.Event()
        release = threading.Event()

        def wait():
            arrived.set()
            self.assertTrue(release.wait(5))

        self.site.before = wait
        run = self.start()
        self.assertTrue(arrived.wait(5))
        try:
            state = self.service.w.read()
            packages.path_for(self.service.w.path, state['applications'][0], 'resume.pdf').write_bytes(b'altered fixture PDF')
        finally:
            release.set()
        result = self.status(run, {'needs_help'})
        self.assertIn('documents changed', result['message'])
        self.assertEqual(self.site.requests, [])

    def test_first_receipt_transaction_failure_is_record_only(self):
        original = self.agent.store_receipt
        with patch.object(self.agent, 'store_receipt', side_effect=OSError('receipt DB write failed')):
            run = self.start()
            pending = self.status(run, {'record_pending'})
        self.assertEqual(pending['receipt']['provider'], 'website')
        self.assertTrue(self.agent.receipt_path(pending['attempt_id']).is_file())
        self.assertEqual(self.service.w.read()['applications'][0]['status'], 'draft')
        self.assertEqual(len(self.site.requests), 1)
        with patch.object(self.agent, 'store_receipt', wraps=original) as recording:
            result = self.service.action('agent-application-resolve', {'id': run['id'], 'outcome': 'record'})['runs'][0]
            self.assertEqual(result['status'], 'submitted')
            recording.assert_called_once()
        self.assertEqual(len(self.site.requests), 1)
        self.assertFalse(self.agent.receipt_path(pending['attempt_id']).exists())

    def test_submission_version_record_failure_keeps_committed_channel_receipt(self):
        with patch.object(self.service, 'review', side_effect=OSError('version recording failed')):
            run = self.start()
            self.status(run, {'record_pending'})
        attempt = self.service.w.read()['submission_attempts'][0]
        self.assertEqual(attempt['status'], 'confirmed')
        self.assertEqual(attempt['receipt']['provider'], 'website')
        result = self.service.action('agent-application-resolve', {'id': run['id'], 'outcome': 'record'})['runs'][0]
        self.assertEqual(result['status'], 'submitted')
        self.assertEqual(len(self.site.requests), 1)

    def test_receipt_survives_zip_and_snapshot_restore_before_database_record(self):
        with patch.object(self.agent, 'store_receipt', side_effect=OSError('receipt DB write failed')):
            run = self.start()
            pending = self.status(run, {'record_pending'})
        backup = self.service.w.export(self.root / 'with-receipt.zip')
        for name, source, restore_workspace in (
            ('zip', backup, restore),
            ('snapshot', self.service.w.path, restore_snapshot),
        ):
            with self.subTest(name=name):
                restored_path = self.root / name
                restore_workspace(source, restored_path)
                restored = Service(Workspace(restored_path))
                self.addCleanup(restored.w.close)
                clone = self.connect(restored)
                result = restored.action('agent-application-status', {'id': run['id']})['runs'][0]
                self.assertEqual(result['status'], 'record_pending')
                self.assertEqual(result['receipt'], pending['receipt'])
                self.assertFalse(result['can_resume'] or clone.busy)
                result = restored.action('agent-application-resolve', {'id': run['id'], 'outcome': 'record'})['runs'][0]
                self.assertEqual(result['status'], 'submitted')
                self.assertEqual(result['application_id'], pending['application_id'])
        self.assertEqual(len(self.site.requests), 1)

    def test_receipt_survives_database_unavailability_when_the_channel_returns(self):
        original = self.service.w.read
        fail = threading.Event()

        def read():
            if fail.is_set() and threading.current_thread() == self.agent.thread:
                raise sqlite3.OperationalError('database unavailable after external response')
            return original()

        self.site.after = fail.set
        with patch.object(self.service.w, 'read', side_effect=read):
            run = self.start()
            pending = self.status(run, {'record_pending', 'uncertain'})
        self.assertEqual(pending['status'], 'record_pending')
        self.assertEqual(pending['receipt']['provider'], 'website')
        result = self.service.action('agent-application-resolve', {'id': run['id'], 'outcome': 'record'})['runs'][0]
        self.assertEqual(result['status'], 'submitted')
        self.assertEqual(len(self.site.requests), 1)

    def test_live_machine_permit_cannot_authorize_edited_destination_scope(self):
        class Disconnected(fixture.CallingRuntime):
            def run(self, *args, **kwargs):
                raise CodexError('Fixture disconnected.')

        self.agent.runtime = Disconnected()
        run = self.start()
        self.status(run, {'needs_help'})
        self.assertTrue(self.agent.has_permit(self.agent.find_run(self.service.w.read(), run['id'])))
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL, required=True)
        with self.service.w.edit() as state:
            row = self.agent.find_run(state, run['id'])
            row['authority']['destinations'] = [{
                'channel': 'email', 'value': fixture.EMAIL, 'source_url': fixture.TARGET,
                'required': True, 'instructions': '',
            }]
        self.agent.runtime = self.runtime
        with self.assertRaisesRegex(ValueError, 'fresh authorization'):
            self.service.action('agent-application-resume', {'id': run['id']})
        self.assertEqual(self.mail.messages, [])

    def test_restore_read_never_replays_or_inherits_resume_authority(self):
        class Disconnected(fixture.CallingRuntime):
            def run(self, *args, **kwargs):
                raise CodexError('Fixture usage exhausted.')

        self.agent.runtime = Disconnected()
        run = self.start()
        result = self.status(run, {'needs_help'})
        self.assertIn('usage exhausted', result['message'])
        backup = self.service.w.export(self.root / 'backup.zip')
        restore(backup, self.root / 'restored')
        restored = Service(Workspace(self.root / 'restored'))
        self.addCleanup(restored.w.close)
        clone = self.connect(restored)
        result = restored.action('agent-application-status', {'id': run['id']})['runs'][0]
        self.assertEqual(result['status'], 'interrupted')
        self.assertFalse(result['can_resume'])
        self.assertFalse(clone.busy)
        with self.assertRaisesRegex(ValueError, 'fresh authorization'):
            restored.action('agent-application-resume', {'id': run['id']})
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.site.requests, [])

    def test_raw_copy_with_same_workspace_id_still_requires_fresh_authority(self):
        class Disconnected(fixture.CallingRuntime):
            def run(self, *args, **kwargs):
                raise CodexError('Fixture disconnected.')

        self.agent.runtime = Disconnected()
        run = self.start()
        self.status(run, {'needs_help'})
        self.agent.close()
        self.service.w.close()
        copied = self.root / 'copied-workspace'
        shutil.copytree(self.service.w.path, copied)
        clone_service = Service(Workspace(copied))
        self.addCleanup(clone_service.w.close)
        self.assertEqual(self.service.w.workspace_id, clone_service.w.workspace_id)
        clone = self.connect(clone_service)
        state = clone_service.action('agent-application-status', {'id': run['id']})['runs'][0]
        self.assertEqual(state['status'], 'interrupted')
        self.assertFalse(state['can_resume'] or clone.busy)
        with self.assertRaisesRegex(ValueError, 'fresh authorization'):
            clone_service.action('agent-application-resume', {'id': run['id']})
        self.assertEqual(self.site.requests, [])

    def test_same_path_cannot_resume_without_the_machine_local_permit(self):
        class Disconnected(fixture.CallingRuntime):
            def run(self, *args, **kwargs):
                raise CodexError('Fixture disconnected.')

        self.agent.runtime = Disconnected()
        run = self.start()
        self.status(run, {'needs_help'})
        self.agent.close()
        self.service.w.close()
        with patch.dict('os.environ', {'EA_CONFIG_HOME': str(self.root / 'new-machine-config')}):
            reopened = Service(Workspace(self.service.w.path))
        self.addCleanup(reopened.w.close)
        clone = self.connect(reopened)
        result = reopened.action('agent-application-status', {'id': run['id']})['runs'][0]
        self.assertEqual(result['status'], 'interrupted')
        self.assertFalse(result['can_resume'] or clone.busy)
        with self.assertRaisesRegex(ValueError, 'fresh authorization'):
            reopened.action('agent-application-resume', {'id': run['id']})
        self.assertEqual(self.site.requests, [])
