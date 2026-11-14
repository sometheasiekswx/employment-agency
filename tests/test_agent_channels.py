"""Connected channel ordering and Chrome's exact, scoped website form behavior."""

from unittest import TestCase, skipUnless
from unittest.mock import patch

from employment_agency import packages
from employment_agency.agent_website import Help, Unavailable, chrome_available
import agent_fixture as fixture
import test_agent_execution as execution


class ChannelTests(execution.AgentTestWorkspace):
    def test_verified_website_failure_uses_telegram_and_stops(self):
        fixture.destination(self.service, self.job, 'telegram', fixture.TELEGRAM)
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL)
        self.site.before = lambda: (_ for _ in ()).throw(Unavailable('Fixture 410'))
        run = self.start()
        result = self.status(run, {'submitted'})
        self.assertEqual(result['channel'], 'telegram')
        self.assertEqual(result['receipt']['sender'], 'fictional_user')
        self.assertEqual(result['receipt']['recipient'], fixture.TELEGRAM)
        self.assertFalse(self.mail.messages)
        attempts = self.service.w.read()['submission_attempts']
        self.assertEqual([(row['channel'], row['status']) for row in attempts], [('website', 'not_sent'), ('telegram', 'confirmed')])

    def test_verified_website_failure_with_unavailable_telegram_uses_email(self):
        fixture.destination(self.service, self.job, 'telegram', fixture.TELEGRAM)
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL)
        self.site.before = lambda: (_ for _ in ()).throw(Unavailable('Fixture 404'))
        with patch.object(self.telegram, 'readiness', return_value={'available': False, 'reason': 'No Telegram session'}):
            run = self.start()
            result = self.status(run, {'submitted'})
        self.assertEqual(result['channel'], 'email')
        self.assertEqual(result['receipt']['message_id'], 'fictional-gmail-id')
        self.assertEqual(len(self.mail.messages), 1)
        app = self.service.w.read()['applications'][0]
        docs = list(self.mail.messages[0].iter_attachments())
        for role, document in zip(('resume.pdf', 'cover-letter.pdf'), docs, strict=True):
            self.assertEqual(document.get_payload(decode=True), packages.path_for(self.service.w.path, app, role).read_bytes())
        self.assertFalse(self.telegram.messages)

    def test_sender_change_is_not_an_authorized_fallback(self):
        fixture.destination(self.service, self.job, 'telegram', fixture.TELEGRAM)
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL)

        def changed():
            self.telegram.account = 'different_user'
            raise Unavailable('Fixture 404')

        self.site.before = changed
        run = self.start()
        result = self.status(run, {'needs_help'})
        self.assertIn('sender changed', result['message'])
        self.assertFalse(self.telegram.messages or self.mail.messages)

    def test_wrong_telegram_receipt_never_triggers_email(self):
        fixture.destination(self.service, self.job, 'telegram', fixture.TELEGRAM, required=True)
        fixture.destination(self.service, self.job, 'email', fixture.EMAIL, required=True)
        original = self.telegram.send

        def wrong(*args, **kwargs):
            return {**original(*args, **kwargs), 'recipient': 'https://t.me/somebodyelse'}

        with patch.object(self.telegram, 'send', side_effect=wrong):
            run = self.start()
            self.status(run, {'uncertain'})
        self.assertEqual(len(self.telegram.messages), 1)
        self.assertFalse(self.mail.messages or self.site.requests)


