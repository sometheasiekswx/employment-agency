"""Exercise the local journey with fictional state, documents and reports."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
import json
import sqlite3
import subprocess
import sys
from threading import Barrier, Thread
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from employment_agency import application_queue, cloud, companies, packages, store
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.sqlite_workspace import DATABASE, DATABASE_VERSION, SQLiteState
import test_workflow


class ApplicationJourney(unittest.TestCase):
    seed = test_workflow.Workflow.seed
    tearDown = test_workflow.Workflow.tearDown

    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.w.close()
        self.w = store.Workspace(self.root / 'sqlite-journey', sqlite=True)
        self.s = Service(self.w)
        self.fact, self.profile, self.job = self.seed()

    def role(self, suffix, **fields):
        return self.s.action('job', {**self.job, 'id': None,
                                     'url': 'https://example.test/jobs/' + suffix, **fields})

    def map(self, job=None, **fields):
        return self.s.action('company-map', {'job_id': (job or self.job)['id'], 'confirmed': True, **fields})

    def draft(self, job=None):
        return self.s.action('local-package', {'job_id': (job or self.job)['id'], 'profile_id': self.profile['id']})

    def context(self, job=None, app=None):
        return self.s.action('application-context', {
            'job_ids': [(job or self.job)['id']],
            'application_ids': {app['job_id']: app['id']} if app else {},
        })['roles'][0]

    def mark(self, job=None, marked=True):
        return self.s.action('agent-queue-mark', {'job_id': (job or self.job)['id'], 'marked': marked})

    def start(self, app, key=None, **fields):
        return self.s.action('self-application-start', {'job_id': app['job_id'], 'application_id': app['id'],
                                                        'request_key': key or store.uid(), **fields})

    def report(self, attempt, **fields):
        return self.s.action('company-submission-resolve', {
            'id': attempt['id'], 'outcome': 'confirmed', 'confirmed': True,
            'occurred_at': '2026-01-12T09:15:00+00:00', 'evidence': 'Fictional site confirmation 792.', **fields,
        })

    def test_agent_queue_is_independent_and_restores_without_execution(self):
        first = self.mark()
        saved = self.role('saved')
        self.s.action('save-job', {'id': saved['id'], 'saved': True})
        self.mark(saved)
        self.assertEqual(self.mark(), first)
        handoff = self.s.action('application-handoff', {'job_ids': [self.job['id'], saved['id']]})
        self.assertEqual(handoff['workspace_id'], self.w.workspace_id)
        self.assertIn('application-context', handoff['text'])
        self.assertIn('grants no authority', handoff['text'])
        self.assertNotIn(self.fact['text'], handoff['text'])
        self.assertNotIn('alex@example.test', handoff['text'])
        self.assertFalse(self.w.read()['applications'])
        self.assertIsNone(self.s.agent_execution)
        self.assertFalse(self.w.read().get('submission_attempts'))
        with patch.object(packages, 'changed', side_effect=AssertionError('Queue opened documents')):
            page = self.s.action('agent-queue', {'limit': 1})
            rest = self.s.action('agent-queue', {'offset': page['next_offset']})
        self.assertEqual(page['total'], 2)
        self.assertEqual({row['role_id'] for row in page['rows'] + rest['rows']}, {self.job['id'], saved['id']})
        self.assertTrue(all(row['application_id'] is None for row in page['rows'] + rest['rows']))
        self.assertEqual([row['job_id'] for row in self.s.action('application-queue', {'stage': 'saved'})['rows']],
                         [saved['id']])
        package = self.draft()
        self.assertEqual(self.context()['application']['id'], package['id'])
        removal_id = store.uid()
        self.s.action('remove-job', {'id': self.job['id'], 'removal_id': removal_id})
        self.assertEqual(self.s.action('agent-queue', {})['total'], 1)
        self.assertTrue(self.w.read()['agent_intents'][0]['marked'])
        self.s.action('restore-job', {'id': self.job['id'], 'removal_id': removal_id})
        self.assertEqual(self.s.action('agent-queue', {})['total'], 2)
        backup = self.w.export(self.root / 'journey.zip')
        for name, method, source in [('zip', store.restore, backup), ('snapshot', store.restore_snapshot, self.w.path)]:
            with self.subTest(restore=name):
                destination = self.root / name
                method(source, destination)
                restored = store.Workspace(destination, create=False)
                try:
                    service = Service(restored)
                    self.assertNotEqual(restored.workspace_id, self.w.workspace_id)
                    self.assertEqual(service.action('agent-queue', {}), self.s.action('agent-queue', {}))
                    self.assertIsNone(service.agent_execution)
                    self.assertFalse(restored.read().get('submission_attempts'))
                finally:
                    restored.close()
        self.mark(marked=False)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 1)

    def test_agent_queue_migration_is_transactional_and_preserves_snapshot(self):
        self.mark()
        path = self.w.path
        before = (path / 'state.json').read_bytes()
        self.w.close()
        with closing(sqlite3.connect(path / DATABASE)) as database, database:
            database.execute('DROP TABLE agent_queue')
            database.execute('PRAGMA user_version = 5')
        with patch.object(SQLiteState, 'save_agent_queue', side_effect=sqlite3.OperationalError):
            with self.assertRaisesRegex(ValueError, 'database change could not be saved'):
                store.Workspace(path, create=False)
        with closing(sqlite3.connect(path / DATABASE)) as database:
            self.assertEqual(database.execute('PRAGMA user_version').fetchone(), (5,))
            self.assertIsNone(database.execute("SELECT name FROM sqlite_schema WHERE name = 'agent_queue'").fetchone())
        self.w = store.Workspace(path, create=False)
        self.s = Service(self.w)
        self.assertEqual(self.w.database.connection.execute('PRAGMA user_version').fetchone(), (DATABASE_VERSION,))
        self.assertEqual(self.s.action('agent-queue', {})['rows'][0]['role_id'], self.job['id'])
        self.assertEqual((path / 'state.json').read_bytes(), before)

    def test_context_uses_exact_version_live_facts_and_role_scoped_answers(self):
        original = self.context()
        self.assertIn('employer_unresolved', {row['code'] for row in original['blockers']})
        self.assertIn('version_required', {row['code'] for row in original['blockers']})
        self.assertEqual(original['destinations'], [])
        old = self.draft()
        self.map()
        latest = self.draft()
        inputs = {'job_id': self.job['id'], 'channel': 'website', 'value': 'https://apply.example.test/exact-job',
                  'source_url': self.job['url'], 'evidence': 'Apply button on official advert.', 'confirmed': True}
        self.s.action('application-destination', inputs)
        self.s.action('application-answer', {'job_id': self.job['id'], 'question': 'Do you need sponsorship?',
                                           'field': 'sponsorship', 'value': 'Yes, for this role', 'confirmed': True})
        before = self.w.read()
        context = self.s.action('application-context', {'job_ids': [self.job['id']],
                                                        'application_ids': {self.job['id']: old['id']}})
        exact = context['roles'][0]
        self.assertEqual(context['authority'], {'granted': False})
        self.assertEqual(exact['job']['url'], self.job['url'])
        self.assertEqual(exact['application']['id'], old['id'])
        self.assertEqual(self.context()['application']['id'], latest['id'])
        cv = next(item for item in exact['documents'] if item['role'] == 'resume.pdf')
        self.assertEqual(cv['sha256'], store.digest((self.w.path / cv['path']).read_bytes()))
        self.assertEqual(exact['destinations'][0]['value'], inputs['value'])
        self.assertEqual(exact['answers'][0]['scope']['job_id'], self.job['id'])
        self.assertEqual(exact['facts'][0]['id'], self.fact['id'])
        self.assertNotIn('minimum', exact['profile'])
        self.assertEqual(self.w.read(), before)
        self.assertEqual(self.context(self.role('unrelated'))['answers'], [])
        self.mark()
        self.s.action('save-job', {'id': self.job['id'], 'saved': True})
        self.assertEqual(self.context()['listing_sha256'], exact['listing_sha256'])
        self.assertEqual(self.context()['answers'], exact['answers'])
        self.s.action('retire', {'id': self.fact['id']})
        stale = self.context(app=latest)
        self.assertIn('facts_changed', {row['code'] for row in stale['blockers']})
        self.assertEqual(stale['facts'], [])
        self.s.action('job', {**self.job, 'description': 'Material change to a fictional listing.'})
        self.assertEqual(self.context()['answers'], [])
        self.assertEqual(self.context()['destinations'], [])

    def test_research_resolution_requires_actual_source_evidence_and_reuses_it(self):
        rejected = self.role('recruiter-client', employer='Confidential')
        with self.assertRaisesRegex(ValueError, 'different hiring employers'):
            self.s.action('company-resolve', {'job_id': rejected['id'], 'name': self.job['employer'],
                'source_url': rejected['url'], 'evidence': 'Recruiter lists an unnamed client.', 'verified': True})
        self.assertIsNone(self.context(rejected)['employer'])
        link = self.s.action('company-resolve', {'job_id': self.job['id'], 'name': self.job['employer'],
            'source_url': self.job['url'], 'evidence': 'Official careers site names exact hiring employer.',
            'verified': True, 'requisition': 'REQ-196'})
        self.assertEqual(link['provenance']['actor'], 'research-agent')
        posting = {**self.job, 'id': None, 'url': 'https://example.test/jobs/duplicate',
                   'employer_evidence': {'name': self.job['employer'], 'url': 'https://example.test/jobs/duplicate',
                                         'source': 'published-hiring-employer', 'requisition': 'REQ-196'}}
        imported, _, _ = self.s.import_discovery([posting])
        self.assertEqual(companies.employer_link(self.w.read(), imported[0])['vacancy_id'], link['vacancy_id'])
        feed = self.s.action('source', {'kind': 'workable', 'board': 'example-official'})
        candidates = [{**posting, 'url': 'https://apply.example.test/role', 'source': 'workable:example-official',
                       'employer_evidence': {}, 'employer': 'example-official'},
                      {**posting, 'url': 'https://apply.example.test/other', 'source': 'workable:example-official',
                       'employer_evidence': {}, 'employer': 'Distinct Recruiting Client'}]
        imported, _, _ = self.s.import_discovery(candidates, source_id=feed['id'], research_name=self.job['employer'],
            research_evidence='https://example.test/careers')
        verified, unknown = [companies.employer_link(self.w.read(), job_id) for job_id in imported]
        self.assertEqual(verified['employer_id'], link['employer_id'])
        self.assertEqual(verified['provenance']['source'], 'verified-employer-board')
        self.assertIsNone(unknown)

    def test_changed_explicit_hiring_employer_evidence_preserves_history_and_blocks_sending(self):
        self.map()
        original_link = companies.employer_link(self.w.read(), self.job['id'])
        original_name = self.job['employer']

        def refresh(published_name):
            return self.s.import_discovery([{**self.job, 'employer': published_name, 'employer_evidence': {
                'name': published_name, 'url': self.job['url'], 'source': 'published-hiring-employer',
            }}])

        refresh(original_name)
        app = self.draft()
        exact = self.context(app=app)
        self.assertTrue(exact['destinations'])
        refresh(original_name)
        self.assertEqual(self.context()['listing_sha256'], exact['listing_sha256'])
        refresh('Unrelated Fictional Hiring Employer')
        conflict = self.context(app=app)
        self.assertEqual(conflict['job']['employer'], original_name)
        self.assertEqual(conflict['employer_link'], original_link)
        self.assertNotEqual(conflict['listing_sha256'], exact['listing_sha256'])
        self.assertFalse(self.s.state()['jobs'][0]['hiring_employer_verified'])
        self.assertFalse(conflict['destinations'])
        self.assertIn('employer_evidence_conflict', {item['code'] for item in conflict['blockers']})
        with self.assertRaisesRegex(ValueError, 'different hiring employer'):
            self.start(app)
        with self.assertRaisesRegex(ValueError, 'different hiring employer'):
            companies.check_slot(self.w.read(), self.job['id'])
        self.assertFalse(self.w.read().get('submission_attempts'))

        refresh(original_name)
        rechecked = self.context(app=app)
        self.assertEqual(rechecked['listing_sha256'], exact['listing_sha256'])
        self.assertTrue(self.s.state()['jobs'][0]['hiring_employer_verified'])
        self.assertEqual(self.start(app)['status'], 'handed_off')

    def test_self_apply_has_one_reservation_and_retains_exact_bytes_on_reconciliation(self):
        self.map()
        self.mark()
        app = self.draft()
        body = packages.path_for(self.w.path, app, 'resume.pdf').read_bytes()
        source = self.context(app=app)
        key = store.uid()
        attempt = self.start(app, key, listing_sha256=source['listing_sha256'], destination=self.job['url'])
        self.assertEqual(self.start(app, key, listing_sha256=source['listing_sha256'], destination=self.job['url']), attempt)
        self.assertEqual(attempt['status'], 'handed_off')
        self.assertEqual(self.w.read()['applications'][0]['status'], 'draft')
        self.assertEqual(self.context(app=app)['allowance']['remaining'], 1)
        with self.assertRaisesRegex(ValueError, 'already holds'):
            self.start(app)
        with patch.object(self.s, 'review', side_effect=ValueError('Controlled recording interruption')):
            result = self.report(attempt, documents_used=True)
        self.assertEqual(result['status'], 'unknown')
        self.assertIn('needs reconciliation', result['note'])
        self.assertEqual(self.context(app=app)['allowance']['remaining'], 1)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 1)
        with self.assertRaisesRegex(ValueError, 'different outcome'):
            self.report(attempt, outcome='not_sent')
        result = self.report(attempt, documents_used=True)
        self.assertEqual(result['status'], 'confirmed')
        self.assertEqual(result['receipt']['source'], 'user-report')
        self.assertEqual(result['document_application_id'], app['id'])
        self.assertEqual(self.report(attempt, documents_used=True), result)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 0)
        submitted = self.s.action('application-queue', {'stage': 'submitted'})['rows']
        self.assertEqual(submitted[0]['application_id'], app['id'])
        self.assertEqual(packages.path_for(self.w.path, app, 'resume.pdf').read_bytes(), body)
        self.assertEqual(self.s.action('company-submission-status', {'job_id': self.job['id']}), [result])

    def test_self_apply_records_unknown_document_association_and_verified_not_sent(self):
        self.map()
        app = self.draft()
        reserved = self.start(app)
        result = self.report(reserved, outcome='not_sent', evidence='No form was submitted.')
        self.assertEqual(result['status'], 'not_sent')
        self.assertEqual(self.context()['allowance']['remaining'], 2)
        next_attempt = self.start(app)
        result = self.report(next_attempt, documents_used=False, submission_channel='email',
                             submission_destination='employer@example.test', follow_up='Provide a work sample.')
        self.assertIsNone(result['document_application_id'])
        self.assertEqual(result['follow_up'], 'Provide a work sample.')
        self.assertEqual(self.w.read()['applications'][0]['status'], 'draft')
        self.assertEqual(self.s.action('application-queue', {'stage': 'submitted'})['rows'][0]['application_id'], None)
        self.assertEqual(self.s.action('company-submission-follow-up', {'id': result['id'],
                         'follow_up': 'Work sample available.'})['follow_up'], 'Work sample available.')

    def test_self_apply_revalidates_destination_and_serializes_last_company_slot(self):
        employer_id = self.map()['employer_id']
        other = self.role('second')
        self.map(other, employer_id=employer_id)
        first, second = self.draft(), self.draft(other)
        self.s.action('application-destination', {'job_id': self.job['id'], 'channel': 'website',
            'value': 'https://apply.example.test/new-role', 'source_url': self.job['url'],
            'evidence': 'Current official Apply link.', 'confirmed': True})
        with self.assertRaisesRegex(ValueError, 'destination changed'):
            self.start(first, destination=self.job['url'])
        history = self.role('previous')
        self.map(history, employer_id=employer_id)
        historical = self.draft(history)
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            self.s.action('review', {'id': historical['id'], 'status': 'submitted', 'occurred_at': '2026-01-15'})
            gate = Barrier(2)

            def reserve(app):
                gate.wait()
                try:
                    return self.start(app)
                except ValueError as exc:
                    return str(exc)

            with ThreadPoolExecutor(2) as executor:
                results = list(executor.map(reserve, [first, second]))
        self.assertEqual(len([value for value in results if isinstance(value, dict)]), 1)
        self.assertIn('Both application slots are in use at this company', results)

    def test_self_apply_resume_revalidates_a_retained_reservation(self):
        self.map()
        app = self.draft()
        attempt = self.start(app)
        args = {'id': attempt['id']}
        self.assertEqual(self.s.action('company-submission-continue', args), attempt)
        path = packages.path_for(self.w.path, app, 'resume.pdf')
        original = path.read_bytes()
        path.write_bytes(b'Changed fictional document')
        with self.assertRaisesRegex(ValueError, 'Documents changed'):
            self.s.action('company-submission-continue', args)
        path.write_bytes(original)
        self.s.action('job', {**self.job, 'description': 'Revised fictional job description.'})
        with self.assertRaisesRegex(ValueError, 'listing changed'):
            self.s.action('company-submission-continue', args)
        self.s.action('job', self.job)
        self.s.action('application-destination', {'job_id': self.job['id'], 'channel': 'website',
            'value': 'https://apply.example.test/changed', 'source_url': self.job['url'],
            'evidence': 'Changed official application form.', 'confirmed': True})
        with self.assertRaisesRegex(ValueError, 'destination changed'):
            self.s.action('company-submission-continue', args)
        with self.assertRaisesRegex(ValueError, 'destination changed'):
            self.start(app, attempt['self_apply_request'])
        self.assertEqual(self.context()['allowance']['remaining'], 1)
        self.assertEqual(
            self.report(attempt, outcome='not_sent', evidence='I verified no form was submitted.')['status'],
            'not_sent',
        )

    def test_confirmed_receipt_pending_recording_does_not_show_a_different_draft(self):
        self.map()
        exact = self.draft()
        later = self.draft()
        receipt = {
            'id': store.uid(), 'status': 'confirmed', 'channel': 'website',
            'application_id': exact['id'], 'binding': {'job_id': self.job['id'], 'application_id': exact['id']},
            'document_application_id': exact['id'], 'occurred_at': '2026-01-12',
        }
        with self.w.edit() as state:
            state['submission_attempts'] = [receipt]
        self.assertIsNone(self.s.state()['application_queue'][0]['application_id'])
        self.assertIsNone(self.context()['application'])
        self.assertEqual(self.context()['attempts'], [receipt])
        before = (self.w.path / 'state.json').read_bytes()
        self.w.close()
        # Model a schema-5 derived queue retaining the unrelated latest draft.
        with closing(sqlite3.connect(self.w.path / DATABASE)) as database, database:
            database.execute('UPDATE application_queue SET application_id = ?', (later['id'],))
            database.execute('DROP TABLE agent_queue')
            database.execute('PRAGMA user_version = 5')
        self.w = store.Workspace(self.w.path, create=False)
        self.s = Service(self.w)
        self.assertEqual((self.w.path / 'state.json').read_bytes(), before)
        self.assertEqual(self.w.read()['submission_attempts'], [receipt])
        self.assertIsNone(self.s.state()['application_queue'][0]['application_id'])
        self.s.action('review', {'id': exact['id'], 'status': 'submitted', 'occurred_at': receipt['occurred_at']})
        active = self.s.state()['application_queue'][0]
        self.assertEqual((active['stage'], active['application_id']), ('submitted', exact['id']))

    def test_equivalent_submitted_vacancy_leaves_the_agent_queue(self):
        employer = self.map(requisition='REQ-1')['employer_id']
        duplicate = self.role('same-requisition')
        self.map(duplicate, employer_id=employer, requisition='REQ-1')
        self.mark(duplicate)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 1)
        app = self.draft()
        self.s.action('review', {'id': app['id'], 'status': 'submitted', 'occurred_at': '2026-01-12'})
        self.assertEqual(self.s.action('agent-queue', {})['total'], 0)
        related = next(job for job in self.s.state()['jobs'] if job['id'] == duplicate['id'])
        self.assertTrue(related['company']['submitted_vacancy'])
        self.assertNotEqual(related.get('prior_application'), 'submitted')
        self.assertEqual(len(list(application_queue.project(self.w.read()))), 1)

    def test_verified_cv_post_does_not_parse_editable_companions_and_requires_token(self):
        app = self.draft()
        app_path = self.w.path / app['folder']
        docx = app_path / app['documents']['resume.docx']
        docx.write_bytes(b'Preserved invalid editable companion')
        manifest = packages.record(self.w.path, app)
        manifest['files'][docx.name] = store.digest(docx.read_bytes())
        (app_path / 'version.json').write_bytes(store.encode(manifest))
        sealed = packages.seal(self.w.path, app_path)
        with self.w.edit() as state:
            state['applications'][0]['manifest_hash'] = sealed
        http = server(self.s, port=0)
        origin = f'http://127.0.0.1:{http.server_port}'
        background = Thread(target=http.serve_forever, daemon=True)
        background.start()
        try:
            with urlopen(origin + '/api/state', timeout=3) as response:
                token = json.load(response)['token']

            def cv(token):
                request = Request(origin + '/api/file', data=store.encode({'id': app['id'], 'name': 'resume.pdf'}),
                                  headers={'Content-Type': 'application/json', 'Origin': origin, 'X-Workspace-Token': token})
                with urlopen(request, timeout=3) as response:
                    self.assertEqual(response.headers.get_content_type(), 'application/pdf')
                    return response.read()

            with patch('employment_agency.editor.load', side_effect=AssertionError('Editable source parsed')):
                self.assertEqual(cv(token), (app_path / app['documents']['resume.pdf']).read_bytes())
            with self.assertRaises(HTTPError) as rejected:
                cv('old-workspace-token')
            self.assertEqual(rejected.exception.code, 403)
            docx.write_bytes(b'An unverified disk edit')
            with self.assertRaises(HTTPError) as altered:
                cv(token)
            self.assertEqual(altered.exception.code, 400)
        finally:
            http.shutdown()
            http.server_close()
            background.join(3)

    def test_hosted_operations_do_not_expose_local_context_queue_or_execution(self):
        for action in ('application-context', 'agent-queue', 'agent-queue-mark', 'application-handoff',
                       'self-application-start', 'agent-capabilities', 'agent-application-start'):
            with self.subTest(action=action):
                with self.assertRaisesRegex(cloud.CloudError, 'available only in the local app'):
                    cloud._execute(Mock(), 'fictional-owner', action, {})

    def test_running_connected_application_holds_workspace_switch_and_reload(self):
        agent = Mock()
        agent.busy = True
        self.s.agent_execution = agent
        http = server(self.s, port=0, frontend_origin='http://127.0.0.1:3000')
        origin = f'http://127.0.0.1:{http.server_port}'
        background = Thread(target=http.serve_forever, daemon=True)
        background.start()
        try:
            with urlopen(origin + '/api/development', timeout=3) as response:
                self.assertFalse(json.load(response)['reload_safe'])
            with urlopen(origin + '/api/state', timeout=3) as response:
                token = json.load(response)['token']
            target = self.root / 'replacement'
            request = Request(origin + '/api/workspace-create', data=store.encode({'path': str(target)}),
                              headers={'Content-Type': 'application/json', 'Origin': origin, 'X-Workspace-Token': token})
            with self.assertRaises(HTTPError) as rejected:
                urlopen(request, timeout=3)
            self.assertEqual(rejected.exception.code, 400)
            self.assertFalse(target.exists())
            agent.close.assert_not_called()
            agent.busy = False
            with urlopen(origin + '/api/development', timeout=3) as response:
                self.assertTrue(json.load(response)['reload_safe'])
            with urlopen(request, timeout=3) as response:
                self.assertEqual(json.load(response)['result']['path'], str(target.resolve()))
            agent.close.assert_called_once_with()
            self.assertTrue(self.w.handle.closed)
        finally:
            http.shutdown()
            http.server_close()
            background.join(3)

    def test_cli_refuses_execution_before_opening_a_workspace(self):
        target = self.root / 'should-not-open'
        for operation in ('agent-application-start', 'agent-application-resume', 'agent-application-answer'):
            with self.subTest(operation=operation):
                result = subprocess.run([sys.executable, '-m', 'employment_agency', '--workspace', str(target),
                                         'action', operation], input='{}', capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 2)
                self.assertIn('through the running local app', result.stderr)
                self.assertFalse(target.exists())
