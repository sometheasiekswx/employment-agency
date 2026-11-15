"""Verify that the public catalog can replay only the current branding receipt."""
from contextlib import ExitStack, closing
import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from employment_agency import company_logo_assets, company_logo_pages
from employment_agency.demo import DemoWorkspace
from employment_agency.service import Service
from employment_agency.store import digest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'import-showcase-research.py'
SPEC = importlib.util.spec_from_file_location('import_showcase_research', SCRIPT)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


class ReviewedLogoImport(unittest.TestCase):
    def test_failed_reverification_does_not_export_cached_logo(self):
        with tempfile.TemporaryDirectory() as temporary, ExitStack() as stack:
            root = Path(temporary)
            (root / 'employment_agency/demo_data').mkdir(parents=True)
            body = BytesIO()
            Image.new('RGBA', (32, 32), 'navy').save(body, format='PNG')
            local = root / 'mark.png'
            local.write_bytes(body.getvalue())
            normalized = company_logo_assets.normalize(body.getvalue(), 'image/png')
            sha256 = digest(normalized)
            original_page = 'https://example.org/branding'
            original_url = 'https://example.org/mark.png'
            company = {
                'name': 'Example Engineering', 'careers_url': 'https://example.org/jobs',
                'logo': {
                    'page_url': original_page, 'url': original_url, 'local_path': local.name,
                    'selection': None, 'evidence': '  The official page declares this mark.  ',
                },
            }

            workspace = stack.enter_context(closing(DemoWorkspace(root / 'workspace', sqlite=True)))
            service = Service(workspace)
            listing_url = 'https://example.org/jobs/engineer'
            job = service.action('job', {
                'title': 'Engineer', 'employer': company['name'], 'location': 'London',
                'url': listing_url, 'description': 'Build software services.',
            })
            link = service.action('company-resolve', {
                'job_id': job['id'], 'name': company['name'], 'source_url': listing_url,
                'evidence': 'The official listing identifies the employer.', 'verified': True,
            })
            employer_id = link['employer_id']
            with (
                patch.object(company_logo_pages, 'fetch', return_value=(original_url, original_page)),
                patch.object(company_logo_assets, 'retrieve', return_value=(normalized, original_url)),
                patch.object(service, 'action', wraps=service.action) as action,
            ):
                success, logo = importer.catalog_logo(service, employer_id, company, root)
            supplied = action.call_args.args[1]['sources'][employer_id]
            self.assertEqual(supplied['expected_sha256'], sha256)
            self.assertNotIn('logo_url', supplied)
            self.assertEqual(success['companies'][0]['status'], 'success')
            self.assertEqual(logo['status'], 'verified')
            self.assertEqual((logo['page_url'], logo['url']), (original_page, original_url))
            self.assertEqual(logo['evidence'], 'The official page declares this mark.')
            target = root / 'employment_agency/demo_data/showcase_logos' / f'{sha256}.png'
            self.assertEqual(target.read_bytes(), normalized)
            target.unlink()

            retry_page = 'https://example.org/media'
            company['logo'].update(page_url=retry_page, evidence='A different branding source.')
            with patch.object(company_logo_pages, 'fetch', return_value=(None, retry_page)):
                failure, rejected = importer.catalog_logo(service, employer_id, company, root)
            self.assertEqual(failure['companies'][0]['status'], 'missing')
            self.assertEqual(rejected['status'], 'unavailable')
            self.assertEqual(rejected['page_url'], retry_page)
            self.assertFalse(target.exists())
            self.assertEqual(company_logo_assets.read(workspace.path, sha256), normalized)
