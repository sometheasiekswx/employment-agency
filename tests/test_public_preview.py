"""The public preview can only publish the fixed fictional Service snapshot."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pypdf import PdfReader
from docx import Document

from employment_agency.public_preview import export_preview


class PublicPreviewExport(unittest.TestCase):
    def test_service_snapshot_and_documents_are_fictional_and_portable(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'demo'
            with patch('urllib.request.urlopen', side_effect=AssertionError('No external request allowed')), patch.dict('os.environ', {'OPENAI_API_KEY': 'never-export-this-key', 'SUPABASE_SERVICE_ROLE_KEY': 'never-export-this-secret'}):
                summary = export_preview(destination)
            bundle = json.loads((destination / 'preview.json').read_text())
            self.assertEqual(summary['jobs'], 6)
            self.assertEqual(summary['applications'], 3)
            self.assertTrue(bundle['public_preview'])
            self.assertTrue(bundle['state']['_workspace']['demo'])
            self.assertEqual(bundle['state']['identity']['email'], 'alex@example.test')
            self.assertEqual(bundle['state']['_workspace']['path'], 'public-fictional-preview')
            self.assertEqual(bundle['state']['consents'], {})
            self.assertEqual(bundle['state']['runs'], [])
            serialized = json.dumps(bundle)
            for forbidden in (temporary, '/Users/', 'never-export-this-key', 'never-export-this-secret'):
                self.assertNotIn(forbidden, serialized)
            for url in set(bundle['files'].values()):
                self.assertRegex(url, r'^/demo/files/[a-f0-9]{24}\.[a-z]+$')
                path = destination / url.removeprefix('/demo/')
                self.assertTrue(path.is_file())
                if path.suffix == '.pdf':
                    body = ' '.join(page.extract_text() for page in PdfReader(path).pages)
                    self.assertIn('Fictional sample profile', body)
                if path.suffix == '.docx':
                    body = ' '.join(paragraph.text for paragraph in Document(path).paragraphs)
                    self.assertIn('Fictional sample profile', body)
            self.assertEqual(len(bundle['documents']), 3)
            self.assertTrue(all(not job['url'] for job in bundle['state']['jobs']))
            profile = bundle['state']['profiles'][0]
            self.assertEqual(len(bundle['rankings'][profile['id']]), 6)

    def test_export_refuses_unrelated_or_extra_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'demo'
            destination.mkdir()
            sentinel = destination / 'keep.txt'
            sentinel.write_text('preserve this file')
            with self.assertRaisesRegex(ValueError, 'Refusing'):
                export_preview(destination)
            self.assertEqual(sentinel.read_text(), 'preserve this file')
            sentinel.unlink()
            destination.rmdir()
            export_preview(destination)
            sentinel.write_text('preserve this file')
            with self.assertRaisesRegex(ValueError, 'unrelated files'):
                export_preview(destination)
            self.assertEqual(sentinel.read_text(), 'preserve this file')


if __name__ == '__main__':
    unittest.main()
