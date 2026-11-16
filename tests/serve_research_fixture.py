"""A real local app with controlled public-source boundaries and no employer traffic."""

import argparse
from io import BytesIO
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

from PIL import Image

from employment_agency import company_logo_assets, public_pages, sources, store
from employment_agency.discovery_fetch import Fetch
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.workspaces import configure


def page(url, **kwargs):
    names = {'https://alpha.example.test/careers': 'Fictional Alpha',
             'https://beta.example.test/careers': 'Fictional Beta'}
    if url not in names:
        raise sources.SourceError('Unexpected fictional source')
    posting = {'@type': 'JobPosting', 'title': 'Platform Engineer',
               'hiringOrganization': {'@type': 'Organization', 'name': names[url],
                                      'url': url.removesuffix('careers')},
               'description': 'Build Python services and integration tests.',
               'url': url + '/platform-engineer'}
    body = '<script type="application/ld+json">' + json.dumps(posting) + '</script>'
    return 'http', public_pages.html_page(body, url)


def branding(url, names, deadline, **kwargs):
    if url == 'https://alpha.example.test/':
        return url + 'logo.png', url
    if url == 'https://beta.example.test/':
        return None, url
    raise sources.SourceError('Unexpected fictional branding source')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='ea-research-browser-') as folder:
        workspace = store.Workspace(Path(folder), sqlite=True)
        configure(workspace.path, {'setup_complete': True, 'timezone': 'UTC'})
        service = Service(workspace)
        service.action('identity', {'name': 'Fictional Applicant', 'email': 'test@example.test'})
        fact = service.action('fact', {'text': 'Built Python services and integration tests.'})
        service.action('confirm', {'id': fact['id']})
        service.action('profile', {'name': 'Engineering', 'roles': ['Engineer'],
                                   'include_unknown': True, 'include_stretch': True})
        raw = BytesIO()
        Image.new('RGB', (48, 24), '#285ce0').save(raw, format='PNG')
        bitmap = company_logo_assets.normalize(raw.getvalue(), 'image/png')
        def retrieve(url, deadline):
            if url != 'https://alpha.example.test/logo.png':
                raise sources.SourceError('Unexpected fictional logo')
            return bitmap, url
        with patch.object(Fetch, 'page', side_effect=page), \
                patch('employment_agency.company_logo_pages.fetch', side_effect=branding), \
                patch('employment_agency.company_logo_assets.retrieve', side_effect=retrieve):
            with server(service, args.port) as http:
                http.serve_forever()
