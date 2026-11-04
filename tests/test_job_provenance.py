"""Editing job details must not manufacture a new source verification."""
import unittest
from unittest.mock import patch

import test_workflow


class JobProvenance(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def researched_job(self):
        _, _, job = self.seed()
        return self.s.action('job', {
            **job, 'source': 'greenhouse:example',
            'checked_at': '2026-10-01T09:00:00+00:00',
        })

    def test_detail_edits_preserve_omitted_provenance_by_id_or_url(self):
        job = self.researched_job()
        for identify_by_url in (False, True):
            with self.subTest(identify_by_url=identify_by_url):
                edited = {k: v for k, v in job.items()
                          if k not in ('source', 'checked_at')}
                edited['title'] = 'Updated software engineer'
                if identify_by_url:
                    edited.pop('id')
                saved = self.s.action('job', edited)
                self.assertEqual(
                    {k: saved[k] for k in ('id', 'source', 'checked_at')},
                    {k: job[k] for k in ('id', 'source', 'checked_at')},
                )

    def test_explicit_research_updates_replace_provenance(self):
        job = self.researched_job()
        saved = self.s.action('job', {
            **job, 'source': 'lever:updated',
            'checked_at': '2026-11-05T10:00:00+00:00',
        })
        self.assertEqual(saved['source'], 'lever:updated')
        self.assertEqual(saved['checked_at'], '2026-11-05T10:00:00+00:00')

    def test_new_manual_job_defaults_source_and_timestamp(self):
        with patch('employment_agency.service.now', return_value='2026-11-05T12:00:00+00:00'):
            saved = self.s.action('job', {
                'title': 'Software engineer', 'description': 'Build applications.',
            })
        self.assertEqual(saved['source'], 'manual')
        self.assertEqual(saved['checked_at'], '2026-11-05T12:00:00+00:00')
