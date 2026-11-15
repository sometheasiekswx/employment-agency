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
from employment_agency import companies as employer_records
from employment_agency import company_best_matches
from employment_agency import company_logo_assets as assets, company_logos, public_catalog
from employment_agency.sources import public_url
from employment_agency.store import digest, atomic
from employment_agency.workspaces import configure


def catalog_logo(service, employer_id, company, root):
    """Export only the asset verified by this attempt and its stored provenance."""
    logo = company.get('logo') or {}
    supplied = {'url': logo.get('page_url') or company['careers_url'],
                'evidence': logo.get('evidence') or 'Official company careers and branding page.'}
    if logo.get('local_path') and logo.get('url'):
        try:
            path = (root / logo['local_path']).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError('Keep reviewed logo bytes inside the public checkout')
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
                    'declared_url': stored['url'],
                    'requested_page': stored['requested_page'],
                    'reviewed_url': stored.get('reviewed_url'),
                    'evidence': stored['evidence'], 'checked_at': stored['retrieved_at']}


def validate_research(companies, excluded, previous, destinations):
    labels = {employer_records.name_key(company['name']): company for company in companies}
    if len(labels) != len(companies) or '' in labels:
        raise ValueError('Combine employer aliases and cross-region research before importing')
    baseline = previous.get('baseline_employers') or [row['name'] for row in previous['companies']]
    baseline_names = {employer_records.name_key(name) for name in baseline}
    exclusions = {employer_records.name_key(row['name']): row for row in excluded}
    if len(exclusions) != len(excluded) or exclusions.keys() != baseline_names - labels.keys():
        raise ValueError('Provide official logo coverage for exactly the excluded baseline employers')
    previously_verified = set(previous.get('baseline_verified_employers') or [
        row['name'] for row in previous['companies'] if (row.get('logo') or {}).get('status') == 'verified'
    ])
    if exclusions.keys() & {employer_records.name_key(name) for name in previously_verified}:
        raise ValueError('Retain every baseline employer with a verified logo')
    for row in excluded:
        attempts = row.get('attempts')
        if (not attempts
                or not all(attempt.get('status') and attempt.get('detail') for attempt in attempts)
                or any(attempt['status'] in ('verified', 'success', 'already_present') for attempt in attempts)):
            raise ValueError(f"Document the unsuccessful official logo attempts for {row['name']}")
        for attempt in attempts:
            public_url(attempt['page_url'])

    new_coverage = defaultdict(list)
    all_job_ids, all_urls = set(), set()
    for name, company in labels.items():
        jobs = company['jobs']
        localities = {job.get('destination', job['city']) for job in jobs}
        if not localities or not localities <= destinations:
            raise ValueError(f"Provide reviewed destination coverage for {company['name']}")
        requisitions = set()
        for job in jobs:
            requisition = job.get('requisition')
            if (not isinstance(requisition, str) or not requisition.strip() or requisition in requisitions
                    or job['id'] in all_job_ids
                    or job['url'] in all_urls or employer_records.name_key(job['employer']) != name):
                raise ValueError(f"Resolve duplicate or unverified role identity for {company['name']}")
            requisitions.add(requisition)
            all_job_ids.add(job['id'])
            all_urls.add(job['url'])
        if name not in baseline_names:
            if len(localities) != 1 or len(jobs) < 3:
                raise ValueError(f"Expected at least three credible local roles at {company['name']}")
            for job in jobs:
                fit = job.get('fit_rationale')
                if not isinstance(fit, str) or not fit.strip() or job.get('stretch'):
                    raise ValueError(f"Supply evidence of fit for every included role at {company['name']}")
                if (not job.get('location') or not job.get('requirements') or not job.get('evidence')
                        or not job.get('checked_at') or not job.get('eligibility')
                        or job.get('availability') not in ('retrieved', 'open')):
                    raise ValueError(f"Supply current source and advertised role evidence at {company['name']}")
            new_coverage[next(iter(localities))].append(company['name'])
        expected_picks = 2 if len(jobs) > 2 else 0
        picks = company.get('picks', [])
        if len(picks) != expected_picks:
            raise ValueError(f"Expected {expected_picks} reviewed picks at {company['name']}")
        if picks:
            try:
                company_best_matches.normalize_picks(picks)
            except ValueError as error:
                raise ValueError(f"Invalid picks at {company['name']}: {error}") from error
            if not {pick['job_id'] for pick in picks} <= {job['id'] for job in jobs}:
                raise ValueError(f"Compare only included vacancies at {company['name']}")
    if new_coverage.keys() != destinations or any(len(names) != 3 for names in new_coverage.values()):
        raise ValueError(f'Each destination needs exactly three globally distinct new employers: {dict(new_coverage)}')
    return baseline, sorted(previously_verified), dict(new_coverage)


