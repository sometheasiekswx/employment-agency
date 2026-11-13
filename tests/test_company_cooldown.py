"""Company policy through ordinary service entry points and controlled transports."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
import unittest
from unittest.mock import patch

from employment_agency import companies
from employment_agency.application_delivery import Delivery
from employment_agency.service import Service
from employment_agency.store import Workspace, restore
import test_application_delivery
import test_workflow


class CompanyCooldown(unittest.TestCase):
    seed = test_workflow.Workflow.seed
    start = test_application_delivery.ApplicationDelivery.start
    approve = test_application_delivery.ApplicationDelivery.approve

    def setUp(self):
        test_workflow.Workflow.setUp(self)
        self.w.close()
        self.w = Workspace(self.root / 'sqlite', sqlite=True)
        self.s = Service(self.w)
        _, self.profile, original = self.seed()
        self.job = self.s.action('job', {**original, 'url': 'https://employer.example.test/role-1'})
        self.source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
        link = self.s.action('company-map', {'job_id': self.job['id'], 'confirmed': True,
                                             'source_id': self.source['id'], 'requisition': 'first'})
        self.employer = link['employer_id']

    def tearDown(self):
        if self.s.delivery:
            self.s.delivery.close()
        test_workflow.Workflow.tearDown(self)

    def role(self, suffix, requisition=None):
        job = self.s.action('job', {**self.job, 'id': None, 'url': f'https://employer.example.test/role-{suffix}'})
        args = {'job_id': job['id'], 'confirmed': True, 'employer_id': self.employer}
        if requisition:
            args['requisition'] = requisition
        self.s.action('company-map', args)
        return job

    def draft(self, job):
        return self.s.action('local-package', {'job_id': job['id'], 'profile_id': self.profile['id']})

    def submit(self, job, date):
        app = self.draft(job)
        return self.s.action('review', {'id': app['id'], 'status': 'submitted', 'occurred_at': date})

    def preview(self, job):
        return self.s.action('company-submission-review', {'application_id': self.draft(job)['id']})

    def reserve(self, approval):
        return self.s.action('company-submission-reserve', {
            'id': approval['id'], 'application_id': approval['binding']['application_id'],
            'fingerprint': approval['fingerprint'], 'approved': True,
        })

    def company(self):
        return self.s.action('company-roles', {'job_id': self.job['id'], 'profile_id': self.profile['id']})

    def test_two_distinct_vacancies_pause_search_until_calendar_deadline(self):
        second, third = self.role(2), self.role(3)
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            self.submit(self.job, '2026-01-10T15:00:00+00:00')
            self.assertEqual(self.company()['status']['remaining'], 1)
            self.submit(second, '2026-01-31')
            status = self.company()['status']
            self.assertTrue(status['cooling'])
            self.assertEqual(status['cooldown_until'], '2026-04-30T00:00:00+00:00')
            self.assertEqual(self.s.action('rank', {'profile_id': self.profile['id']}), [])
            with patch('employment_agency.service.sources.discover') as fetch:
                self.assertEqual(self.s.action('discover', {'id': self.source['id']})['skipped'], 'Company is paused')
                duplicate = self.s.action('source', {'kind': 'greenhouse', 'board': 'fixture'})
                self.assertEqual(self.s.action('discover', {'id': duplicate['id']})['skipped'], 'Company is paused')
                fetch.assert_not_called()
            with patch('employment_agency.service.sources.url_job') as fetch:
                with self.assertRaisesRegex(ValueError, 'Company is paused'):
                    self.s.action('url', {'url': third['url']})
                fetch.assert_not_called()
            with self.assertRaisesRegex(ValueError, 'paused'):
                self.preview(third)
            backup = self.w.export(self.root / 'pause.zip')
            restored = self.root / 'paused-copy'
            restore(backup, restored)
            copy = Workspace(restored)
            try:
                self.assertTrue(companies.job_status(copy.read(), third['id'])['cooling'])
            finally:
                copy.close()
        with patch.object(companies, 'clock', return_value=datetime(2026, 5, 1, tzinfo=timezone.utc)):
            self.assertEqual(self.company()['status']['remaining'], 2)
            self.assertIn(third['id'], {row['job']['id'] for row in self.company()['roles']})
            self.assertEqual(len(self.w.read()['applications']), 3)

    def test_aliases_duplicate_requisitions_and_concurrent_last_slot(self):
        alternate, second, third = self.role('alias', 'first'), self.role(2), self.role(3)
        roles = self.company()['roles']
        self.assertEqual(len(roles), 3)
        self.submit(self.job, '2026-01-10')
        with self.assertRaisesRegex(ValueError, 'already recorded'):
            self.preview(alternate)
        approvals = [self.preview(job) for job in (second, third)]
        gate = Barrier(2)

        def compete(approval):
            gate.wait()
            try:
                return self.reserve(approval)
            except ValueError as error:
                return str(error)

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(compete, approvals))
        accepted = [record for record in results if isinstance(record, dict)]
        self.assertEqual(len(accepted), 1)
        self.assertIn('Both application slots are in use at this company', results)
        winner = next(item for item in approvals if item['id'] == accepted[0]['id'])
        self.assertEqual(self.reserve(winner)['id'], accepted[0]['id'])
        self.assertEqual(self.company()['status']['remaining'], 0)

    def test_adjustable_cooldown_recomputes_from_submission_history_and_persists(self):
        second = self.role(2)
        self.assertEqual(self.s.state()['_workspace']['company_cooldown_months'], 3)
        with patch.object(companies, 'clock', return_value=datetime(2026, 5, 1, tzinfo=timezone.utc)):
            self.submit(self.job, '2026-01-10')
            self.submit(second, '2026-01-31')
            self.assertFalse(self.company()['status']['cooling'])

            for months in (None, True, '4', 1.5, 0, 25):
                with self.subTest(months=months), self.assertRaisesRegex(ValueError, 'whole months'):
                    self.s.action('company-cooldown-settings', {'months': months})
            self.assertEqual(self.s.state()['_workspace']['company_cooldown_months'], 3)

            self.s.action('company-cooldown-settings', {'months': 4})
            self.assertTrue(self.company()['status']['cooling'])
            self.assertEqual(self.company()['status']['cooldown_until'], '2026-05-31T00:00:00+00:00')

            backup = self.w.export(self.root / 'cooldown.zip')
            destination = self.root / 'cooldown-copy'
            restore(backup, destination)
            restored = Workspace(destination)
            try:
                service = Service(restored)
                self.assertEqual(service.state()['_workspace']['company_cooldown_months'], 4)
                self.assertEqual(service.action('company-roles', {'job_id': self.job['id']})[
                    'status']['cooldown_until'], '2026-05-31T00:00:00+00:00')
            finally:
                restored.close()

            self.s.action('company-cooldown-settings', {'months': 2})
            self.assertFalse(self.company()['status']['cooling'])
            self.assertEqual(self.company()['status']['remaining'], 2)

    def test_fake_delivery_timeout_holds_slot_across_reopen_and_verified_release(self):
        second, third = self.role(2), self.role(3)
        self.submit(self.job, '2026-01-10')
        self.mail = test_application_delivery.Mail()
        self.mail.fail = True
        self.s.delivery = Delivery(self.s, mail=self.mail)
        attempt = self.approve(self.start(self.draft(second)))
        self.assertEqual(attempt['status'], 'unknown')
        self.assertEqual(len(self.mail.messages), 1)
        self.s.delivery.close()
        root = self.w.path
        self.w.close()
        self.w = Workspace(root)
        self.s = Service(self.w)
        self.s.delivery = Delivery(self.s, mail=self.mail)
        with self.assertRaisesRegex(ValueError, 'slots are in use'):
            self.preview(third)
        self.s.action('apply-resolve', {'id': attempt['id'], 'outcome': 'not_sent',
                                        'evidence': 'Verified no message was sent in the fixture.'})
        self.assertEqual(self.company()['status']['remaining'], 1)
        self.assertEqual(len(self.mail.messages), 1)

    def test_confirmed_fake_delivery_records_once_and_starts_pause(self):
        second = self.role(2)
        self.submit(self.job, '2026-01-10')
        self.mail = test_application_delivery.Mail()
        self.s.delivery = Delivery(self.s, mail=self.mail)
        draft = self.draft(second)
        attempt = self.approve(self.start(draft))
        self.assertEqual(attempt['status'], 'confirmed')
        self.assertTrue(attempt['dispatched_at'])
        self.assertEqual(self.approve(attempt)['id'], attempt['id'])
        self.assertEqual(len(self.mail.messages), 1)
        self.assertTrue(self.company()['status']['cooling'])
        self.assertEqual(self.w.read()['applications'][-1]['status'], 'submitted')

    def test_manual_handoff_records_verified_outcome_with_original_date(self):
        second = self.role(2)
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            self.submit(self.job, '2026-01-10')
            approval = self.preview(second)
            reserved = self.reserve(approval)
            outcome = self.s.action('company-submission-resolve', {
                'id': reserved['id'], 'outcome': 'confirmed', 'confirmed': True,
                'evidence': 'Fictional employer receipt', 'occurred_at': '2026-01-30',
            })
            self.assertEqual(outcome['status'], 'confirmed')
            self.assertEqual(self.company()['status']['cooldown_until'], '2026-04-30T00:00:00+00:00')

    def test_manual_handoff_rejects_documents_prepared_for_a_changed_listing(self):
        draft = self.draft(self.job)
        self.s.action('job', {**self.job, 'url': 'https://employer.example.test/different-role'})
        with self.assertRaisesRegex(ValueError, 'different listing'):
            self.s.action('company-submission-review', {'application_id': draft['id']})

    def test_unconfirmed_employer_shows_historical_candidates_before_counting(self):
        self.submit(self.job, '2026-01-10')
        unlinked = self.s.action('job', {**self.job, 'id': None, 'url': 'https://employer.example.test/fresh-role'})
        with self.w.edit() as state:
            state['employer_links'] = []
            state['employers'] = []
            state['company_rounds'] = []
        status = self.s.action('company-roles', {'job_id': unlinked['id']})['status']
        self.assertEqual(status['remaining'], 0)
        self.assertTrue(status['review_needed'])
        self.assertIn(self.job['id'], [item['job_id'] for item in status['unresolved']])

    def test_paused_company_alias_filters_unlinked_listings_from_discovery(self):
        second = self.role(2)
        unlinked = self.s.action('job', {**self.job, 'id': None, 'url': 'https://employer.example.test/fresh-role'})
        self.s.action('save-job', {'id': unlinked['id'], 'saved': True})
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            self.submit(self.job, '2026-01-10')
            self.submit(second, '2026-01-30')
            self.assertEqual(self.s.action('rank', {'profile_id': self.profile['id']}), [])
            listing = next(job for job in self.s.state()['jobs'] if job['id'] == unlinked['id'])
            self.assertTrue(listing['saved'] and listing['company']['cooling'])

    def test_changed_browser_form_can_be_reviewed_again_in_sqlite(self):
        job = self.s.action('job', {**self.job, 'url': 'https://www.linkedin.com/jobs/view/123456/'})
        self.mail = test_application_delivery.Mail()
        browser = test_application_delivery.Browser()
        self.s.delivery = Delivery(self.s, mail=self.mail, browser_factory=lambda: browser)
        attempt = self.start(self.draft(job), 'linkedin')
        browser.changed = True
        self.assertEqual(self.approve(attempt)['status'], 'needs_user')
        browser.changed = False
        self.s.action('apply-resume', {'id': attempt['id']})
        self.s.delivery.commands.join()
        self.assertEqual(self.approve(self.s.delivery.get(attempt['id']))['status'], 'confirmed')
        self.assertEqual(browser.clicked, 1)
