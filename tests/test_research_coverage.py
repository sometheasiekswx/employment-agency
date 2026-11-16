"""Retain known limits and unresolved listings in a research task's receipts."""

import json
import unittest
from unittest.mock import patch

from employment_agency import public_pages
from employment_agency.discovery_fetch import Fetch
import test_company_avoid


class ResearchCoverage(unittest.TestCase):
    setUp = test_company_avoid.CompanyAvoid.setUp
    seed = test_company_avoid.CompanyAvoid.seed

    def tearDown(self):
        if self.s.discovery:
            self.s.discovery.close()
        test_company_avoid.CompanyAvoid.tearDown(self)

    def start(self):
        return self.s.action('company-research-start', {
            'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id'],
        })['id']

    def receipts(self, research_id):
        return self.s.action('company-research-status', {
            'workspace_id': self.w.workspace_id, 'research_id': research_id,
        })['sources']

    def discover(self, root, read_page):
        research_id = self.start()
        with patch.object(Fetch, 'page', side_effect=lambda url, **_: ('http', read_page(url))):
            self.s.action('discovery-start', {
                'research_id': research_id, 'profile_id': self.profile['id'], 'urls': [root],
            })
            result = self.s.discovery.wait()
        self.assertEqual(result['status'], 'complete', result)
        return self.receipts(research_id)

    def page(self, url, *, links=(), jobs=(), title='Careers'):
        return {'url': url, 'title': title, 'text': 'Fictional careers page with readable text.',
                'links': [{'url': link, 'title': 'See positions'} for link in links],
                'jobs': list(jobs)}

    def test_links_not_followed_at_the_per_page_limit_leave_a_gap(self):
        root = 'https://example.test/careers'
        links = [f'{root}/role-{number}' for number in range(6)]

        def page(url):
            return (self.page(url, links=links) if url == root else
                    self.page(url, jobs=[{**self.first, 'id': None, 'url': url}]))

        receipts = self.discover(root, page)
        parent = next(row for row in receipts if row['url'] == root)
        self.assertEqual(parent['status'], 'partial')
        self.assertIn('links', parent['note'])
        checked = {row['url'] for row in receipts if row['jobs']}
        self.assertEqual(checked, set(links[:5]))

    def test_links_beyond_the_follow_depth_leave_a_gap(self):
        root = 'https://example.test/careers'
        sites = [root, root + '/a', root + '/b', root + '/unseen-role']

        def page(url):
            return self.page(url, links=sites[sites.index(url) + 1:sites.index(url) + 2])

        receipts = self.discover(root, page)
        source = {row['url']: row for row in receipts}
        self.assertNotIn(sites[-1], source)
        self.assertEqual(source[sites[-2]]['status'], 'partial')
        self.assertIn('depth', source[sites[-2]]['note'])

    def test_a_readable_unstructured_vacancy_remains_a_gap(self):
        root = 'https://example.test/jobs/infrastructure-engineer'
        receipt, = self.discover(root, lambda url: self.page(url, title='Infrastructure Engineer'))
        self.assertEqual(receipt['status'], 'partial')
        self.assertIn('review', receipt['note'].lower())
        self.assertEqual(receipt['jobs'], {})

    def test_structured_listings_beyond_the_parser_cap_leave_a_gap(self):
        root = 'https://example.test/careers'
        postings = [{'@type': 'JobPosting', 'url': f'{root}/role-{index}',
                     'title': f'Engineer {index}', 'description': 'Design fictional web services.',
                     'hiringOrganization': {'name': 'Fictional Systems'}}
                    for index in range(41)]
        body = '<script type="application/ld+json">' + json.dumps(postings) + '</script>'
        receipt, = self.discover(root, lambda url: public_pages.html_page(body, url))
        self.assertEqual(receipt['status'], 'partial')
        self.assertIn('structured listings', receipt['note'])
        self.assertEqual(len(receipt['jobs']), 40)

    def test_structured_and_unstructured_links_on_the_same_page_are_checked(self):
        root = 'https://example.test/careers'
        structured, plain = root + '/platform-engineer', root + '/support-engineer'
        board_url = 'https://job-boards.greenhouse.io/fictional'
        board_job = board_url + '/jobs/1'
        linked = [structured, plain, board_url]

        def page(url):
            if url == root:
                return self.page(url, links=linked, jobs=[{**self.first, 'id': None, 'url': structured}])
            return self.page(url, jobs=[{**self.first, 'id': None, 'url': url}])

        with patch.object(Fetch, 'feed', return_value=[{**self.first, 'id': None, 'url': board_job}]):
            receipts = self.discover(root, page)
        checked = {row['url'] for row in receipts}
        self.assertEqual(checked, {root, plain, board_url})
        self.assertEqual(sum(len(row['jobs']) for row in receipts), 3)
        self.assertTrue(all(row['status'] == 'retrieved' for row in receipts))

    def test_identical_structured_duplicates_do_not_create_a_gap(self):
        root = 'https://example.test/careers'
        posting = {'@type': 'JobPosting', 'url': root + '/engineer', 'title': 'Engineer',
                   'description': 'Design fictional web services.',
                   'hiringOrganization': {'name': 'Fictional Systems'}}
        body = '<script type="application/ld+json">' + json.dumps([posting, posting]) + '</script>'
        with patch('employment_agency.sources.now', side_effect=['first parse', 'second parse']):
            page = public_pages.html_page(body, root)
        self.assertEqual(len(page['jobs']), 1)
        self.assertNotIn('note', page)

    def test_registered_smartrecruiters_detail_limit_leaves_a_gap(self):
        research_id = self.start()
        source = self.s.action('source', {'kind': 'smartrecruiters', 'board': 'fictional'})
        listings = [{**self.first, 'id': None, 'url': f'https://jobs.smartrecruiters.com/fictional/{index}',
                     'source': 'smartrecruiters:fictional'} for index in range(13)]
        with (patch.object(Fetch, 'feed', return_value=listings),
              patch.object(Fetch, 'enrich', side_effect=lambda job: job)):
            result = self.s.action('company-research-source', {
                'name': self.first['employer'], 'source_id': source['id'], 'research_id': research_id,
                'evidence_url': 'https://example.test/careers',
            })
        receipt, = self.receipts(research_id)
        self.assertEqual(result['count'], 12)
        self.assertEqual(receipt['status'], 'partial')
        self.assertIn('details', receipt['note'])
        self.assertEqual(set(receipt['jobs']), set(result['job_ids']))
