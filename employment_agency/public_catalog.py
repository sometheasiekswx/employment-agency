"""Restore a reviewed public catalog through the shared workspace operations.

The source contains public adverts, branding evidence and skill-only review
recipes. It contains neither a private workspace nor a résumé. Builds are
offline; research retrieves and verifies assets before adding them here.
"""
from pathlib import Path
import json
import re
import tempfile

from . import company_best_matches, company_logo_assets, company_logos
from .demo import DemoWorkspace
from .service import Service
from .store import digest
from .workspaces import configure


DATA = Path(__file__).with_name('demo_data')


def load_catalog():
    return json.loads((DATA / 'showcase_jobs.json').read_text(encoding='utf-8'))


def skill_key(text):
    return re.sub(r'^t\s*echnical\s*:\s*', '', text.strip(), flags=re.I).casefold()


def restore_companies(service, catalog):
    """Resolve reviewed employer evidence and restore hash-checked logo bytes."""
    if catalog.get('mode') != 'reviewed':
        return
    for company in catalog['companies']:
        employer_id = None
        for evidence in company['listings']:
            link = service.action('company-resolve', {
                'job_id': evidence['job_id'], 'name': company['name'],
                'source_url': evidence['source_url'], 'evidence': evidence['evidence'],
                'requisition': evidence['requisition'], 'verified': True,
            })
            if employer_id and employer_id != link['employer_id']:
                raise ValueError('The public catalog contains inconsistent employer identities')
            employer_id = link['employer_id']
        logo = company.get('logo') or {}
        if logo.get('status') != 'verified':
            continue
        sha256 = logo['sha256']
        if not re.fullmatch(r'[a-f0-9]{64}', sha256):
            raise ValueError('Invalid reviewed company logo hash')
        body = (DATA / 'showcase_logos' / f'{sha256}.png').read_bytes()
        if digest(body) != sha256 or not company_logo_assets.normalized_png(body):
            raise ValueError('The reviewed company logo changed or is invalid')
        employer = next(row for row in service.w.read()['employers'] if row['id'] == employer_id)
        company_logos.store_logo(service.w, employer, {
            'source': 'operator-verified-branding', 'page_url': logo['page_url'],
            'requested_page': logo['page_url'], 'reviewed_url': logo['url'],
            'evidence': logo['evidence'],
        }, body, logo['url'])


def save_reviews(service, catalog, profile_id):
    """Save the human-reviewed pair using a fresh shared comparison basis."""
    if catalog.get('mode') != 'reviewed':
        return
    state = service.w.read()
    facts = {skill_key(fact['text']): fact['id'] for fact in state['facts'] if fact.get('confirmed')}
    links = {link['id']: link['employer_id'] for link in state['employer_links']}
    for company in catalog['companies']:
        ids = [item['job_id'] for item in company['listings']]
        if len(ids) <= 2:
            if company.get('picks'):
                raise ValueError('Public highlights require more than two distinct roles')
            continue
        target = {'workspace_id': service.w.workspace_id, 'profile_id': profile_id,
                  'employer_id': links[ids[0]]}
        context = service.action('company-best-matches-basis', target)
        picks = []
        for pick in company['picks']:
            try:
                fact_ids = [facts[skill_key(term)] for term in pick['fact_terms']]
            except KeyError as error:
                raise ValueError('The public profile changed; review the company highlights again') from error
            picks.append({'job_id': pick['job_id'], 'reason': pick['reason'], 'fact_ids': fact_ids})
        service.action('company-best-matches', {
            **target, 'basis': context['basis'], 'compared_job_ids': ids, 'picks': picks,
        })


def republish_reviews(state, catalog, resume_sha256):
    """Revalidate recipes against the final approved public profile, offline."""
    if catalog.get('mode') != 'reviewed':
        return
    if resume_sha256 != catalog['reviewed_resume_sha256']:
        raise ValueError('The approved public résumé changed; review the catalog before publishing')
    with tempfile.TemporaryDirectory(prefix='ea-public-comparisons-') as temporary:
        workspace = DemoWorkspace(Path(temporary) / 'workspace', sqlite=True)
        try:
            configure(workspace.path, {'demo': True, 'setup_complete': True})
            with workspace.edit() as restored:
                for key in ('identity', 'facts', 'profiles', 'jobs', 'employers', 'employer_links'):
                    restored[key] = state[key]
            service = Service(workspace)
            for profile in state['profiles']:
                save_reviews(service, catalog, profile['id'])
            state['company_best_matches'] = company_best_matches.project(workspace.read())
        finally:
            workspace.close()


def export_logos(stage, workspace, state, rankings):
    assets = {}
    for employer in state.get('employers', []):
        sha256 = company_logos.logo_hash(employer)
        body = company_logo_assets.read(workspace, sha256)
        if body is None:
            continue
        relative = f'company-logos/{sha256}.png'
        path = stage / relative
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(body)
        assets[sha256] = '/demo/' + relative
    for job in [*state['jobs'], *(row['job'] for rows in rankings.values() for row in rows)]:
        company = job.get('company') or {}
        current = company.get('logo_url', '')
        sha256 = current.rsplit('/', 1)[-1].removesuffix('.png')
        if sha256 in assets:
            company['logo_url'] = assets[sha256]
    return assets
