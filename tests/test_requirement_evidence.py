"""Career evidence recorded from one exact job requirement."""
import unittest

import test_workflow
from employment_agency import matching


class RequirementEvidence(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown

    def add_job(self, **args):
        return self.s.action('job', {
            'title': 'Platform Engineer', 'description': 'Build secure services.', **args,
        })

    def set_evidence(self, job, requirement, **args):
        return self.s.action('requirement-evidence', {
            'job_id': job['id'], 'requirement': requirement, **args,
        })

    def test_quick_confirmation_saves_one_reusable_skill_and_preserves_eligibility(self):
        job = self.add_job(requirements=['Kubernetes'], eligibility='conflict')
        requirement = job['requirements'][0]
        equivalent = 'Hands-on experience with Kubernetes.'
        extra_skill = 'Kubernetes and Terraform'
        other = self.add_job(title='Operations Engineer', requirements=[equivalent, extra_skill])
        evidence = self.set_evidence(job, requirement, save_skill=True)
        self.assertEqual(self.set_evidence(job, requirement, details=' ', save_skill=True), evidence)
        state = self.w.read()
        saved = state['jobs'][0]
        fact, = state['facts']
        self.assertEqual(evidence, {'fact_ids': [fact['id']]})
        self.assertEqual(saved['requirement_evidence'], {requirement: evidence})
        self.assertEqual(fact['text'], requirement)
        self.assertEqual(fact['category'], 'skill')
        self.assertEqual(fact['source']['name'], 'User confirmed skill')
        self.assertEqual(fact['association'], '')
        self.assertEqual(fact['dates'], '')
        self.assertEqual(matching.available(state['facts']), [fact])
        result = matching.match(saved, {'include_unknown': True}, state['facts'])
        self.assertIn('Confirmed work-rights conflict', result['hard_conflicts'])
        self.assertFalse(result['eligible_for_preparation'])
        self.assertEqual(result['fact_ids'], [fact['id']])
        self.assertEqual(result['gaps'], [])
        other_match = matching.match(other, {}, state['facts'])
        self.assertEqual(other_match['evidence'][0]['fact_ids'], [fact['id']])
        self.assertEqual(other_match['gaps'], [extra_skill])
        self.assertEqual(self.s.state()['jobs'][1]['matched_skill_evidence'], {equivalent: [fact['id']]})
        self.assertNotIn('requirement_evidence', state['jobs'][1])

    def test_quick_confirmation_reuses_an_existing_confirmed_skill_across_jobs(self):
        fact = self.s.action('fact', {'text': 'Kubernetes', 'category': 'skills'})
        original = self.s.action('confirm', {'id': fact['id']})
        first = self.add_job(requirements=['Kubernetes'])
        second = self.add_job(title='Operations Engineer', requirements=['kubernetes experience'])
        for job in (first, second):
            requirement, = job['requirements']
            self.assertEqual(self.set_evidence(job, requirement, save_skill=True), {'fact_ids': [fact['id']]})
        self.assertEqual(self.w.read()['facts'], [original])

    def test_reused_skill_evidence_preserves_strength_and_duration(self):
        generic = self.add_job(requirements=['Kubernetes'])
        requirements = [
            'Familiarity with Kubernetes',
            'Knowledge of Kubernetes',
            'Understanding of Kubernetes',
            'Proficiency in Kubernetes',
            'Kubernetes proficiency',
            'Strong experience with Kubernetes',
            'Proven experience with Kubernetes',
            'Demonstrated experience with Kubernetes',
            '3 years of Kubernetes experience',
        ]
        stronger = self.add_job(
            title='Senior Platform Engineer', requirements=requirements,
            eligibility='confirmed',
        )
        generic_evidence = self.set_evidence(generic, 'Kubernetes', save_skill=True)
        state = self.s.state()
        result = matching.match(state['jobs'][1], {'include_unknown': True}, state['facts'])
        self.assertEqual(result['gaps'], requirements)
        self.assertFalse(result['eligible_for_preparation'])
        self.assertNotIn('matched_skill_evidence', state['jobs'][1])

        requirement = 'Proven experience with Kubernetes'
        evidence = self.set_evidence(stronger, requirement, save_skill=True)
        self.assertNotEqual(evidence, generic_evidence)
        equivalent = self.add_job(requirements=[requirement + ' required'])
        self.assertEqual(
            self.set_evidence(equivalent, equivalent['requirements'][0], save_skill=True),
            evidence,
        )
        self.assertEqual(len(self.w.read()['facts']), 2)

    def test_earlier_confirmation_can_be_explicitly_added_to_career_evidence(self):
        job = self.add_job(requirements=['Kubernetes'])
        self.assertEqual(self.set_evidence(job, 'Kubernetes'), {'confirmed': True})
        self.assertEqual(self.s.state()['facts'], [])
        self.set_evidence(job, 'Kubernetes', save_skill=True)
        state = self.w.read()
        fact, = state['facts']
        self.assertEqual(state['jobs'][0]['requirement_evidence']['Kubernetes'], {'fact_ids': [fact['id']]})
        self.s.action('retire', {'id': fact['id']})
        state = self.w.read()
        self.assertEqual(matching.match(state['jobs'][0], {}, state['facts'])['gaps'], ['Kubernetes'])
        self.assertNotIn('matched_skill_evidence', self.s.state()['jobs'][0])

    def test_details_link_to_the_exact_requirement_and_retry_without_duplicates(self):
        requirement = 'Manage Kubernetes clusters'
        job = self.add_job(requirements=[requirement, 'Terraform'])
        other = self.add_job(title='Operations Engineer', requirements=[requirement])
        # The note deliberately shares zero lexical tokens with the requirement.
        details = 'Deployed and upgraded EKS at a previous employer.'
        evidence = self.set_evidence(job, requirement, details=details)
        self.assertEqual(self.set_evidence(job, requirement, details=details), evidence)
        state = self.w.read()
        self.assertEqual(len(state['facts']), 1)
        fact, = state['facts']
        self.assertEqual(evidence, {'fact_ids': [fact['id']]})
        self.assertEqual(fact['text'], details)
        self.assertEqual(fact['source']['name'], 'User supplied note')
        self.assertEqual(fact['association'], '')
        self.assertEqual(fact['dates'], '')
        self.assertEqual(matching.available(state['facts']), [fact])
        result = matching.match(state['jobs'][0], {}, state['facts'])
        self.assertEqual(result['evidence'][0]['fact_ids'], [fact['id']])
        self.assertEqual(result['evidence'][1]['fact_ids'], [])
        self.assertEqual(result['fact_ids'], [fact['id']])
        self.assertEqual(matching.match(other, {}, state['facts'])['gaps'], [requirement])

    def test_listing_updates_preserve_links_but_require_current_exact_text(self):
        job = self.add_job(url='https://example.test/platform', requirements=['Manage Kubernetes clusters'])
        requirement = job['requirements'][0]
        evidence = self.set_evidence(job, requirement, details='Upgraded EKS.')
        refreshed = self.add_job(
            url=job['url'],
            requirements=['Manage production clusters'],
            requirement_evidence={'injected': {'confirmed': True}},
        )
        self.assertEqual(refreshed['id'], job['id'])
        self.assertEqual(refreshed['requirement_evidence'], {requirement: evidence})
        with self.assertRaisesRegex(ValueError, 'current listing'):
            self.set_evidence(job, requirement, details='A second note.')
        self.assertEqual(len(self.w.read()['facts']), 1)
        self.assertEqual(
            matching.match(refreshed, {}, self.w.read()['facts'])['gaps'],
            ['Manage production clusters'],
        )

    def test_retired_and_edited_facts_do_not_reassert_a_requirement(self):
        requirement = 'Manage Kubernetes clusters'
        job = self.add_job(requirements=[requirement])
        evidence = self.set_evidence(job, requirement, details='Upgraded EKS.')
        fact_id, = evidence['fact_ids']
        self.s.action('retire', {'id': fact_id})
        state = self.w.read()
        self.assertEqual(matching.match(state['jobs'][0], {}, state['facts'])['gaps'], [requirement])
        self.s.action('restore-fact', {'id': fact_id})
        self.s.action('fact', {'id': fact_id, 'text': 'Wrote a website.'})
        self.s.action('confirm', {'id': fact_id})
        state = self.w.read()
        self.assertEqual(state['jobs'][0]['requirement_evidence'].get(requirement, {}).get('fact_ids', []), [])
        self.assertEqual(matching.match(state['jobs'][0], {}, state['facts'])['gaps'], [requirement])

    def test_invalid_inputs_do_not_create_evidence(self):
        job = self.add_job(requirements=['Kubernetes'])
        for requirement, details in (
            ('Other skill', 'Built something.'),
            ('kubernetes', ''),
            ('Kubernetes', ['Not a string']),
            ('Kubernetes', 'x' * 2001),
        ):
            with self.subTest(requirement=requirement, details_type=type(details)):
                with self.assertRaises(ValueError):
                    self.set_evidence(job, requirement, details=details)
        for value in ('true', 1, None):
            with self.subTest(save_skill=value):
                with self.assertRaisesRegex(ValueError, 'boolean'):
                    self.set_evidence(job, 'Kubernetes', save_skill=value)
        state = self.w.read()
        self.assertEqual(state['facts'], [])
        self.assertNotIn('requirement_evidence', state['jobs'][0])