def retain_verified_logo(service, employer_id, previous, root):
    logo = previous['logo']
    # The baseline release already verified this source. Recheck the exact
    # normalized bytes and restore the accepted provenance in the new workspace.
    sha256 = logo['sha256']
    if not assets.SHA256.fullmatch(sha256):
        raise ValueError('The baseline company has an invalid logo identifier')
    body = (root / 'employment_agency/demo_data/showcase_logos' / f'{sha256}.png').read_bytes()
    if digest(body) != sha256 or not assets.normalized_png(body):
        raise ValueError('The baseline company logo changed')
    employer = next(row for row in service.w.read()['employers'] if row['id'] == employer_id)
    outcome = company_logos.store_logo(service.w, employer, {
        'source': 'operator-verified-branding', 'page_url': logo['page_url'],
        'requested_page': logo.get('requested_page', logo['page_url']),
        'url': logo.get('declared_url', logo['url']), 'reviewed_url': logo.get('reviewed_url'),
        'evidence': logo['evidence'],
    }, body, logo['url'])
    return {'baseline_verification': True, 'companies': [outcome]}, logo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--exclusions', type=Path, required=True,
                        help='Official source attempts for excluded baseline employers')
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
    excluded = json.loads(args.exclusions.read_text())['companies']
    destinations = set(published['state']['profiles'][0]['locations'])
    baseline, verified, new_coverage = validate_research(companies, excluded, previous, destinations)
    skill_facts = {fact['id']: fact['text'] for fact in published['state']['facts']
                   if fact.get('confirmed') and fact['category'] == 'skill'}
    verified_baseline = {row['name']: row for row in previous['companies'] if row['name'] in verified}
    for company in companies:
        if any(fact_id not in skill_facts for pick in company.get('picks', []) for fact_id in pick['fact_ids']):
            raise ValueError(f"Public recipes at {company['name']} must cite confirmed skill facts")
        if company['name'] not in verified_baseline:
            logo = company.get('logo') or {}
            if any(not logo.get(key) for key in ('page_url', 'url', 'local_path', 'evidence')):
                raise ValueError(f"Supply official logo evidence and reviewed bytes for {company['name']}")
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
    catalog = {'schema': public_catalog.CATALOG_SCHEMA, 'mode': 'reviewed', 'sources': [],
               'baseline_employers': baseline, 'baseline_verified_employers': verified,
               'excluded_employers': excluded, 'new_employers_by_destination': new_coverage,
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
                if 'fit_rationale' in source:
                    binding['fit_rationale'] = source['fit_rationale']
                record['listings'].append(binding)
                catalog['jobs'].append(job)
            if name in verified_baseline:
                result, record['logo'] = retain_verified_logo(
                    service, employer_id, verified_baseline[name], args.root,
                )
            else:
                result, record['logo'] = catalog_logo(service, employer_id, company, args.root)
            receipts['logos'].append({'name': name, 'result': result})
            (args.workspace.parent / 'import-receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
            if record['logo']['status'] != 'verified':
                raise ValueError(f"Official logo verification failed at {name}: {record['logo']['reason']}")
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
                    terms = [skill_facts[fact_id] for fact_id in pick['fact_ids']]
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
        atomic(args.root / 'employment_agency/demo_data/showcase_jobs.json',
               (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode())
        (args.workspace.parent / 'research-completion.json').write_text(json.dumps(final, indent=2) + '\n')
        print(json.dumps({'jobs': len(catalog['jobs']), 'companies': len(companies),
                          'new_coverage': new_coverage,
                          'logos': sum(c['logo']['status'] == 'verified' for c in catalog['companies']),
                          'completion': True}), flush=True)
    finally:
        workspace.close()


if __name__ == '__main__':
    main()
