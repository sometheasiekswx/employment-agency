import email
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

import test_workflow
from employment_agency.application_delivery import Delivery
from employment_agency.linkedin_apply import NeedsUser, linkedin_url
from employment_agency.store import restore, Workspace


class Mail:
    def __init__(self):
        self.messages = []
        self.fail = False
        self.account = 'alex@example.test'

    def sender(self):
        return self.account

    def send(self, raw):
        self.messages.append(raw)
        if self.fail:
            raise TimeoutError('Ambiguous transport')
        return {'provider': 'gmail', 'message_id': 'controlled-message-1'}


class Browser:
    def __init__(self):
        self.clicked = 0
        self.changed = False
        self.pause = False
        self.received = None

    def open(self, url):
        self.url = url

    def prepare(self, payload, resume, cover=None):
        self.received = resume.read_bytes()
        if self.pause:
            raise NeedsUser('Complete required work-rights question yourself')
        from employment_agency.store import digest
        return {'filename': resume.name, 'answers': 'verified', 'upload_sha256': digest(self.received),
                'cover_letter_sha256': digest(cover.read_bytes()) if cover else ''}

    def submit(self, expected, resume):
        if self.changed:
            raise NeedsUser('Form changed since approval')
        self.clicked += 1
        assert resume.read_bytes() == self.received
        return {'provider': 'linkedin', 'confirmation': 'Application sent'}

    def close(self):
        pass


