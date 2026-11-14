"""Verify the SQLite employer lookup used before an agent researches new jobs."""

from contextlib import closing
import json
import sqlite3
import subprocess
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from employment_agency import companies, store
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.sqlite_workspace import DATABASE, DATABASE_VERSION, SQLiteState
import test_workflow


class CompanyAvoid(unittest.TestCase):
    seed = test_workflow.Workflow.seed
    tearDown = test_workflow.Workflow.tearDown

    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.w.close()
        self.w = store.Workspace(self.root / 'sqlite', sqlite=True)
        self.s = Service(self.w)
        _, self.profile, self.first = self.seed()
        self.employer = self.s.action('company-map', {
            'job_id': self.first['id'], 'confirmed': True, 'requisition': 'first',
        })['employer_id']

    def role(self, suffix, *, employer=None, requisition=None, submitted_on=None, mapped=True):
        job = self.s.action('job', {
            **self.first, 'id': None, 'url': f'https://employer.example.test/role-{suffix}',
            'employer': employer or self.first['employer'],
            'prior_application': 'submitted' if submitted_on else 'none',
        })
        if mapped:
            self.s.action('company-map', {
                'job_id': job['id'], 'confirmed': True, 'employer_id': self.employer,
                'requisition': requisition or suffix, 'submitted_on': submitted_on,
            })
        return job

    def avoid(self):
        return self.s.action('company-avoid', {})['companies']

    def test_two_distinct_submissions_expire_at_assumed_midnight_and_open_two_slots(self):
        with patch.object(companies, 'clock', return_value=datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc)):
            name = self.first['employer']
            alias = name + ' Ltd'
            self.role('one', submitted_on='2026-01-01')
            self.role('duplicate', employer=alias, requisition='one', submitted_on='2026-01-01')
            self.assertEqual(self.avoid(), [])
            second = self.role('two', submitted_on='2026-03-01')
            self.assertEqual(self.avoid(), [{
                'id': self.employer, 'name': name, 'aliases': [name, alias],
                'submitted_count': 2, 'cooldown_until': '2026-06-01T00:00:00+00:00',
                'cooldown_time_assumed': True,
            }])
            self.assertEqual(next(job for job in self.s.state()['jobs'] if job['id'] == second['id'])[
                'submission_time'], {'at': '2026-03-01T00:00:00+00:00', 'assumed': True})
        with patch.object(companies, 'clock', return_value=datetime(2026, 6, 1, tzinfo=timezone.utc)):
            self.assertEqual(self.avoid(), [])
            args = {'job_id': self.first['id'], 'profile_id': self.profile['id']}
            self.assertEqual(self.s.action('company-roles', args)['status']['remaining'], 2)
        with patch.object(companies, 'clock', return_value=datetime(2026, 6, 11, tzinfo=timezone.utc)):
            self.role('three', submitted_on='2026-06-10T12:00')
            self.assertEqual(self.s.action('company-roles', args)['status']['remaining'], 1)
            self.assertEqual(self.avoid(), [])
            self.role('four', submitted_on='2026-06-11T00:00')
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-09-11T00:00:00+00:00')
            self.assertFalse(self.avoid()[0]['cooldown_time_assumed'])

    def test_later_submission_extends_pause_until_a_verified_correction(self):
        with patch.object(companies, 'clock', return_value=datetime(2026, 4, 2, tzinfo=timezone.utc)):
            self.role('one', submitted_on='2026-01-01')
            self.role('two', submitted_on='2026-03-01')
            third = self.role('third')
            draft = self.s.action('local-package', {'job_id': third['id'], 'profile_id': self.profile['id']})
            self.s.action('review', {'id': draft['id'], 'status': 'submitted', 'occurred_at': '2026-04-01T12:00'})
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-07-01T12:00:00+00:00')
            self.assertEqual(self.avoid()[0]['submitted_count'], 3)
            self.s.action('correct-submission', {
                'id': draft['id'], 'base': draft['manifest_hash'], 'confirmed': True,
                'reason': 'The fixture records that the application was never sent.',
            })
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-06-01T00:00:00+00:00')
            self.assertEqual(self.avoid()[0]['submitted_count'], 2)

    def test_later_submission_cannot_shorten_a_month_end_cooldown(self):
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            self.s.action('company-cooldown-settings', {'months': 1})
            self.role('one', submitted_on='2026-01-10T08:00Z')
            self.role('two', submitted_on='2026-01-30T23:30Z')
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-02-28T23:30:00+00:00')
            self.role('three', submitted_on='2026-01-31T12:00Z')
            self.assertEqual(self.avoid()[0]['submitted_count'], 3)
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 28, 23, tzinfo=timezone.utc)):
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-02-28T23:30:00+00:00')

    def test_confirmed_receipt_and_linked_history_count(self):
        with patch.object(companies, 'clock', return_value=datetime(2026, 4, 1, tzinfo=timezone.utc)):
            delivered = self.role('delivery')
            historical = self.role('legacy')
            decision = {'status': 'sent', 'title': historical['title'], 'employer': historical['employer']}
            with self.w.edit() as state:
                state['historical_decisions'] = [decision]
                state['submission_attempts'] = [{
                    'id': 'delivery-attempt', 'binding': {'job_id': delivered['id']},
                    'channel': 'gmail', 'status': 'unknown',
                }]
            self.s.action('company-history-link', {
                'history_id': companies.history_id(self.w.read()['historical_decisions'][0]),
                'job_id': historical['id'], 'confirmed': True, 'occurred_at': '2026-02-01',
            })
            self.assertEqual(self.avoid(), [])
            with self.w.edit() as state:
                state['submission_attempts'][0].update(status='confirmed', occurred_at='2026-03-01T13:00Z')
            self.assertEqual(self.avoid()[0]['cooldown_until'], '2026-06-01T13:00:00+00:00')
            self.s.action('remove-job', {'id': delivered['id'], 'removal_id': store.uid()})
            self.assertEqual(self.avoid()[0]['submitted_count'], 2)

    def test_research_prefers_new_companies_and_returns_every_eligible_role(self):
        with patch.object(companies, 'clock', return_value=datetime(2026, 6, 2, tzinfo=timezone.utc)):
            self.role('past', submitted_on='2026-01-01')
            self.role('past-two', submitted_on='2026-03-01')
            fallback = self.role('eligible-fallback')
            blocked = self.role('blocked', employer='Unverified History', mapped=False, submitted_on='2026-01-01')
            candidate = self.role('possible', employer=blocked['employer'], mapped=False)
            check = self.s.action('company-research-check', {'name': blocked['employer']})
            self.assertTrue(check['needs_review'])
            self.assertEqual(check['remaining'], 0)
            roles = [self.role(f'new-{i}', employer='New Platform', mapped=False) for i in range(9)]
            self.s.action('job', {**roles[-1], 'eligibility': 'conflict'})
            others = [self.role(f'company-{i}', employer=f'Other Company {i}', mapped=False) for i in range(4)]
            params = {'profile_id': self.profile['id'], 'job_ids': [
                job['id'] for job in (fallback, candidate, *roles, *others)
            ]}
            groups = self.s.action('company-research', params)
            self.assertEqual(len(groups['companies']), 5)
            self.assertEqual(groups['needs_review'][0]['name'], 'Unverified History')
            self.assertTrue(all(not row['submitted_count'] for row in groups['companies']))
            platform = next(row for row in groups['companies'] if row['name'] == 'New Platform')
            self.assertEqual({row['job']['id'] for row in platform['roles']}, {job['id'] for job in roles[:-1]})
            self.assertTrue(all(row['match']['unknowns'] for row in platform['roles']))
            params['job_ids'].remove(others[-1]['id'])
            self.assertEqual(self.s.action('company-research', params)['companies'][-1]['submitted_count'], 2)
            with self.assertRaisesRegex(ValueError, 'unknown workspace job ID'):
                self.s.action('company-research', {**params, 'job_ids': ['outside-workspace']})

    def test_company_source_checks_history_before_fetch_and_returns_checked_ids(self):
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
        args = {'name': self.first['employer'], 'source_id': source['id']}
        with patch.object(companies, 'clock', return_value=datetime(2026, 5, 31, tzinfo=timezone.utc)):
            self.role('one', submitted_on='2026-01-01')
            self.role('two', submitted_on='2026-03-01')
            with patch('employment_agency.service.sources.discover') as fetch:
                self.assertEqual(self.s.action('company-research-source', args)['count'], 0)
                fetch.assert_not_called()

        postings = [{
            **self.first, 'id': None, 'employer': 'fixture', 'source': 'greenhouse:fixture',
            'url': f'https://employer.example.test/board-role-{index}',
            'source_requisition': f'greenhouse:fixture:{index}', 'vacancy_requisition': 'one-opening',
        } for index in range(2)]
        with patch.object(companies, 'clock', return_value=datetime(2026, 6, 1, tzinfo=timezone.utc)):
            with patch('employment_agency.service.sources.discover', return_value=postings):
                result = self.s.action('company-research-source', args)
            self.assertEqual(len(result['job_ids']), 2)
            ranked = self.s.action('company-research', {
                'profile_id': self.profile['id'], 'job_ids': result['job_ids'],
            })
            self.assertEqual(len(ranked['companies'][0]['roles']), 1)
            self.assertEqual(ranked['companies'][0]['name'], self.first['employer'])
            self.assertEqual(ranked['companies'][0]['sources'][0]['status'], 'retrieved')

    def test_bound_board_preserves_verified_employer_and_rejects_conflicting_listings(self):
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
        self.s.action('company-map', {
            'job_id': self.first['id'], 'confirmed': True, 'source_id': source['id'],
        })
        listing = {
            **self.first, 'id': None, 'employer': 'fixture',
            'url': 'https://employer.example.test/board-role', 'source': 'greenhouse:fixture',
            'source_requisition': 'greenhouse:fixture:1',
        }
        with patch('employment_agency.service.sources.discover', return_value=[listing]):
            self.assertEqual(self.s.action('discover', {'id': source['id']}), {'count': 1})
        before = self.w.read()['jobs']
        self.assertEqual(before[-1]['employer'], self.first['employer'])

        other = self.role('other', employer='Other Hiring Employer', mapped=False)
        self.s.action('company-map', {'job_id': other['id'], 'confirmed': True})
        conflicting = {**listing, 'source_requisition': 'greenhouse:fixture:2', 'url': other['url']}
        with patch('employment_agency.service.sources.discover', return_value=[
            {**listing, 'title': 'Updated role'}, conflicting,
        ]):
            result = self.s.action('discover', {'id': source['id']})
        self.assertIn('previous results retained', result['error'])
        self.assertEqual(self.w.read()['jobs'], [*before, other])

    def seed_cooldown(self):
        today = datetime.now(timezone.utc).date()
        self.role('one', submitted_on=(today - timedelta(days=2)).isoformat())
        self.role('two', submitted_on=(today - timedelta(days=1)).isoformat())
        self.assertEqual(len(self.avoid()), 1)

    def test_replaces_the_schema_four_lifetime_count_with_the_active_deadline(self):
        self.seed_cooldown()
        expected = self.avoid()
        path = self.w.path
        self.w.close()
        with closing(sqlite3.connect(path / DATABASE)) as database, database:
            database.execute('DROP TABLE agent_queue')
            database.execute('DROP TABLE employer_submissions')
            database.execute("""
                CREATE TABLE employer_submissions (
                    employer_id TEXT PRIMARY KEY, name TEXT NOT NULL,
                    aliases TEXT NOT NULL, submitted_count INTEGER NOT NULL
                )
            """)
            database.execute('INSERT INTO employer_submissions VALUES (?, ?, ?, ?)',
                             (self.employer, self.first['employer'], '[]', 2))
            database.execute('PRAGMA user_version = 4')

        self.w = store.Workspace(path, create=False)
        self.s = Service(self.w)
        self.assertEqual(self.w.database.connection.execute('PRAGMA user_version').fetchone(), (DATABASE_VERSION,))
        self.assertEqual(self.avoid(), expected)

    def test_backfills_schema_three_and_rebuilds_after_portable_restore(self):
        self.seed_cooldown()
        expected = self.s.action('company-avoid', {})
        self.assertEqual(len(expected['companies']), 1)
        path = self.w.path
        before = self.w.read()
        manifest = (path / 'state.json').read_bytes()
        self.w.close()
        with closing(sqlite3.connect(path / DATABASE)) as database, database:
            database.execute('DROP TABLE agent_queue')
            database.execute('DROP TABLE employer_submissions')
            database.execute('PRAGMA user_version = 3')

        with patch.object(SQLiteState, 'save_employer_submissions', side_effect=sqlite3.OperationalError):
            with self.assertRaisesRegex(ValueError, 'database change could not be saved'):
                store.Workspace(path, create=False)
        with closing(sqlite3.connect(path / DATABASE)) as database:
            self.assertEqual(database.execute('PRAGMA user_version').fetchone(), (3,))
            self.assertIsNone(database.execute(
                "SELECT name FROM sqlite_schema WHERE name = 'employer_submissions'"
            ).fetchone())

        cli = [sys.executable, '-m', 'employment_agency', '--workspace', str(path), 'action', 'company-avoid']
        self.assertEqual(json.loads(subprocess.check_output(cli, input=b'{}')), expected)
        self.w = store.Workspace(path, create=False)
        self.s = Service(self.w)
        self.assertEqual(self.w.database.connection.execute('PRAGMA user_version').fetchone(), (DATABASE_VERSION,))
        self.assertEqual(self.w.read(), before)
        self.assertEqual((path / 'state.json').read_bytes(), manifest)

        backup = self.w.export(self.root / 'backup.zip')
        for name, restore, source in (
            ('zip', store.restore, backup), ('snapshot', store.restore_snapshot, path),
        ):
            with self.subTest(source=name):
                destination = self.root / name
                restore(source, destination)
                restored = store.Workspace(destination, create=False)
                try:
                    self.assertEqual(Service(restored).action('company-avoid', {}), {
                        **expected, 'workspace': str(restored.path),
                    })
                finally:
                    restored.close()

    def test_local_get_returns_the_selected_workspace_without_loading_full_state(self):
        self.seed_cooldown()
        expected = self.s.action('company-avoid', {})
        http = server(self.s, 0)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{http.server_port}/api/company-avoid'
        try:
            with patch.object(self.w, 'read', side_effect=AssertionError('Full workspace read')):
                with urlopen(url, timeout=5) as response:
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    self.assertEqual(json.load(response), {'result': expected})
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(url, headers={'Host': 'unrelated.example.test'}), timeout=5)
                self.assertEqual(error.exception.code, 403)
                error.exception.close()
        finally:
            http.shutdown()
            http.server_close()
            thread.join()
