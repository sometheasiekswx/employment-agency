"""Fictional service boundary tests for reviewed company comparisons."""

from contextlib import closing
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from employment_agency import store
from employment_agency.server import server
from employment_agency.service import Service
import test_company_avoid


class CompanyBestMatches(unittest.TestCase):
    seed = test_company_avoid.CompanyAvoid.seed
    role = test_company_avoid.CompanyAvoid.role
    tearDown = test_company_avoid.CompanyAvoid.tearDown

    def setUp(self):
        test_company_avoid.CompanyAvoid.setUp(self)
        self.roles = [self.first, self.role('backend'), self.role('platform')]
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
        return self.s.action('company-best-matches', {**self.comparison, **changes})

    def picks(self):
        return self.s.state()['company_best_matches']

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
                self.save(**changes)
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
                with self.assertRaisesRegex(ValueError, 'current, suitable'):
                    self.save()
                with self.w.edit() as state:
                    for key in changes:
                        if key in self.first:
                            state['jobs'][0][key] = self.first[key]
                        else:
                            state['jobs'][0].pop(key, None)

    def test_profiles_store_independent_pairs_and_invalid_record_is_omitted(self):
        self.save()
        other = self.s.action('profile', {**self.profile, 'id': None, 'name': 'Second profile'})
        self.save(profile_id=other['id'], picks=list(reversed(self.comparison['picks'])))
        by_profile = {record['profile_id']: record['picks'] for record in self.picks()}
        orders = {key: [pick['job_id'] for pick in value] for key, value in by_profile.items()}
        self.assertEqual(orders[self.profile['id']], list(reversed(orders[other['id']])))
        with self.w.edit() as state:
            state['employers'][0]['best_match_reviews'][other['id']]['picks'] = ['invalid']
        self.assertEqual([record['profile_id'] for record in self.picks()], [self.profile['id']])

    def test_protected_local_endpoint(self):
        with server(self.s, 0) as http:
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                origin = f'http://127.0.0.1:{http.server_port}'
                url = origin + '/api/company-best-matches'
                headers = {'Origin': origin, 'Content-Type': 'application/json'}
                payload = json.dumps(self.comparison).encode()
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(Request(url, data=payload, headers=headers), timeout=3)
                self.assertEqual(rejected.exception.code, 403)
                with urlopen(origin + '/api/state', timeout=3) as response:
                    headers['X-Workspace-Token'] = json.load(response)['token']
                with urlopen(Request(url, data=payload, headers=headers), timeout=3) as response:
                    self.assertEqual(json.load(response)['result']['employer_id'], self.employer)
                with urlopen(origin + '/api/state', timeout=3) as response:
                    self.assertEqual(len(json.load(response)['state']['company_best_matches']), 1)
            finally:
                http.shutdown()
                thread.join(3)
