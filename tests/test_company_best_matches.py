"""Fictional service boundary tests for reviewed company comparisons."""

from contextlib import closing
import json
import subprocess
import sys
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from employment_agency import store
from employment_agency.company_best_matches import ResearchIncomplete
from employment_agency.server import server
from employment_agency.service import Service
import test_company_avoid


class CompanyBestMatches(unittest.TestCase):
    seed = test_company_avoid.CompanyAvoid.seed
    tearDown = test_company_avoid.CompanyAvoid.tearDown

    def role(self, *args, **kwargs):
        job = test_company_avoid.CompanyAvoid.role(self, *args, **kwargs)
        return job

    def record_sources(self, *jobs):
        for job in jobs:
            self.s.action('company-research-record', {
                'workspace_id': self.w.workspace_id, 'research_id': self.research_id,
                'url': job['url'], 'status': 'retrieved', 'job_ids': [job['id']],
                'evidence': 'Fictional browser source evidence for the comparison fixture.',
            })
        from employment_agency import company_logo_assets
        from test_company_logos import image_bytes

        mark = company_logo_assets.normalize(image_bytes(), 'image/png')
        sha256 = company_logo_assets.persist(self.w.path, mark)
        with self.w.edit() as state:
            for employer in state.get('employers', []):
                employer['logo'] = {'sha256': sha256, 'source': 'fictional-test',
                                    'page_url': 'https://employer.example.test/'}

    def setUp(self):
        test_company_avoid.CompanyAvoid.setUp(self)
        self.roles = [self.first, self.role('backend'), self.role('platform')]
        self.research_id = self.s.action('company-research-start', {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
        })['id']
        self.record_sources()
        self.fact_id = self.w.read()['facts'][0]['id']
        self.comparison = {
            'workspace_id': self.w.workspace_id,
            'employer_id': self.employer,
            'profile_id': self.profile['id'],
            'compared_job_ids': [role['id'] for role in self.roles],
            'picks': [
                {'job_id': role['id'], 'reason': 'Python API work supports the integration responsibilities.',
                 'fact_ids': [self.fact_id]} for role in self.roles[1:]
            ],
        }

    def save(self, **changes):
        payload = {**self.comparison, **changes}
        if 'basis' not in payload:
            payload['basis'] = self.read_basis()['basis']
        return self.s.action('company-best-matches', payload)

    def read_basis(self, **changes):
        fields = ('workspace_id', 'employer_id', 'profile_id')
        return self.s.action('company-best-matches-basis', {
            **{key: self.comparison[key] for key in fields}, **changes,
        })

    def picks(self):
        return self.s.state()['company_best_matches']

    def research(self, *roles, finalize=False, **changes):
        args = {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
            'research_id': self.research_id,
            'job_ids': [job['id'] for job in roles], **changes,
        }
        action = 'company-research-complete' if finalize else 'company-research'
        return self.s.action(action, args)

    def test_assessment_keeps_earlier_call_inputs(self):
        payload = {'profile_id': self.profile['id'], 'research_id': self.research_id,
                   'job_ids': [self.first['id']] * 2}
        self.assertEqual(self.s.action('company-research', payload), self.research(self.first))
        empty = self.s.action('company-research', {**payload, 'job_ids': []})
        self.assertEqual(empty['companies'], [])
        self.assertEqual(empty['completion']['companies'], [])
        with self.assertRaisesRegex(ValueError, 'current workspace'):
            self.s.action('company-research', {**payload, 'workspace_id': 'another-workspace'})

    def test_research_requires_current_highlights_from_full_inventory(self):
        checked = self.roles[:2]
        self.record_sources(*checked)
        before = self.w.read()
        assessment = self.research(*checked)
        completion = assessment['completion']
        self.assertEqual(completion['companies'][0]['vacancy_count'], 3)
        self.assertEqual(completion['blockers'][0]['code'], 'company_highlights_missing')
        self.assertEqual(self.s.state()['company_highlight_reviews'][0]['status'], 'missing')
        with self.assertRaises(ResearchIncomplete) as refused:
            self.research(*checked, finalize=True)
        self.assertEqual(refused.exception.result['completion'], completion)
        self.assertEqual(self.w.read(), before)
        self.save()
        reviewed = self.w.read()
        result = self.research(*checked, finalize=True)['completion']
        self.assertTrue(result['ready'])
        self.assertEqual(result['companies'][0]['status'], 'current')
        self.assertEqual(self.s.state()['company_highlight_reviews'], [])
        self.assertEqual(self.w.read(), reviewed)
        self.role('fourth')
        self.assertEqual(self.s.state()['company_highlight_reviews'][0]['status'], 'stale')
        self.assertEqual(self.picks(), [])
        stale = self.w.read()
        with self.assertRaises(ResearchIncomplete) as refused:
            self.research(*checked, finalize=True)
        self.assertEqual(refused.exception.result['completion']['blockers'][0]['code'], 'company_highlights_stale')
        self.assertEqual(self.w.read(), stale)

    def test_research_checks_every_scoped_company_and_ignores_unrelated_reviews(self):
        others = [self.role(f'other-{i}', employer=f'Other Fictional Company {i}', mapped=False)
                  for i in range(5)]
        for role in others:
            self.s.action('company-map', {'job_id': role['id'], 'confirmed': True})
        self.record_sources(*others)
        self.assertTrue(self.research(*others, finalize=True)['completion']['ready'])
        self.role('submitted-at-original', submitted_on='2026-01-01')
        assessment = self.research(*others, self.first)
        self.assertEqual(len(assessment['companies']), 5)
        self.assertNotIn(self.employer, {company['id'] for company in assessment['companies']})
        self.assertIn(self.employer, {company['employer_id'] for company in assessment['completion']['companies']})
        with self.assertRaisesRegex(ResearchIncomplete, self.first['employer']):
            self.research(*others, self.first, finalize=True)

    def test_research_counts_posting_mirrors_once_and_excludes_submissions(self):
        # Simulate retained legacy listings with different verified requisitions
        # but a shared posting URL. All three link IDs remain distinct.
        with self.w.edit() as state:
            state['jobs'][1]['url'] = state['jobs'][0]['url']
        self.s.action('company-research-record', {
            'workspace_id': self.w.workspace_id, 'research_id': self.research_id,
            'url': self.first['url'], 'status': 'retrieved',
            'job_ids': [self.first['id'], self.roles[1]['id']], 'evidence': 'Both fictional posting mirrors checked.',
        })
        self.record_sources(self.roles[2])
        result = self.research(*self.roles, finalize=True)['completion']
        self.assertEqual(result['companies'][0]['vacancy_count'], 2)
        self.assertEqual(result['companies'][0]['status'], 'not_required')
        with self.assertRaisesRegex(ValueError, 'At least three distinct suitable vacancies'):
            self.read_basis()
        extra = self.role('fourth')
        self.record_sources(extra)
        basis = self.read_basis()
        groups = {job['id']: job['vacancy_group_id'] for job in basis['jobs']}
        self.assertEqual(groups[self.roles[0]['id']], groups[self.roles[1]['id']])
        with self.assertRaisesRegex(ValueError, 'same vacancy'):
            self.save(compared_job_ids=[*self.comparison['compared_job_ids'], extra['id']])
        with self.w.edit() as state:
            state['jobs'][0]['prior_application'] = 'submitted'
        result = self.research(*self.roles, extra, finalize=True)['completion']
        self.assertEqual(result['companies'][0]['vacancy_count'], 2)

    def test_comparison_groups_transitive_duplicates(self):
        extra = self.role('another')
        bridge = self.role('bridge', requisition='backend')
        with self.w.edit() as state:
            next(job for job in state['jobs'] if job['id'] == bridge['id'])['url'] = self.first['url']
        self.record_sources(next(job for job in self.w.read()['jobs'] if job['id'] == bridge['id']))
        self.record_sources(extra)
        basis = self.read_basis()
        groups = {job['id']: job['vacancy_group_id'] for job in basis['jobs']}
        self.assertEqual(len(set(groups.values())), 3)
        self.assertEqual(groups[self.first['id']], groups[self.roles[1]['id']])
        self.assertEqual(groups[self.first['id']], groups[bridge['id']])
        compared = [self.roles[1]['id'], self.roles[2]['id'], extra['id']]
        self.save(basis=basis['basis'], compared_job_ids=compared)
        self.assertTrue(self.research(bridge, extra, finalize=True)['completion']['ready'])
        with self.w.edit() as state:
            state['jobs'][0]['prior_application'] = 'submitted'
        result = self.research(bridge, extra, finalize=True)['completion']
        self.assertEqual(result['companies'][0]['vacancy_count'], 2)

    def test_research_blocks_in_scope_unverified_employers_and_availability(self):
        self.record_sources(self.first)
        self.save()
        unresolved = self.role('unresolved', mapped=False)
        other = self.role('outside', employer='Unrelated Fictional Company', mapped=False)
        completion = self.research(self.first)['completion']
        self.assertEqual([(row['job_id'], row['code']) for row in completion['blockers']],
                         [(unresolved['id'], 'employer_identity_unresolved')])
        with self.assertRaises(ResearchIncomplete) as refused:
            self.research(other, finalize=True)
        self.assertEqual(refused.exception.result['completion']['blockers'][0]['job_id'], other['id'])
        self.s.action('company-map', {'job_id': unresolved['id'], 'confirmed': True, 'employer_id': self.employer})
        with self.w.edit() as state:
            next(job for job in state['jobs'] if job['id'] == unresolved['id'])['availability'] = 'unverified'
        self.assertTrue(self.research(self.first, finalize=True)['completion']['ready'])
        with self.assertRaises(ResearchIncomplete) as refused:
            self.research(self.first, unresolved, finalize=True)
        self.assertEqual(refused.exception.result['completion']['blockers'][0]['code'],
                         'listing_availability_unverified')

    def test_finalization_validates_scope_and_requires_confirmed_evidence(self):
        for changes in [
            {'workspace_id': 'other'}, {'workspace_id': None}, {'profile_id': 'unknown'},
            {'profile_id': []}, {'job_ids': []}, {'job_ids': 'bad'}, {'job_ids': [{}]},
            {'job_ids': [self.first['id']] * 2}, {'job_ids': ['outside-workspace']}, {'extra': True},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError) as rejected:
                self.research(self.first, finalize=True, **changes)
            self.assertNotIsInstance(rejected.exception, ResearchIncomplete)
        with self.assertRaisesRegex(ValueError, 'current workspace'):
            self.s.action('company-research-complete', {
                'profile_id': self.profile['id'], 'job_ids': [self.first['id']],
            })
        self.s.action('retire', {'id': self.fact_id})
        with self.assertRaisesRegex(ValueError, 'confirmed career facts'):
            self.save()
        with self.assertRaisesRegex(ResearchIncomplete, 'shortage of confirmed career facts'):
            self.research(self.first, finalize=True)

    def test_cli_returns_incomplete_scope_with_nonzero_exit(self):
        args = [sys.executable, '-m', 'employment_agency', '--workspace', str(self.w.path),
                'action', 'company-research-complete']
        scope = {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
            'research_id': self.research_id,
            'job_ids': [self.first['id']],
        }
        self.w.close()
        result = subprocess.run(args, input=json.dumps(scope), text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('Company research is incomplete', result.stderr)
        blocker = json.loads(result.stdout)['completion']['blockers'][0]
        self.assertEqual(blocker['code'], 'company_highlights_missing')

    def test_private_snapshot_restore_and_application_context(self):
        saved = self.save()
        self.assertTrue(saved['reviewed_at'])
        self.assertEqual([row['job_id'] for row in self.picks()[0]['picks']],
                         [role['id'] for role in self.roles[1:]])
        self.assertNotIn('best_match_reviews', self.s.state()['employers'][0])
        context = self.s.action('application-context', {'job_ids': [self.first['id']]})
        self.assertNotIn('Python API work supports', str(context))
        self.assertFalse(self.s.state()['applications'])
        self.assertFalse(any(job['saved'] for job in self.s.state()['jobs']))
        archive = self.root / 'portable.zip'
        destination = self.root / 'restored'
        self.w.export(archive)
        store.restore(archive, destination)
        restored = store.Workspace(destination, sqlite=True)
        try:
            self.assertEqual(Service(restored).state()['company_best_matches'], self.picks())
            self.assertEqual(restored.read()['employers'][0]['best_match_reviews'][self.profile['id']]['picks'],
                             self.comparison['picks'])
        finally:
            restored.close()
        snapshot = self.root / 'snapshot'
        store.restore_snapshot(self.w.path, snapshot)
        with closing(store.Workspace(snapshot, sqlite=True)) as reopened:
            self.assertEqual(Service(reopened).state()['company_best_matches'], self.picks())

    def test_refresh_reimport_and_queue_choices_keep_the_comparison(self):
        self.save()
        with self.w.edit() as state:
            state['jobs'][0]['checked_at'] = '2026-01-01T00:00:00+00:00'
        self.assertEqual(len(self.picks()), 1)
        self.s.action('job', self.first)
        self.assertEqual(len(self.picks()), 1)
        self.s.action('save-job', {'id': self.first['id'], 'saved': True})
        self.assertEqual(len(self.picks()), 1)

    def test_material_listing_fact_profile_and_inventory_changes_invalidate(self):
        self.save()
        with self.w.edit() as state:
            state['jobs'][0]['requirements'].append('New requirement')
        self.assertEqual(self.picks(), [])
        self.save()
        with self.w.edit() as state:
            state['profiles'][0]['roles'].append('Architect')
        self.assertEqual(self.picks(), [])
        self.save()
        extra = self.role('newly-published')
        self.assertEqual(self.picks(), [])
        with self.assertRaisesRegex(ValueError, 'every suitable vacancy'):
            self.save()
        self.save(compared_job_ids=[*self.comparison['compared_job_ids'], extra['id']])
        self.s.action('retire', {'id': self.fact_id})
        self.assertEqual(self.picks(), [])

    def test_incomplete_duplicate_cross_employer_and_unconfirmed_facts(self):
        a, b, c = self.comparison['compared_job_ids']
        duplicate = self.role('mirror', requisition='first')
        unrelated = self.role('other-employer', employer='Somewhere Else', mapped=False)
        self.s.action('company-map', {'job_id': unrelated['id'], 'confirmed': True})
        fact = self.s.action('fact', {'text': 'Unconfirmed note'})
        current_basis = self.read_basis()['basis']
        unconfirmed = {**self.comparison['picks'][0], 'fact_ids': [fact['id']]}
        missing_fact = {**unconfirmed, 'fact_ids': ['missing']}
        for changes, message in [
            ({'workspace_id': 'other'}, 'current workspace'),
            ({'profile_id': 'unknown'}, 'verified employer and search profile'),
            ({'compared_job_ids': [b, c]}, 'at least three distinct'),
            ({'compared_job_ids': [b, c, 'unknown']}, 'current, suitable'),
            ({'compared_job_ids': [b, c, unrelated['id']]}, 'current, suitable'),
            ({'compared_job_ids': [a, b, c, duplicate['id']]}, 'same vacancy'),
            ({'picks': [unconfirmed, self.comparison['picks'][1]]}, 'confirmed career facts'),
            ({'picks': [missing_fact, self.comparison['picks'][1]]}, 'confirmed career facts'),
        ]:
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, message):
                self.save(basis=current_basis, **changes)
        self.assertEqual(self.picks(), [])

    def test_unavailable_removed_and_hard_conflicts_hide_pair(self):
        for changes in [
            {'availability': 'closed'},
            {'eligibility': 'conflict'},
            {'removals': [{'id': 'removed', 'removed_at': '2026-04-04T00:00:00+00:00'}]},
        ]:
            with self.subTest(changes=changes):
                self.save()
                with self.w.edit() as state:
                    state['jobs'][0].update(changes)
                self.assertEqual(self.picks(), [])
                with self.assertRaisesRegex(ValueError, 'At least three distinct suitable vacancies'):
                    self.read_basis()
                with self.w.edit() as state:
                    for key in changes:
                        if key in self.first:
                            state['jobs'][0][key] = self.first[key]
                        else:
                            state['jobs'][0].pop(key, None)

    def test_profiles_store_independent_pairs_and_invalid_record_is_omitted(self):
        self.save()
        other = self.s.action('profile', {**self.profile, 'id': None, 'name': 'Second profile'})
        basis = self.read_basis(profile_id=other['id'])['basis']
        self.save(profile_id=other['id'], basis=basis, picks=list(reversed(self.comparison['picks'])))
        by_profile = {record['profile_id']: record['picks'] for record in self.picks()}
        orders = {key: [pick['job_id'] for pick in value] for key, value in by_profile.items()}
        self.assertEqual(orders[self.profile['id']], list(reversed(orders[other['id']])))
        with self.w.edit() as state:
            state['employers'][0]['best_match_reviews'][other['id']]['picks'] = ['invalid']
        self.assertEqual([record['profile_id'] for record in self.picks()], [self.profile['id']])

    def test_protected_local_endpoint(self):
        self.record_sources(self.first)
        with server(self.s, 0) as http:
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                origin = f'http://127.0.0.1:{http.server_port}'
                url = origin + '/api/company-best-matches'
                complete_url = origin + '/api/company-research-complete'
                headers = {'Origin': origin, 'Content-Type': 'application/json'}
                payload = json.dumps({**self.comparison, 'basis': self.read_basis()['basis']}).encode()
                checked = json.dumps({
                    'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
                    'research_id': self.research_id,
                    'job_ids': [self.first['id']],
                }).encode()
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(Request(url, data=payload, headers=headers), timeout=3)
                self.assertEqual(rejected.exception.code, 403)
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(Request(complete_url, data=checked, headers=headers), timeout=3)
                self.assertEqual(rejected.exception.code, 403)
                with urlopen(origin + '/api/state', timeout=3) as response:
                    headers['X-Workspace-Token'] = json.load(response)['token']
                with self.assertRaises(HTTPError) as refused:
                    urlopen(Request(complete_url, data=checked, headers=headers), timeout=3)
                with refused.exception as response:
                    self.assertEqual(response.code, 409)
                    blocker = json.load(response)['result']['completion']['blockers'][0]
                    self.assertEqual(blocker['code'], 'company_highlights_missing')
                basis_payload = {key: self.comparison[key] for key in ('workspace_id', 'employer_id', 'profile_id')}
                basis_request = Request(url + '-basis', data=json.dumps(basis_payload).encode(), headers=headers)
                with urlopen(basis_request, timeout=3) as response:
                    context = json.load(response)['result']
                self.assertEqual({job['id'] for job in context['jobs']}, set(self.comparison['compared_job_ids']))
                self.assertEqual(context['basis'], json.loads(payload)['basis'])
                with urlopen(Request(url, data=payload, headers=headers), timeout=3) as response:
                    self.assertEqual(json.load(response)['result']['employer_id'], self.employer)
                with urlopen(Request(complete_url, data=checked, headers=headers), timeout=3) as response:
                    self.assertTrue(json.load(response)['result']['completion']['ready'])
                with urlopen(origin + '/api/state', timeout=3) as response:
                    self.assertEqual(len(json.load(response)['state']['company_best_matches']), 1)
            finally:
                http.shutdown()
                thread.join(3)

    def test_basis_detects_edits_before_save_and_new_confirmed_facts(self):
        old_basis = self.read_basis()['basis']
        with self.w.edit() as state:
            state['jobs'][1]['requirements'].append('New backend requirement')
        with self.assertRaisesRegex(ValueError, 'basis changed'):
            self.save(basis=old_basis)
        self.save()
        original = self.read_basis()['basis']
        new_fact = self.s.action('fact', {'text': 'Designed release and support workflows.'})
        self.assertEqual(self.read_basis()['basis'], original)
        self.assertEqual(len(self.picks()), 1)
        self.s.action('confirm', {'id': new_fact['id']})
        self.assertNotEqual(self.read_basis()['basis'], original)
        self.assertEqual(self.picks(), [])

    def test_basis_omits_contact_records_and_requires_its_token(self):
        contact = self.s.action('fact', {'text': 'Private reference', 'category': 'reference'})
        self.s.action('confirm', {'id': contact['id']})
        basis = self.read_basis()
        self.assertNotIn(contact['id'], {fact['id'] for fact in basis['facts']})
        self.assertNotIn('email', basis['jobs'][0])
        with self.assertRaisesRegex(ValueError, 'complete comparison'):
            self.s.action('company-best-matches', self.comparison)
        with self.assertRaisesRegex(ValueError, 'confirmed career facts'):
            self.save(picks=[
                {**self.comparison['picks'][0], 'fact_ids': [contact['id']]}, self.comparison['picks'][1],
            ])