class ApplicationDelivery(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    seed = test_workflow.Workflow.seed

    def tearDown(self):
        if self.s.delivery:
            self.s.delivery.close()
        test_workflow.Workflow.tearDown(self)

    def setup_delivery(self, linkedin=False):
        f, profile, job = self.seed()
        if linkedin:
            job['url'] = 'https://www.linkedin.com/jobs/view/123456/'
            job = self.s.action('job', job)
        app = self.s.action('local-package', {'profile_id': profile['id'], 'job_id': job['id']})
        self.mail, self.browser = Mail(), Browser()
        self.s.delivery = Delivery(self.s, mail=self.mail, browser_factory=lambda: self.browser)
        return app, profile, job

    def start(self, app, channel='gmail'):
        result = self.s.action('apply-start', {'application_id': app['id'], 'channel': channel,
            'subject': 'Software engineer application', 'body': 'Please review my tailored résumé.',
            'disclosure_confirmed': True})
        self.s.delivery.commands.join()
        return self.s.action('apply-get', {'id': result['id']})

    def approve(self, attempt):
        self.s.action('apply-approve', {'id': attempt['id'], 'fingerprint': attempt['fingerprint'], 'approved': True})
        self.s.delivery.commands.join()
        return self.s.delivery.get(attempt['id'])

    def test_email_requires_exact_approval_and_sends_exact_custom_resume(self):
        app, _, _ = self.setup_delivery()
        from employment_agency import packages
        original = packages.path_for(self.w.path, app, 'resume.pdf').read_bytes()
        attempt = self.start(app)
        self.assertEqual(attempt['status'], 'awaiting_approval')
        self.assertEqual(self.mail.messages, [])
        with self.assertRaises(ValueError):
            self.s.action('apply-approve', {'id': attempt['id'], 'fingerprint': 'wrong', 'approved': True})
        result = self.approve(attempt)
        self.assertEqual(result['status'], 'confirmed')
        message = email.message_from_bytes(self.mail.messages[0], policy=email.policy.default)
        self.assertEqual(message['To'], 'jobs@example.test')
        self.assertEqual(next(message.iter_attachments()).get_payload(decode=True), original)
        self.assertEqual(self.w.read()['applications'][0]['status'], 'submitted')
        self.assertEqual(packages.path_for(self.w.path, app, 'resume.pdf').read_bytes(), original)
        self.assertEqual(len(self.mail.messages), 1)
        with self.assertRaises(ValueError): self.approve(attempt)

    def test_double_click_and_uncertain_send_cannot_duplicate(self):
        app, _, _ = self.setup_delivery()
        attempt = self.start(app)
        with self.assertRaises(ValueError): self.start(app)
        self.mail.fail = True
        result = self.approve(attempt)
        self.assertEqual(result['status'], 'unknown')
        with self.assertRaises(ValueError): self.start(app)
        with self.assertRaises(ValueError): self.s.action('apply-cancel', {'id': attempt['id']})
        self.assertEqual(self.w.read()['applications'][0]['status'], 'draft')
        self.s.action('apply-resolve', {'id': attempt['id'], 'outcome': 'confirmed', 'evidence': 'Verified message in Gmail Sent folder'})
        self.assertEqual(len(self.mail.messages), 1)
        self.assertEqual(self.w.read()['applications'][0]['status'], 'submitted')

    def test_changed_resume_and_changed_mail_account_invalidate_approval(self):
        app, _, _ = self.setup_delivery()
        attempt = self.start(app)
        from employment_agency import packages
        path = packages.path_for(self.w.path, app, 'resume.pdf')
        original = path.read_bytes(); path.write_bytes(b'wrong resume')
        with self.assertRaises(ValueError): self.approve(attempt)
        path.write_bytes(original)
        self.mail.account = 'other@example.test'
        result = self.approve(attempt)
        self.assertEqual(result['status'], 'needs_user')
        self.assertEqual(self.mail.messages, [])

    def test_edited_payload_does_not_reuse_prior_approval(self):
        app, _, _ = self.setup_delivery()
        attempt = self.start(app)
        changed = self.s.delivery.get(attempt['id']);changed['payload']['to'] = 'other@example.test';self.s.delivery.update(changed)
        self.assertEqual(self.approve(attempt)['status'], 'needs_user')
        self.assertEqual(self.mail.messages, [])

    def test_browser_pauses_and_requires_new_review_then_submits_one_file(self):
        app, _, _ = self.setup_delivery(linkedin=True)
        self.browser.pause = True
        attempt = self.start(app, 'linkedin')
        self.assertEqual(attempt['status'], 'needs_user')
        self.browser.pause = False
        self.s.action('apply-resume', {'id': attempt['id']}); self.s.delivery.commands.join()
        attempt = self.s.delivery.get(attempt['id'])
        self.assertEqual(attempt['status'], 'awaiting_approval')
        self.browser.changed = True
        self.assertEqual(self.approve(attempt)['status'], 'needs_user')
        self.assertEqual(self.browser.clicked, 0)
        self.browser.changed = False
        self.s.action('apply-resume', {'id': attempt['id']});self.s.delivery.commands.join()
        result = self.approve(self.s.delivery.get(attempt['id']))
        self.assertEqual(result['status'], 'confirmed')
        self.assertEqual(self.browser.clicked, 1)
        self.assertTrue(self.browser.received.startswith(b'%PDF'))

    def test_cancel_and_restore_never_replay(self):
        app, _, _ = self.setup_delivery()
        attempt = self.start(app)
        self.s.action('apply-cancel', {'id': attempt['id']});self.s.delivery.commands.join()
        with self.assertRaises(ValueError): self.approve(attempt)
        record = self.s.delivery.get(attempt['id']);self.s.delivery.update(record, status='executing')
        archive = self.w.export(self.root / 'attempt.zip');restore(archive, self.root / 'restored')
        copy = Workspace(self.root / 'restored')
        try:
            from employment_agency.service import Service
            reopened = Delivery(Service(copy), mail=self.mail)
            self.assertEqual(reopened.get(attempt['id'])['status'], 'unknown')
            self.assertIsNone(reopened.thread)
            self.assertEqual(self.mail.messages, [])
        finally: copy.close()

    def test_demo_and_non_linkedin_destination_are_rejected(self):
        app, _, _ = self.setup_delivery()
        with self.assertRaises(ValueError): self.start(app, 'linkedin')
        self.s.action('workspace-settings', {'demo': True})
        with self.assertRaisesRegex(ValueError, 'demo'): self.start(app)
        for value in ['http://www.linkedin.com/jobs/view/1', 'https://www.linkedin.com.evil.test/jobs/view/1',
                      'https://www.linkedin.com/jobs/view/1/../../feed', 'https://localhost/jobs/view/1', 'https://user@linkedin.com/jobs/view/1']:
            with self.assertRaises(ValueError): linkedin_url(value)

    def test_codex_selection_uses_existing_validator(self):
        app, profile, _ = self.setup_delivery()
        self.s.action('consent', {'provider': 'agent', 'grant': True, 'purpose': 'select_application_facts', 'categories': ['confirmed_facts', 'job_description']})
        self.s.delivery.selector = lambda handoff: {'fact_ids': ['invented-fact']}
        with self.assertRaises(ValueError): self.s.action('apply-tailor', {'application_id': app['id'], 'profile_id': profile['id']})
        self.assertEqual(len(self.w.read()['applications']), 1)

    def test_custom_cover_letter_is_always_bound_and_attached(self):
        app, _, _ = self.setup_delivery()
        attempt = self.s.action('apply-start', {'application_id': app['id'], 'channel': 'gmail',
            'subject': 'Application', 'body': 'Controlled message', 'disclosure_confirmed': True, 'include_cover_letter': False})
        self.s.delivery.commands.join()
        attempt = self.s.delivery.get(attempt['id'])
        self.assertIn('cover_letter', attempt['binding'])
        self.approve(attempt)
        message = email.message_from_bytes(self.mail.messages[0], policy=email.policy.default)
        attachments = list(message.iter_attachments())
        self.assertEqual(len(attachments), 2)
        from employment_agency import packages
        self.assertEqual(attachments[1].get_payload(decode=True), packages.path_for(self.w.path, app, 'cover-letter.pdf').read_bytes())

    def test_changed_listing_requires_a_new_tailored_version(self):
        app, _, job = self.setup_delivery()
        attempt = self.start(app)
        self.s.action('job', {**job, 'description': 'A changed role requiring different work'})
        with self.assertRaises(ValueError): self.approve(attempt)
        self.assertEqual(self.mail.messages, [])

    def test_changed_career_fact_invalidates_an_existing_resume(self):
        app, _, _ = self.setup_delivery()
        attempt = self.start(app)
        fact = self.w.read()['facts'][0]
        self.s.action('fact', {'id': fact['id'], 'text': 'A different unconfirmed experience statement'})
        with self.assertRaises(ValueError): self.approve(attempt)
        self.assertEqual(self.mail.messages, [])

    def test_utf8_evidence_and_journal_survive_a_windows_default_encoding(self):
        app, _, _ = self.setup_delivery()
        read_text = Path.read_text

        def windows_default(path, encoding=None, **kwargs):
            return read_text(path, encoding=encoding or 'cp1252', **kwargs)

        with patch.object(Path, 'read_text', windows_default):
            # The seed includes en-dash dates; the message includes accented text.
            attempt = self.start(app)
            self.assertEqual(attempt['payload']['body'], 'Please review my tailored résumé.')
            self.assertEqual(self.s.delivery.records()[0]['payload'], attempt['payload'])
            self.assertEqual(self.approve(attempt)['status'], 'confirmed')
        message = email.message_from_bytes(self.mail.messages[0], policy=email.policy.default)
        self.assertIn('résumé', message.get_body(preferencelist=('plain',)).get_content())

    def test_an_uncertain_browser_is_never_reused_for_a_different_job(self):
        app, profile, job = self.setup_delivery(linkedin=True)
        attempt = self.start(app, 'linkedin')
        def uncertain(*args): raise TimeoutError('No reliable receipt')
        self.browser.submit = uncertain
        self.assertEqual(self.approve(attempt)['status'], 'unknown')
        other_job = self.s.action('job', {**job, 'id': '', 'url': 'https://www.linkedin.com/jobs/view/654321/', 'title': 'Another Engineer'})
        other_app = self.s.action('local-package', {'job_id': other_job['id'], 'profile_id': profile['id']})
        new_browser = Browser()
        self.s.delivery.browser_factory = lambda: new_browser
        second = self.start(other_app, 'linkedin')
        self.assertEqual(new_browser.url, other_job['url'])
        self.assertEqual(self.s.delivery.browser_attempt, second['id'])
        self.assertEqual(self.approve(second)['status'], 'confirmed')
        self.assertEqual(new_browser.clicked, 1)

    def test_codex_rejects_api_billing_before_a_model_request(self):
        from employment_agency.delivery_connections import codex_select
        from subprocess import CompletedProcess
        with patch('shutil.which', return_value='/fixture/codex'), patch('subprocess.run', return_value=CompletedProcess([], 0, '', 'Logged in using an API key')) as run:
            with self.assertRaisesRegex(ValueError, 'billing'):
                codex_select({'job': {}, 'facts': []})
            self.assertEqual(run.call_count, 1)

    def test_disclosure_header_injection_and_submitted_job_guard(self):
        app, _, _ = self.setup_delivery()
        with self.assertRaises(ValueError):self.s.action('apply-start', {'application_id':app['id'], 'channel':'gmail'})
        with self.assertRaises(ValueError):self.s.action('apply-start', {'application_id':app['id'], 'channel':'gmail', 'disclosure_confirmed':True,
            'to':'jobs@example.test\r\nBcc: thief@example.test','subject':'Test','body':'Test'})
        self.s.action('review', {'id':app['id'], 'status':'submitted'})
        with self.assertRaises(ValueError):self.start(app)