@skipUnless(chrome_available(), 'Optional local Playwright Chrome required')
class BrowserFormTests(TestCase):
    def documents(self):
        return {
            'resume.pdf': {'role': 'resume.pdf', 'filename': 'Fictional-CV.pdf', 'sha256': 'cv', 'data': b'fictional CV'},
            'cover-letter.pdf': {'role': 'cover-letter.pdf', 'filename': 'Fictional-Cover.pdf', 'sha256': 'cl', 'data': b'fictional cover'},
        }

    def apply(self, website, *, ask=None, cover_required=True):
        dispatches = []
        receipt = website.submit(fixture.TARGET, self.documents(), {'email': 'alex@example.test'},
                                 lambda: [{'field': 'framework', 'question': 'Favorite test framework', 'value': 'unittest'}],
                                 before_dispatch=dispatches.append, after_step=lambda: None,
                                 ask=ask or (lambda question: self.fail(str(question))), stop=lambda: False,
                                 cover_required=cover_required)
        return receipt, dispatches

    def test_one_step_posts_bytes_and_observes_receipt(self):
        with fixture.site() as (website, posts, hits):
            receipt, dispatches = self.apply(website)
        self.assertEqual(receipt['url'], fixture.TARGET)
        self.assertEqual(len(dispatches), 1)
        self.assertEqual(hits, [('GET', '/apply'), ('POST', '/apply')])
        self.assertEqual(posts[0], {'csrf_token': b'fixture-csrf', 'email': b'alex@example.test',
                                    'framework': b'unittest', 'cv': b'fictional CV', 'letter': b'fictional cover'})

    def test_multi_step_generic_thanks_never_finishes_the_first_step(self):
        middle = fixture.FORM.replace(b'Fictional Systems application</h1>', b'Thank you for applying</h1>')
        with fixture.site(forms=(fixture.NEXT, middle)) as (website, posts, _):
            receipt, dispatches = self.apply(website)
        self.assertEqual(receipt['confirmation'], 'Application submitted')
        self.assertEqual([row['kind'] for row in dispatches], ['continue', 'submit'])
        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[0], b'email=alex%40example.test')
        self.assertEqual(posts[1]['cv'], b'fictional CV')

    def test_cross_endpoint_stored_cv_and_hidden_unverified_answer_are_rejected(self):
        fixtures = (
            (fixture.FORM.replace(b'<form method=', b'<form action="https://other.example.test/apply" method='), 'changes the verified destination'),
            (fixture.FORM.replace(b'<form method=', b'<form action="/wrong-role" method='), 'changes the verified destination'),
            (fixture.FORM.replace(b'<button type=', b'<input type="radio" name="cv_choice" aria-label="Stored generic.pdf" checked><button type='), 'stored document'),
            (fixture.FORM.replace(b'<button type=', b'<input type="hidden" name="work_rights" value="true"><button type='), 'hidden field'),
            (fixture.FORM.replace(b'<button type=', b'<input type="hidden" name="vacancy_id" value="wrong-vacancy"><button type='), 'separate vacancy identifier'),
        )
        for body, error in fixtures:
            with self.subTest(error=error), fixture.site(forms=(body,)) as (website, posts, _):
                with self.assertRaisesRegex(Help, error):
                    self.apply(website)
                self.assertEqual(posts, [])

    def test_404_and_missing_final_confirmation_are_distinct(self):
        with fixture.site(status=404) as (website, posts, _):
            with self.assertRaisesRegex(Unavailable, '404'):
                self.apply(website)
            self.assertEqual(posts, [])
        with fixture.site(reply=b'<h1>Try again later</h1>') as (website, posts, _):
            with self.assertRaisesRegex(Help, 'no submission confirmation'):
                self.apply(website)
            self.assertEqual(len(posts), 1)

    def test_conditional_or_negative_heading_is_not_a_submission_receipt(self):
        for reply in (
            b'<h1>If your application was submitted, you will receive a message</h1>',
            b'<h1>Could not verify that your application was submitted</h1>',
            b'<h1>Application received an error</h1>',
        ):
            with self.subTest(reply=reply), fixture.site(reply=reply) as (website, posts, _):
                with self.assertRaisesRegex(Help, 'no submission confirmation'):
                    self.apply(website)
                self.assertEqual(len(posts), 1)

    def test_preexisting_success_heading_is_not_a_new_receipt(self):
        receipt_heading = b'<h1>Application submitted</h1>'
        stale = fixture.FORM.replace(b'<h1>Fictional Systems application</h1>', receipt_heading)
        with fixture.site(forms=(stale,), reply=receipt_heading + b'<p>Try again later</p>') as (website, posts, _):
            with self.assertRaisesRegex(Help, 'no submission confirmation'):
                self.apply(website)
            self.assertEqual(len(posts), 1)

    def test_confirmation_with_visible_error_is_uncertain(self):
        reply = b'<h1>Thank you for applying</h1><p role="alert">Document upload could not be completed.</p>'
        with fixture.site(reply=reply) as (website, posts, _):
            with self.assertRaisesRegex(Help, 'no submission confirmation'):
                self.apply(website)
            self.assertEqual(len(posts), 1)
