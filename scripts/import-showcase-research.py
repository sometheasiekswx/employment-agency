"""Import reviewed public research into a new isolated SQLite workspace.

Run with a shared build supporting company-research-complete. The input profile
is the already-published redacted showcase bundle, never a private workspace.
Only public adverts, branding provenance and skill review recipes are emitted.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import re

from employment_agency.demo import DemoWorkspace
from employment_agency.service import Service
from employment_agency import company_logo_assets as assets
from employment_agency.store import digest, atomic
from employment_agency.workspaces import configure


def catalog_logo(service, employer_id, company, root):
    """Export only the asset verified by this attempt and its stored provenance."""
    logo = company.get('logo') or {}
    supplied = {'url': logo.get('page_url') or company['careers_url'],
                'evidence': logo.get('evidence') or 'Official company careers and branding page.'}
    if logo.get('local_path') and logo.get('url'):
        try:
            path = root / logo['local_path']
            normalized = assets.normalize(path.read_bytes(), mimetypes.guess_type(str(path))[0])
            assets.public_logo(logo['url'])
            supplied['expected_sha256'] = digest(normalized)
            if logo.get('selection', True):
                supplied['logo_url'] = logo['url']
        except (OSError, ValueError) as error:
            print(f"Logo candidate rejected for {company['name']}: {error}", flush=True)
    workspace = service.w
    try:
        result = service.action('company-logo-backfill', {
            'workspace_id': workspace.workspace_id, 'company_ids': [employer_id],
            'sources': {employer_id: supplied},
        })
    except (ValueError, OSError) as error:
        result = {'status': 'failure', 'reason': str(error)}
    outcome = next((entry for entry in result.get('companies', []) if entry['id'] == employer_id), result)
    if outcome.get('status') not in ('success', 'already_present'):
        return result, {'status': 'unavailable', 'page_url': supplied['url'],
                        'url': logo.get('url', ''), 'evidence': supplied['evidence'],
                        'reason': outcome.get('reason', 'Shared logo retrieval did not return a supported verified asset.')}

    employer = next(row for row in workspace.read()['employers'] if row['id'] == employer_id)
    stored = employer.get('logo') or {}
    sha256 = outcome.get('sha256')
    normalized = assets.read(workspace.path, sha256)
    if (not normalized or sha256 != stored.get('sha256')
            or sha256 != supplied.get('expected_sha256', sha256)
            or stored.get('page_url') != outcome.get('page_url')
            or stored.get('requested_page') != supplied['url']
            or stored.get('reviewed_url') != supplied.get('logo_url')
            or stored.get('evidence') != supplied['evidence'].strip()):
        raise ValueError(f"The stored logo for {company['name']} does not match the current verification receipt")
    logo_dir = root / 'employment_agency/demo_data/showcase_logos'
    logo_dir.mkdir(exist_ok=True)
    (logo_dir / f'{sha256}.png').write_bytes(normalized)
    return result, {'status': 'verified', 'sha256': sha256,
                    'url': stored['final_url'], 'page_url': stored['page_url'],
                    'evidence': stored['evidence'], 'checked_at': stored['retrieved_at']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--resume', action='store_true', help='Resume this isolated public research workspace')
    parser.add_argument('research', type=Path, nargs='+')
    args = parser.parse_args()
    if args.workspace.exists() and not args.resume:
        raise SystemExit('Use a new isolated workspace; existing data is never replaced')
    published = json.loads(args.profile.read_text())
    if not published.get('public_preview') or not published.get('demo_resume', {}).get('sha256'):
        raise SystemExit('Provide the approved public showcase bundle')
    companies = []
    previous = json.loads((args.root / 'employment_agency/demo_data/showcase_jobs.json').read_text())
    for path in args.research:
        companies.extend(json.loads(path.read_text())['companies'])
    if len({company['name'].casefold() for company in companies}) != len(companies):
        raise SystemExit('Combine cross-region employer research before importing')
    coverage = defaultdict(set)
    for company in companies:
        if not 1 <= len(company['jobs']) <= 7:
            raise SystemExit(f"Expected 1–7 distinct jobs at {company['name']}")
        for job in company['jobs']:
            coverage[job.get('destination', job['city'])].add(company['name'])
    destinations = set(published['state']['profiles'][0]['locations'])
    if set(coverage) != destinations or any(not 5 <= len(names) <= 10 for names in coverage.values()):
        raise SystemExit(f'Incomplete destination coverage: {dict((city, len(names)) for city, names in coverage.items())}')
    workspace = DemoWorkspace(args.workspace, sqlite=True)
    if args.resume:
        from employment_agency.workspaces import settings
        config = settings(workspace.path)
        existing = workspace.read()
        if (config.get('label') != 'Public showcase research' or not config.get('demo')
                or existing['applications'] or existing['identity'] != published['state']['identity']
                or existing['facts'] != published['state']['facts']
                or not {job['id'] for job in existing['jobs']} <= {job['id'] for c in companies for job in c['jobs']}):
            workspace.close()
            raise SystemExit('Resume requires the same isolated public research workspace and profile')
    service = Service(workspace)
    receipts = {'companies': [], 'logos': [], 'reviews': []}
    catalog = {'schema': 2, 'mode': 'reviewed', 'sources': [],
               'legacy_job_sources': previous.get('legacy_job_sources', previous.get('sources', [])),
               'reviewed_job_sources': previous.get('reviewed_job_sources', []),
               'checked_at': datetime.now(timezone.utc).isoformat(),
               'reviewed_resume_sha256': published['demo_resume']['sha256'],
               'companies': [], 'jobs': []}
    try:
        configure(workspace.path, {'demo': True, 'label': 'Public showcase research',
                                  'setup_complete': True, 'preferred_locations': sorted(destinations),
                                  'timezone': 'Australia/Melbourne'})
        with workspace.edit() as state:
            state['identity'] = published['state']['identity']
            state['facts'] = published['state']['facts']
            state['profiles'] = published['state']['profiles']
        profile_id = workspace.read()['profiles'][0]['id']
        facts = {fact['id']: fact for fact in workspace.read()['facts'] if fact.get('confirmed')}
        fields = {'id', 'title', 'employer', 'city', 'location', 'url', 'careers_url', 'description',
                  'requirements', 'availability', 'checked_at', 'posted_at', 'closes',
                  'eligibility', 'sponsorship', 'salary', 'work_arrangement', 'seniority'}
        for company in companies:
            name = company['name']
            print(f'Importing {name}', flush=True)
            receipts['companies'].append(service.action('company-research-check', {'name': name}))
            record = {'name': name, 'careers_url': company['careers_url'], 'listings': [], 'picks': []}
            for source in company['jobs']:
                job = {key: value for key, value in source.items() if key in fields}
                job['city'] = source.get('destination', source['city'])
                for key in ('eligibility_evidence', 'eligibility_note'):
                    if source.get(key):
                        job['description'] += ' ' + str(source[key])
                if job.get('availability') == 'open':
                    job['availability'] = 'retrieved'
                if 'work_model' in source and 'work_arrangement' not in job:
                    job['work_arrangement'] = source['work_model']
                job['source'] = 'reviewed:' + re.sub(r'[^a-z0-9]+', '-', name.casefold()).strip('-')
                service.action('job', job)
                evidence = source['evidence']
                if isinstance(evidence, dict):
                    evidence = json.dumps(evidence, ensure_ascii=False)
                binding = {'job_id': job['id'], 'source_url': job['url'],
                           'requisition': source.get('requisition') or job['id'], 'evidence': evidence}
                link = service.action('company-resolve', {**binding, 'name': name, 'verified': True})
                employer_id = link['employer_id']
                record['listings'].append(binding)
                catalog['jobs'].append(job)
            result, record['logo'] = catalog_logo(service, employer_id, company, args.root)
            receipts['logos'].append({'name': name, 'result': result})
            ids = [job['id'] for job in company['jobs']]
            if len(ids) > 2:
                target = {'workspace_id': workspace.workspace_id, 'profile_id': profile_id,
                          'employer_id': employer_id}
                basis = service.action('company-best-matches-basis', target)
                picks = company['picks']
                result = service.action('company-best-matches', {
                    **target, 'basis': basis['basis'], 'compared_job_ids': ids, 'picks': picks,
                })
                receipts['reviews'].append(result)
                for pick in picks:
                    terms = [facts[fact_id]['text'] for fact_id in pick['fact_ids']]
                    if any(facts[fact_id]['category'] != 'skill' for fact_id in pick['fact_ids']):
                        raise ValueError('Public recipes must cite skill facts without personal details')
                    record['picks'].append({'job_id': pick['job_id'], 'reason': pick['reason'], 'fact_terms': terms})
            catalog['companies'].append(record)
            (args.workspace.parent / 'import-receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
        final = service.action('company-research-complete', {
            'workspace_id': workspace.workspace_id, 'profile_id': profile_id,
            'job_ids': [job['id'] for job in catalog['jobs']],
        })
        if not final['completion']['ready']:
            raise ValueError('Research completion did not pass')
        catalog['completion'] = {'ready': True, 'checked_at': catalog['checked_at'],
                                 'jobs': len(catalog['jobs']), 'companies': len(catalog['companies'])}
        archive = {source['source']: source for source in catalog['reviewed_job_sources']}
        for company in catalog['companies']:
            ids = {item['job_id'] for item in company['listings']}
            jobs = [job for job in catalog['jobs'] if job['id'] in ids]
            key = jobs[0]['source']
            prior = archive.get(key, {})
            if prior and prior['employer'] != company['name']:
                raise ValueError('Reviewed source ownership changed; review the stored-choice migration')
            archive[key] = {'source': key, 'employer': company['name'],
                            'careers_url': company['careers_url'],
                            'posting_urls': sorted(set(prior.get('posting_urls', [])) | {job['url'] for job in jobs})}
        catalog['reviewed_job_sources'] = list(archive.values())
        atomic(args.root / 'employment_agency/demo_data/showcase_jobs.json',
               (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode())
        (args.workspace.parent / 'research-completion.json').write_text(json.dumps(final, indent=2) + '\n')
        print(json.dumps({'jobs': len(catalog['jobs']), 'companies': len(companies),
                          'coverage': {city: len(names) for city, names in coverage.items()},
                          'logos': sum(c['logo']['status'] == 'verified' for c in catalog['companies']),
                          'completion': True}), flush=True)
    finally:
        workspace.close()


if __name__ == '__main__':
    main()
