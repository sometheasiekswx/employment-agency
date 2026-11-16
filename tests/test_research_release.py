"""Verify research handoff entry points against a fictional workspace."""

from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from employment_agency import sources
from employment_agency.discovery_fetch import Fetch
from employment_agency.store import Workspace
import test_company_avoid


class ResearchRelease(unittest.TestCase):
    def test_cli_reads_the_bundled_guide_without_input(self):
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / 'workspace'
            with patch.dict('os.environ', {'EA_CONFIG_HOME': str(Path(temporary) / 'config')}):
                with closing(Workspace(path, sqlite=True)):
                    pass
                result = subprocess.run(
                    [sys.executable, '-m', 'employment_agency', '--workspace', str(path),
                     'action', 'research-workflow'],
                    input='', text=True, capture_output=True, timeout=10,
                )
        self.assertEqual(result.returncode, 0, result.stderr)
        workflow = json.loads(result.stdout)
        self.assertEqual(workflow['sha256'], sha256(workflow['text'].encode()).hexdigest())
        self.assertIn('company-research-start', workflow['text'])


class ResearchSourceIdentity(unittest.TestCase):
    setUp = test_company_avoid.CompanyAvoid.setUp
    seed = test_company_avoid.CompanyAvoid.seed

    def tearDown(self):
        if self.s.discovery:
            self.s.discovery.close()
        test_company_avoid.CompanyAvoid.tearDown(self)

    def scope(self):
        return {'workspace_id': self.w.workspace_id, 'profile_id': self.profile['id']}

    def start(self):
        return self.s.action('company-research-start', self.scope())['id']

    def board(self, name):
        return self.s.action('source', {'kind': 'greenhouse', 'board': name})

    def refresh(self, research_id, source, **args):
        return self.s.action('company-research-source', {
            'name': self.first['employer'], 'source_id': source['id'], 'research_id': research_id, **args,
        })

    def missing_receipts(self, research_id, *job_ids):
        assessment = self.s.action('company-research', {
            **self.scope(), 'research_id': research_id, 'job_ids': list(job_ids),
        })
        return [row['job_id'] for row in assessment['completion']['blockers']
                if row['code'] == 'source_check_missing']

    def test_independent_registered_boards_can_share_a_careers_page(self):
        run = self.start()
        checked = []
        evidence_url = 'https://fictional.example.test/careers'
        for name in ('fictional-engineering', 'fictional-research'):
            board = self.board(name)
            listing = {**self.first, 'id': None, 'source': f'greenhouse:{name}',
                       'url': f'https://job-boards.greenhouse.io/{name}/jobs/1'}
            with patch('employment_agency.service.sources.discover', return_value=[listing]):
                result = self.refresh(run, board, evidence_url=evidence_url)
            self.assertEqual(len(result['job_ids']), 1)
            checked.extend(result['job_ids'])
        self.assertEqual(self.missing_receipts(run, *checked), [])

    def test_failed_board_retry_invalidates_success_across_lookup_paths(self):
        board = self.board('fictional')
        proof = 'https://fictional.example.test/careers'
        listing = {**self.first, 'source': 'greenhouse:fictional'}
        for retry in ('board ID without ownership proof', 'discovery board URL'):
            with self.subTest(retry=retry):
                run = self.start()
                with patch('employment_agency.service.sources.discover', return_value=[listing]):
                    result = self.refresh(run, board, evidence_url=proof)
                self.assertEqual(result['job_ids'], [self.first['id']])
                self.assertEqual(self.missing_receipts(run, self.first['id']), [])
                failure = sources.SourceError('Fictional board did not return a result')
                if retry == 'board ID without ownership proof':
                    with patch('employment_agency.service.sources.discover', side_effect=failure):
                        self.assertIn('error', self.refresh(run, board))
                else:
                    with patch.object(Fetch, 'feed', side_effect=failure):
                        self.s.action('discovery-start', {
                            'profile_id': self.profile['id'], 'research_id': run,
                            'urls': ['https://job-boards.greenhouse.io/fictional'],
                        })
                        self.assertEqual(self.s.discovery.wait()['sources'][0]['status'], 'failed')
                self.assertEqual(self.missing_receipts(run, self.first['id']), [self.first['id']])

    def test_failed_page_retry_recognizes_equivalent_url(self):
        run = self.start()
        scope = {'workspace_id': self.w.workspace_id, 'research_id': run}
        self.s.action('company-research-record', {
            **scope, 'url': self.first['url'], 'job_ids': [self.first['id']],
            'status': 'retrieved', 'evidence': 'The fictional original listing was readable.',
        })
        self.assertEqual(self.missing_receipts(run, self.first['id']), [])
        retry_url = 'https://EXAMPLE.test:443/job#listing'
        failure = self.s.action('company-research-record', {
            **scope, 'url': retry_url, 'job_ids': [], 'status': 'blocked',
            'evidence': 'The same fictional listing now blocks retrieval.',
        })
        self.assertEqual(failure['url'], retry_url)
        self.assertEqual(self.missing_receipts(run, self.first['id']), [self.first['id']])
