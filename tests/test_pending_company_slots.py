"""The company allowance governs pending intent and actual application starts."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from threading import Barrier, Event, Thread
from unittest import TestCase
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from employment_agency import companies, packages, sources, store
from employment_agency.application_delivery import Delivery
from employment_agency.server import server
import test_application_journey
from test_application_delivery import Browser, Mail


class PendingCompanySlots(TestCase):
    setUp = test_application_journey.ApplicationJourney.setUp
    tearDown = test_application_journey.ApplicationJourney.tearDown
    seed = test_application_journey.ApplicationJourney.seed
    role = test_application_journey.ApplicationJourney.role
    map = test_application_journey.ApplicationJourney.map
    draft = test_application_journey.ApplicationJourney.draft
    start = test_application_journey.ApplicationJourney.start
    report = test_application_journey.ApplicationJourney.report
    context = test_application_journey.ApplicationJourney.context

    def choice(self, job, saved=True):
        return self.s.action('save-job', {'id': job['id'], 'saved': saved})

    def alias_opt_in(self, job_id):
        company = self.s.action('company-roles', {'job_id': job_id})
        return {'record_alias': True, 'published_alias': company['published_alias'],
                'published_alias_proof': company['published_alias_proof']}

    def same_company_roles(self):
        employer_id = self.map(requisition='first')['employer_id']
        second, third = self.role('second'), self.role('third')
        for job in (second, third):
            self.map(job, employer_id=employer_id)
        return second, third

    def test_pending_roles_occupy_two_slots_and_progress_under_the_same_allowance(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        self.choice(second)
        projected = companies.by_id(self.s.state()['jobs'], third['id'])
        self.assertEqual(projected['pending_blocker']['code'], 'company_slots_used')
        self.assertEqual(projected['company']['pending_only_count'], 2)
        self.assertEqual(self.context()['allowance']['remaining'], 0)
        self.assertFalse(self.s.action('company-avoid', {})['companies'])
        with self.assertRaisesRegex(ValueError, 'Both application slots'):
            self.choice(third)
        third_draft = self.draft(third)
        with self.assertRaisesRegex(ValueError, 'Both application slots'):
            self.start(third_draft)
        first_draft = self.draft()
        attempt = self.start(first_draft)
        projected = companies.by_id(self.s.state()['jobs'], third['id'])
        self.assertEqual(projected['company']['pending_only_count'], 1)
        self.choice(self.job, False)
        with self.assertRaisesRegex(ValueError, 'Both application slots'):
            self.choice(third)
        self.report(attempt, outcome='not_sent', evidence='No application was submitted.')
        self.choice(third)
        self.assertEqual({row['role_id'] for row in self.s.action('agent-queue', {})['rows']},
                         {second['id'], third['id']})

    def test_simultaneous_last_slot_choices_and_removed_restore(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        gate = Barrier(2)

        def choose(job):
            gate.wait()
            try:
                self.choice(job)
            except ValueError:
                return False
            return True

        with ThreadPoolExecutor(2) as executor:
            results = list(executor.map(choose, [second, third]))
        self.assertEqual(results.count(True), 1)
        winner, other = (second, third) if results[0] else (third, second)
        event = store.uid()
        self.s.action('remove-job', {'id': winner['id'], 'removal_id': event})
        self.choice(other)
        with self.assertRaisesRegex(ValueError, 'Narrow To apply'):
            self.s.action('restore-job', {'id': winner['id'], 'removal_id': event})
        self.assertFalse(companies.by_id(self.w.read()['jobs'], winner['id'])['removals'][-1].get('restored_at'))
        self.choice(other, False)
        self.s.action('restore-job', {'id': winner['id'], 'removal_id': event})
        self.assertEqual(self.s.action('agent-queue', {})['total'], 2)

    def test_preserved_overflow_blocks_the_company_until_choices_are_narrowed(self):
        second, third = self.same_company_roles()
        with self.w.edit() as state:
            for job in state['jobs']:
                job['saved'] = True
        self.assertEqual(self.s.action('agent-queue', {})['total'], 3)
        self.assertTrue(self.context()['allowance']['overflow'])
        self.assertIn('company_queue_overflow', {blocker['code'] for blocker in self.context()['blockers']})
        draft = self.draft()
        with self.assertRaisesRegex(ValueError, 'Narrow To apply'):
            self.start(draft)
        refused = self.s.action('application-handoff', {'all_pending': True})
        self.assertEqual(set(refused['job_ids']), {self.job['id'], second['id'], third['id']})
        self.assertIsNone(refused['text'])
        self.choice(third, False)
        self.assertEqual(self.start(draft)['status'], 'handed_off')

    def test_unknown_employer_is_blocked_until_a_reliable_mapping_is_recorded(self):
        with self.assertRaisesRegex(ValueError, 'Confirm the actual hiring employer'):
            self.choice(self.job)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 0)
        self.map()
        self.choice(self.job)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 1)

    def test_submission_keeps_only_the_other_pending_slot_and_cooldown_waits_for_receipt(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        self.choice(second)
        first_draft, second_draft = self.draft(), self.draft(second)
        with patch.object(companies, 'clock', return_value=datetime(2026, 2, 1, tzinfo=timezone.utc)):
            first = self.start(first_draft)
            self.report(first, documents_used=True)
            status = self.context(second)['allowance']
            self.assertEqual(len(status['occupied']), 2)
            self.assertFalse(status['overflow'])
            self.assertFalse(status['cooling'])
            self.assertEqual(status['pending_job_ids'], [second['id']])
            with self.assertRaisesRegex(ValueError, 'Both application slots'):
                self.choice(third)
            self.report(self.start(second_draft), documents_used=True, occurred_at='2026-01-16')
            self.assertTrue(self.context(third)['allowance']['cooling'])
            self.assertTrue(self.s.action('company-avoid', {})['companies'])
        with patch.object(companies, 'clock', return_value=datetime(2026, 4, 17, tzinfo=timezone.utc)):
            self.choice(third)
            self.assertEqual(self.context(third)['allowance']['remaining'], 1)

    def test_legacy_missing_date_does_not_make_valid_pending_choice_self_blocking(self):
        second, third = self.same_company_roles()
        self.s.action('job', {**self.job, 'prior_application': 'submitted'})
        self.choice(second)
        status = self.context(second)['allowance']
        self.assertEqual(status['remaining'], 0)
        self.assertFalse(status['review_needed'])
        with self.assertRaisesRegex(ValueError, 'Both application slots'):
            self.choice(third)
        attempt = self.start(self.draft(second))
        self.assertEqual(attempt['status'], 'handed_off')
        self.assertEqual(self.s.action('company-submission-continue', {'id': attempt['id']})['id'], attempt['id'])

    def test_confirmed_alias_and_equivalent_listings_share_capacity(self):
        employer = self.map(requisition='REQ-1')['employer_id']
        listing = sources.structured_job({
            'title': self.job['title'], 'description': self.job['description'],
            'hiringOrganization': {'name': 'Fictional verified alias'},
        }, 'https://example.test/jobs/same-requisition')
        (duplicate_id,), _, _ = self.s.import_discovery([listing])
        duplicate = companies.by_id(self.w.read()['jobs'], duplicate_id)
        self.map(duplicate, employer_id=employer, requisition='REQ-1', **self.alias_opt_in(duplicate_id))
        second = self.role('another-role', employer=duplicate['employer'])
        with self.assertRaisesRegex(ValueError, 'Choose the existing employer'):
            self.map(second)
        self.map(second, employer_id=employer)
        for job in (self.job, duplicate, second):
            self.choice(job)
        self.assertEqual(companies.by_id(self.s.state()['jobs'], duplicate['id'])['company']['pending_only_count'], 2)
        status = self.context()['allowance']
        self.assertEqual(len(status['occupied']), 2)
        self.assertFalse(status['overflow'])
        self.assertEqual(len(status['pending_job_ids']), 3)
        handoff = self.s.action('application-handoff', {'all_pending': True})
        self.assertEqual({row['code'] for row in handoff['blockers']}, {'duplicate_vacancy'})
        self.choice(duplicate, False)
        selection = {'job_id': self.job['id'], 'job_ids': [self.job['id'], second['id']]}
        self.assertEqual(self.s.action('company-selection', selection)['job_ids'], selection['job_ids'])

    def test_explicit_published_alias_uses_existing_allowance_and_cannot_be_stolen(self):
        employer = self.map()['employer_id']
        alias = self.job['employer'] + ' Ltd'
        existing_pending = self.role('pending')
        self.map(existing_pending, employer_id=employer)
        self.choice(self.job)
        self.choice(existing_pending)
        listing = sources.structured_job({
            'title': 'Platform Engineer', 'description': 'Build Python APIs',
            'hiringOrganization': {'name': alias},
        }, 'https://example.test/careers/alias')
        (job_id,), _, _ = self.s.import_discovery([listing])
        company = self.s.action('company-roles', {'job_id': job_id})
        self.assertEqual(company.get('published_alias'), alias)
        self.assertEqual(company.get('job_id'), job_id)
        args = {'job_id': job_id, 'employer_id': employer, 'confirmed': True}
        with self.assertRaisesRegex(ValueError, 'different hiring employer'):
            self.s.action('company-map', {**args, 'record_alias': False})
        link = self.s.action('company-map', {**args, **self.alias_opt_in(job_id)})
        self.assertEqual(link['employer_id'], employer)
        self.assertEqual(self.s.action('company-roles', {'job_id': job_id})['status']['remaining'], 0)
        with self.assertRaisesRegex(ValueError, 'Both application slots'):
            self.choice({'id': job_id})

        duplicate = {**listing, 'id': None, 'url': 'https://example.test/careers/another-alias'}
        duplicate['employer_evidence'] = {**listing['employer_evidence'], 'url': duplicate['url']}
        (duplicate_id,), _, _ = self.s.import_discovery([duplicate])
        other = self.role('other', employer='Other Fictional Employer')
        other_id = self.map(other)['employer_id']
        for params in (
            {'employer_id': other_id, **self.alias_opt_in(duplicate_id)},
            {'name': alias, 'record_alias': False},
        ):
            with self.assertRaisesRegex(ValueError, 'another company|existing employer'):
                self.s.action('company-map', {'job_id': duplicate_id, 'confirmed': True, **params})
        self.assertIsNone(companies.employer_link(self.w.read(), duplicate_id))

    def test_explicit_alias_needs_current_published_hiring_identity(self):
        employer = self.map()['employer_id']
        recruiter = self.role('intermediary', employer='Fictional Recruiter')
        with self.assertRaisesRegex(ValueError, 'current published hiring employer'):
            self.map(recruiter, employer_id=employer, record_alias=True)
        self.map(recruiter, employer_id=employer, record_alias=False)
        self.assertNotIn(recruiter['employer'], self.context()['employer']['aliases'])
        changed = self.role('changed-source', employer='Fictional Systems Overseas')
        with self.w.edit() as state:
            companies.by_id(state['jobs'], changed['id'])['employer_evidence'] = {
                'name': changed['employer'], 'url': 'https://recruiter.example.test/different-listing',
                'source': 'published-hiring-employer',
            }
        company = self.s.action('company-roles', {'job_id': changed['id']})
        self.assertNotIn('published_alias', company)
        with self.assertRaisesRegex(ValueError, 'current published hiring employer'):
            self.map(changed, employer_id=employer, record_alias=True)

    def test_published_alias_cannot_override_the_existing_board_owner(self):
        original = self.map()['employer_id']
        source = self.s.action('source', {'kind': 'greenhouse', 'board': 'fictional-team'})
        other = self.role('other-board-owner', employer='Fictional Other Employer')
        owner = self.map(other, source_id=source['id'])['employer_id']
        listing = sources.structured_job({
            'title': 'Platform Engineer', 'description': 'Build Python APIs',
            'hiringOrganization': {'name': other['employer'] + ' Ltd'},
        }, 'https://job-boards.greenhouse.io/fictional-team/jobs/123')
        listing['source'] = 'greenhouse:fictional-team'
        (job_id,), _, _ = self.s.import_discovery([listing])
        args = {'job_id': job_id, 'confirmed': True, **self.alias_opt_in(job_id)}
        with self.assertRaisesRegex(ValueError, 'listing source belongs to another company'):
            self.s.action('company-map', {**args, 'employer_id': original})
        linked = self.s.action('company-map', {**args, 'employer_id': owner})
        self.assertEqual(linked['employer_id'], owner)

    def test_alias_confirmation_rejects_a_material_refresh_of_the_same_listing(self):
        employer = self.map()['employer_id']
        url = 'https://example.test/careers/alias-from-refresh'

        def import_name(name, requisition='REQ-42'):
            listing = sources.structured_job({
                'title': 'Platform Engineer', 'description': 'Build Python APIs',
                'hiringOrganization': {'name': name}, 'identifier': {'value': requisition},
            }, url)
            (job_id,), _, _ = self.s.import_discovery([listing])
            return job_id

        original_name = self.job['employer'] + ' Ltd'
        job_id = import_name(original_name)
        base = {'job_id': job_id, 'employer_id': employer, 'confirmed': True, 'record_alias': True}
        viewed = self.alias_opt_in(job_id)
        self.assertEqual(viewed['published_alias'], original_name)
        refreshed_name = 'Other Fictional Hiring Company'
        self.assertEqual(import_name(refreshed_name), job_id)
        old_request = {**base, **viewed}
        before = self.w.read()
        with self.assertRaises(companies.CompanyBlocked) as changed:
            self.s.action('company-map', old_request)
        self.assertEqual(changed.exception.code, 'employer_alias_changed')
        self.assertEqual(changed.exception.job_id, job_id)
        self.assertEqual(self.w.read(), before)
        self.assertIsNone(companies.employer_link(before, job_id))

        other = self.role('real-employer', employer='Other Fictional Company')
        other_id = self.map(other)['employer_id']
        second_binding = self.alias_opt_in(job_id)
        self.assertEqual(second_binding['published_alias'], refreshed_name)
        self.assertEqual(import_name(refreshed_name, requisition='REQ-77'), job_id)
        final_request = {**base, 'employer_id': other_id, **self.alias_opt_in(job_id)}
        self.assertNotEqual(second_binding['published_alias_proof'], final_request['published_alias_proof'])
        public = companies.by_id(self.s.state()['jobs'], job_id)
        self.assertEqual(public['published_alias_proof'], final_request['published_alias_proof'])
        with self.w.edit() as state:
            job = companies.by_id(state['jobs'], job_id)
            job['checked_at'] = '2026-11-07T09:36:00+00:00'
            job['employer_evidence']['logo'] = {'url': 'https://example.test/mark.png', 'page_url': url}
        self.assertEqual(self.alias_opt_in(job_id)['published_alias_proof'], final_request['published_alias_proof'])
        before = self.w.read()
        for payload in [
            {**final_request, **second_binding},
            {**final_request, 'published_alias': original_name},
            {**base, 'employer_id': other_id},
        ]:
            with self.assertRaises(companies.CompanyBlocked) as stale:
                self.s.action('company-map', payload)
            self.assertEqual(stale.exception.code, 'employer_alias_changed')
            self.assertEqual(self.w.read(), before)
        link = self.s.action('company-map', final_request)
        self.assertEqual(link['employer_id'], other_id)
        saved = self.w.read()['employers']
        self.assertNotIn(refreshed_name, companies.by_id(saved, employer)['aliases'])
        self.assertIn(refreshed_name, companies.by_id(saved, other_id)['aliases'])

    def test_historical_submission_and_pending_employer_correction_keep_records(self):
        second, third = self.same_company_roles()
        originally_other = self.role('other-company', employer='A different fictional employer')
        self.map(originally_other)
        for job in (self.job, second, originally_other):
            self.choice(job)
        employer = self.context()['employer']['id']
        self.map(originally_other, employer_id=employer, replace_employer=True)
        self.assertTrue(self.context()['allowance']['overflow'])
        self.assertEqual(self.s.action('agent-queue', {})['total'], 3)
        historical = self.draft(third)
        self.s.action('review', {'id': historical['id'], 'status': 'submitted', 'occurred_at': '2026-01-12'})
        self.assertEqual(self.context(third)['application']['status'], 'submitted')
        with self.assertRaisesRegex(ValueError, 'submitted or active record'):
            self.map(third, name='Another fictional employer', replace_employer=True)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 3)

    def test_import_preserves_pending_and_cannot_inject_another_choice(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        self.choice(second)
        fresh = self.role('new-role', saved=True, employer='Unconfirmed example employer')
        refreshed = {**third, 'description': 'Updated example posting', 'saved': True}
        self.s.import_discovery([refreshed])
        state = self.s.state()
        self.assertEqual({job['id'] for job in state['jobs'] if job['saved']}, {self.job['id'], second['id']})
        self.assertEqual(next(job for job in state['jobs'] if job['id'] == third['id'])['pending_blocker']['code'],
                         'company_slots_used')
        self.assertEqual(next(job for job in state['jobs'] if job['id'] == fresh['id'])['pending_blocker']['code'],
                         'employer_unresolved')
        check = self.s.action('company-research-check', {'name': self.job['employer']})
        self.assertEqual(check['remaining'], 0)
        self.assertTrue(check['research_eligible'])

    def test_copy_all_keeps_exact_ids_beyond_a_context_batch_and_never_starts_work(self):
        with self.w.edit() as state:
            self_job = companies.by_id(state['jobs'], self.job['id'])
            self_job['saved'] = True
            for number in range(104):
                identifier = store.uid()
                state['jobs'].append({**self.job, 'id': identifier, 'saved': True,
                                      'employer': f'Fictional employer {number}',
                                      'url': f'https://employer-{number}.example.test/job',
                                      'description': 'Untrusted advert text.'})
            for job in state['jobs']:
                companies.map_job(state, {'job_id': job['id'], 'confirmed': True}, self.s.workspace_zone())
        before = self.w.read()
        copied = self.s.action('application-handoff', {'all_pending': True})
        exact = {job['id'] for job in before['jobs']}
        self.assertEqual(len(copied['job_ids']), 105)
        self.assertEqual(set(copied['job_ids']), exact)
        self.assertEqual({line[2:] for line in copied['text'].splitlines() if line.startswith('- ')}, exact)
        self.assertIn('batches of up to 100', copied['text'])
        self.assertNotIn('Untrusted advert text', copied['text'])
        self.assertEqual(self.w.read(), before)
        self.assertIsNone(self.s.agent_execution)
        self.assertIsNone(self.s.delivery)
        self.assertFalse(before.get('submission_attempts'))
        with self.assertRaisesRegex(ValueError, 'up to 100'):
            self.s.action('application-context', {'job_ids': copied['job_ids']})
        self.choice(self.job, False)
        pending = self.s.action('application-handoff', {'all_pending': True})
        self.assertEqual(set(pending['job_ids']), exact - {self.job['id']})
        explicit = self.s.action('application-handoff', {'job_ids': [self.job['id']]})
        self.assertIsNone(explicit['text'])
        self.assertEqual(explicit['blockers'][0]['code'], 'role_not_pending')

    def test_research_prompt_and_empty_copy_are_workspace_bound(self):
        pending = self.s.action('application-handoff', {'all_pending': True})
        self.assertEqual(pending['job_ids'], [])
        self.assertEqual(pending['blockers'][0]['code'], 'empty_queue')
        workspace = self.s.state()['_workspace']
        before = self.w.read()
        prompt = self.s.action('research-handoff', {'profile_id': self.profile['id']})
        self.assertEqual(prompt['workspace_id'], workspace['workspace_id'])
        self.assertEqual(prompt['workspace'], workspace['path'])
        self.assertEqual(prompt['profile_id'], self.profile['id'])
        for required in ('five additional', 'GET /api/company-avoid', 'company-research-check',
                         'official careers', 'every eligible role'):
            self.assertIn(required, prompt['text'])
        self.assertNotIn(self.fact['text'], prompt['text'])
        self.assertEqual(self.w.read(), before)
        with self.assertRaisesRegex(ValueError, 'profile in this workspace'):
            self.s.action('research-handoff', {'profile_id': 'outside-workspace'})
        with self.assertRaisesRegex(ValueError, 'exact To apply'):
            self.s.action('application-handoff', {'all_pending': True, 'job_ids': [self.job['id']]})

    def test_protected_http_actions_return_typed_live_capacity_errors(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        self.choice(second)
        http = server(self.s, port=0)
        origin = f'http://127.0.0.1:{http.server_port}'
        worker = Thread(target=http.serve_forever, daemon=True)
        worker.start()
        try:
            with urlopen(origin + '/api/state', timeout=3) as response:
                state = json.load(response)
            headers = {'Origin': origin, 'Content-Type': 'application/json'}

            def post(action, value, token):
                request = Request(origin + '/api/' + action, data=store.encode(value),
                                  headers={**headers, 'X-Workspace-Token': token})
                with urlopen(request, timeout=3) as response:
                    return json.load(response)['result']

            with self.assertRaises(HTTPError) as error:
                post('application-handoff', {'all_pending': True}, 'wrong-token')
            self.assertEqual(error.exception.code, 403)
            token = state['token']
            copied = post('application-handoff', {'all_pending': True}, token)
            self.assertEqual(copied['workspace_id'], state['state']['_workspace']['workspace_id'])
            self.assertEqual(copied['workspace'], state['state']['_workspace']['path'])
            self.assertEqual(set(copied['job_ids']), {self.job['id'], second['id']})
            with self.assertRaises(HTTPError) as error:
                post('save-job', {'id': third['id'], 'saved': True}, token)
            self.assertEqual(error.exception.code, 409)
            with error.exception as response:
                problem = json.load(response)
            self.assertEqual(problem['code'], 'company_slots_used')
            self.assertEqual(problem['job_id'], third['id'])
            self.assertEqual(self.s.action('agent-queue', {})['total'], 2)
        finally:
            http.shutdown()
            http.server_close()
            worker.join(3)

    def test_older_submitted_occurrence_does_not_release_an_open_hold(self):
        second, third = self.same_company_roles()
        employer_id = self.context()['employer']['id']
        another, extra = self.role('another'), self.role('extra')
        for job in (another, extra):
            self.map(job, employer_id=employer_id)
        historical_listing = self.role('historically-submitted')
        self.map(historical_listing, employer_id=employer_id, same_job_id=third['id'])
        with patch.object(companies, 'clock', return_value=datetime(2026, 7, 1, tzinfo=timezone.utc)):
            for job, submitted_on in [(self.job, '2026-01-10'), (second, '2026-01-11')]:
                self.s.action('review', {'id': self.draft(job)['id'], 'status': 'submitted',
                                         'occurred_at': submitted_on})
            historical = self.draft(historical_listing)
            attempt = self.start(self.draft(third))
            self.s.action('review', {'id': historical['id'], 'status': 'submitted', 'occurred_at': '2026-01-12'})
            self.assertFalse(self.context(another)['allowance']['cooling'])
            self.assertEqual(len(self.context(another)['allowance']['held']), 1)
            self.choice(another)
            with self.assertRaisesRegex(ValueError, 'Both application slots'):
                self.choice(extra)
            self.report(attempt, outcome='not_sent', evidence='Verified no new application was submitted.')
            self.choice(extra)

    def test_rejected_saved_role_cannot_be_restored_by_a_new_draft_or_review(self):
        second, third = self.same_company_roles()
        for job in (self.job, second):
            self.choice(job)
        rejected = self.draft()
        self.s.action('review', {'id': rejected['id'], 'status': 'rejected'})
        self.choice(third)
        companion = packages.path_for(self.w.path, rejected, 'resume.txt')
        companion.write_text('A fictional edited companion.', encoding='utf-8')
        before = self.w.read()
        version_files = set((self.w.path / 'applications').rglob('version.json'))
        for action in (
            lambda: self.s.action('review', {'id': rejected['id'], 'status': 'draft'}),
            self.draft,
            lambda: self.s.action('adopt-edits', {'id': rejected['id']}),
        ):
            with self.assertRaisesRegex(ValueError, 'Narrow To apply'):
                action()
            self.assertEqual(self.w.read(), before)
            self.assertEqual(set((self.w.path / 'applications').rglob('version.json')), version_files)
        self.assertEqual(companion.read_text(encoding='utf-8'), 'A fictional edited companion.')
        self.choice(third, False)
        accepted = self.s.action('adopt-edits', {'id': rejected['id']})
        self.assertEqual(accepted['status'], 'draft')
        self.assertEqual(self.s.action('agent-queue', {})['total'], 2)

    def test_document_editor_checks_pending_restoration_before_publishing_a_version(self):
        second, third = self.same_company_roles()
        self.choice(self.job)
        self.choice(second)
        rejected = self.draft()
        self.s.action('review', {'id': rejected['id'], 'status': 'rejected'})
        self.choice(third)
        edit = self.s.action('document-editor', {'id': rejected['id'], 'document': 'resume'})
        edit['blocks'].append(['text', 'Fictional wording added in the editor.'])
        original = packages.path_for(self.w.path, rejected, 'resume.pdf').read_bytes()
        before = self.w.read()
        versions = set((self.w.path / 'applications').rglob('version.json'))

        preview = self.s.action('preview-document', edit)
        self.assertTrue(preview['pdf'])
        with self.assertRaises(companies.CompanyBlocked) as error:
            self.s.action('save-document', edit)
        self.assertEqual(error.exception.code, 'company_queue_overflow')
        self.assertEqual(error.exception.job_id, self.job['id'])
        self.assertEqual(self.w.read(), before)
        self.assertEqual(set((self.w.path / 'applications').rglob('version.json')), versions)
        self.assertEqual(packages.path_for(self.w.path, rejected, 'resume.pdf').read_bytes(), original)

        self.choice(self.job, False)
        revised = self.s.action('save-document', edit)
        self.assertEqual(revised['derived_from'], rejected['id'])
        self.assertFalse(packages.changed(self.w.path, revised))
        self.assertEqual(packages.path_for(self.w.path, rejected, 'resume.pdf').read_bytes(), original)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 2)

    def test_legacy_manual_retry_rechecks_an_open_hold_and_returns_terminal_result(self):
        second, third = self.same_company_roles()
        draft = self.draft()
        request = self.s.action('company-submission-review', {'application_id': draft['id']})
        args = {'id': request['id'], 'application_id': draft['id'],
                'fingerprint': request['fingerprint'], 'approved': True}
        attempt = self.s.action('company-submission-reserve', args)
        self.assertEqual(self.s.action('company-submission-reserve', args), attempt)
        with self.w.edit() as state:
            for job_id in (second['id'], third['id']):
                companies.by_id(state['jobs'], job_id)['saved'] = True
        with self.assertRaisesRegex(ValueError, 'Narrow To apply'):
            self.s.action('company-submission-reserve', args)
        outcome = self.report(attempt, outcome='not_sent', evidence='Verified no application was sent.')
        self.assertEqual(self.s.action('company-submission-reserve', args), outcome)
        self.assertEqual(self.s.action('agent-queue', {})['total'], 2)

    def test_legacy_browser_holds_before_disclosure_and_releases_after_waiting_cancel(self):
        second, third = self.same_company_roles()
        self.s.action('job', {**self.job, 'url': 'https://www.linkedin.com/jobs/view/123456/'})
        self.choice(second)
        draft = self.draft()
        opened, release = Event(), Event()

        class WaitingBrowser(Browser):
            def open(self, url):
                super().open(url)
                opened.set()
                if not release.wait(5):
                    raise TimeoutError('Fictional browser was never released')

        browser = WaitingBrowser()
        self.s.delivery = Delivery(self.s, mail=Mail(), browser_factory=lambda: browser)
        try:
            attempt = self.s.action('apply-start', {'application_id': draft['id'], 'channel': 'linkedin',
                                                    'disclosure_confirmed': True})
            self.assertTrue(opened.wait(3))
            self.assertEqual(self.context(second)['allowance']['remaining'], 0)
            with self.assertRaisesRegex(ValueError, 'Both application slots'):
                self.choice(third)
            self.s.action('apply-cancel', {'id': attempt['id']})
            with self.assertRaisesRegex(ValueError, 'Both application slots'):
                self.choice(third)
            release.set()
            self.s.delivery.commands.join()
            self.assertIsNone(browser.received)
            self.assertEqual(self.s.action('apply-get', {'id': attempt['id']})['status'], 'cancelled')
            self.choice(third)
        finally:
            release.set()
            self.s.delivery.close()

    def test_legacy_browser_keeps_its_slot_until_cancellation_retry_succeeds(self):
        second, third = self.same_company_roles()
        self.s.action('job', {**self.job, 'url': 'https://www.linkedin.com/jobs/view/123456/'})
        self.choice(second)
        draft = self.draft()
        browser, mail = Browser(), Mail()
        self.s.delivery = Delivery(self.s, mail=mail, browser_factory=lambda: browser)
        try:
            attempt = self.s.action('apply-start', {'application_id': draft['id'], 'channel': 'linkedin',
                                                    'disclosure_confirmed': True})
            args = {'id': attempt['id']}
            self.s.delivery.commands.join()
            self.assertEqual(self.s.action('apply-get', args)['status'], 'awaiting_approval')
            with patch.object(browser, 'close', side_effect=[OSError('Fictional browser transport failed'), None]) as close:
                self.s.action('apply-cancel', args)
                self.s.delivery.commands.join()
                held = self.s.action('apply-get', args)
                self.assertEqual(held['status'], 'cancelling')
                self.assertTrue(held.get('can_retry_cancel'))
                self.assertIn('Try cancellation again', held['note'])
                self.assertTrue(self.s.delivery.busy)
                self.assertEqual(self.context(second)['allowance']['remaining'], 0)
                with self.assertRaisesRegex(ValueError, 'Both application slots'):
                    self.choice(third)
                with self.assertRaisesRegex(ValueError, 'Review the current complete application'):
                    self.s.action('apply-approve', {**args, 'approved': True, 'fingerprint': held['fingerprint']})

                self.s.action('apply-cancel', args)
                self.s.delivery.commands.join()
                self.assertEqual(close.call_count, 2)
            cancelled = self.s.action('apply-get', args)
            self.assertEqual(cancelled['status'], 'cancelled')
            self.assertFalse(cancelled.get('can_retry_cancel'))
            self.assertFalse(self.s.delivery.busy)
            self.assertEqual(browser.clicked, 0)
            self.assertEqual(mail.messages, [])
            self.choice(third)
        finally:
            self.s.delivery.close()

    def test_legacy_browser_rechecks_capacity_before_a_document_write(self):
        second, third = self.same_company_roles()
        self.s.action('job', {**self.job, 'url': 'https://www.linkedin.com/jobs/view/123456/'})
        self.choice(second)
        draft = self.draft()
        ready, release = Event(), Event()

        class WaitingBrowser(Browser):
            def prepare(self, payload, resume, cover=None, *, before_disclosure):
                ready.set()
                if not release.wait(5):
                    raise TimeoutError('Fictional browser was never released')
                return super().prepare(payload, resume, cover, before_disclosure=before_disclosure)

        browser = WaitingBrowser()
        self.s.delivery = Delivery(self.s, mail=Mail(), browser_factory=lambda: browser)
        try:
            attempt = self.s.action('apply-start', {'application_id': draft['id'], 'channel': 'linkedin',
                                                    'disclosure_confirmed': True})
            self.assertTrue(ready.wait(3))
            with self.w.edit() as state:
                companies.by_id(state['jobs'], third['id'])['saved'] = True
            release.set()
            self.s.delivery.commands.join()
            held = self.s.action('apply-get', {'id': attempt['id']})
            self.assertEqual(held['status'], 'needs_user')
            self.assertIn('Narrow To apply', held['note'])
            self.assertIsNone(browser.received)
            self.choice(third, False)
            self.s.action('apply-resume', {'id': attempt['id']})
            self.s.delivery.commands.join()
            self.assertEqual(self.s.action('apply-get', {'id': attempt['id']})['status'], 'awaiting_approval')
            self.assertTrue(browser.received.startswith(b'%PDF'))
            self.assertEqual(self.context(second)['allowance']['remaining'], 0)
        finally:
            release.set()
            self.s.delivery.close()
