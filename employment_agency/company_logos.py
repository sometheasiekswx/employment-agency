"""Workspace-owned company logos and their historical enrichment."""

from collections import Counter, defaultdict
from time import monotonic
from urllib.parse import urlsplit, urlunsplit

from . import companies, company_logo_assets as assets, company_logo_pages as branding
from .store import digest, now


BACKFILL_LIMIT = 5
SOURCE_LIMIT = 2


def logo_hash(employer):
    logo = employer.get('logo')
    return logo.get('sha256') if isinstance(logo, dict) else None


def logo_urls(root, state):
    urls, verified = {}, {}
    for employer in state.get('employers', []):
        sha256 = logo_hash(employer)
        if not isinstance(sha256, str):
            continue
        if sha256 not in verified:
            verified[sha256] = assets.read(root, sha256) is not None
        if verified[sha256]:
            urls[employer['id']] = f'/api/company-logo/{sha256}.png'
    return urls


def logo_bytes(workspace, sha256):
    with workspace.lock:
        if not workspace.database or not any(
            logo_hash(employer) == sha256 for employer in workspace.database.collection('employers')
        ):
            return None
        return assets.read(workspace.path, sha256)


def decorate_jobs(root, state, jobs):
    """Supply the same optional logo on independently projected rank rows."""
    logos = logo_urls(root, state)
    employers = {row['id']: row for row in state.get('employers', [])}
    links = {row['id']: row for row in state.get('employer_links', [])}
    for job in jobs:
        link = links.get(job['id'])
        employer = employers.get(link['employer_id']) if link else None
        if employer and employer['id'] in logos and not companies.employer_evidence_conflict(job, employer):
            job['company'] = {'id': employer['id'], 'name': employer['name'],
                              **job.get('company', {}), 'logo_url': logos[employer['id']]}
        evidence = job.get('employer_evidence')
        if isinstance(evidence, dict) and 'logo' in evidence:
            job['employer_evidence'] = {key: value for key, value in evidence.items() if key != 'logo'}


def published_hint(listing, employer, official_pages):
    """Require both current job identity and independent publisher provenance."""
    evidence = listing.get('employer_evidence') or {}
    hint = evidence.get('logo')
    if (not isinstance(hint, dict) or evidence.get('source') != 'published-hiring-employer'
            or companies.employer_evidence_conflict(listing, employer)):
        return None
    try:
        page = branding.page_address(hint.get('page_url'))
        advertised = branding.page_address(evidence.get('url'))
        image = assets.public_logo(hint.get('url')).geturl()
    except ValueError:
        return None
    if not assets.same_host(page.hostname, advertised.hostname):
        return None
    if any(assets.same_host(page.hostname, branding.page_address(official).hostname)
           for official in official_pages):
        return {'source': 'published-hiring-organization', 'page_url': page.geturl(), 'url': image}
    return None


def pages_by_employer(state):
    """Use explicit publisher ownership evidence, independently of listing identity."""
    paths = defaultdict(list)
    employers = {row['id']: row for row in state.get('employers', [])}
    jobs = {row['id']: row for row in state['jobs']}
    for link in state.get('employer_links', []):
        evidence = link.get('publisher_provenance')
        employer, job = employers.get(link['employer_id']), jobs.get(link['id'])
        if (not isinstance(evidence, dict) or not evidence.get('evidence') or not employer or not job
                or companies.employer_evidence_conflict(job, employer)):
            continue
        try:
            page = branding.page_address(evidence.get('url'))
            listing = urlsplit(job.get('url', ''))
        except ValueError:
            continue
        if listing.hostname and assets.same_host(page.hostname, listing.hostname):
            paths[employer['id']].append(page.geturl())
    sources = {row['id']: row.get('employer_provenance') or {} for row in state['sources']}
    for employer in employers.values():
        logo = employer.get('logo')
        if isinstance(logo, dict) and logo.get('source') == 'operator-verified-branding' and logo.get('evidence'):
            paths[employer['id']].append(logo.get('requested_page'))
        for source_id in employer.get('source_ids', []):
            evidence = sources.get(source_id, {})
            if evidence.get('source') == 'verified-employer-board':
                paths[employer['id']].append(evidence.get('url'))
    pages = {employer_id: canonical_pages(urls) for employer_id, urls in paths.items()}
    hosts, owners = {}, defaultdict(set)
    for employer_id, urls in pages.items():
        for url in urls:
            hosts[url] = assets.host_key(branding.page_address(url).hostname)
            owners[hosts[url]].add(employer_id)
    return {employer_id: [url for url in urls if len(owners[hosts[url]]) == 1]
            for employer_id, urls in pages.items()}


def canonical_pages(urls):
    pages = {}
    for url in urls:
        try:
            page = branding.page_address(url)
        except ValueError:
            continue
        pages.setdefault(urlunsplit(('https', page.netloc, '/', '', '')), None)
        pages.setdefault(page.geturl(), None)
    return list(pages)


def enrich_discovered(workspace, job_ids, *, deadline=None):
    """Best-effort branding for newly read listings, outside their import transaction."""
    if not job_ids:
        return
    deadline = min(deadline or float('inf'), monotonic() + 2)
    try:
        state = workspace.read()
        links = {row['id']: row['employer_id'] for row in state.get('employer_links', [])}
        employers = {row['id']: row for row in state.get('employers', [])}
        pages = pages_by_employer(state)
        wanted = set(job_ids)
        handled = set()
        for job in state['jobs']:
            if monotonic() >= deadline or len(handled) >= 3:
                return
            employer = employers.get(links.get(job['id'])) if job['id'] in wanted else None
            if not employer or employer['id'] in handled or assets.read(workspace.path, logo_hash(employer)):
                continue
            hint = published_hint(job, employer, pages.get(employer['id'], []))
            if not hint:
                continue
            handled.add(employer['id'])
            try:
                body, final = assets.retrieve(hint['url'], deadline)
                store_logo(workspace, employer, hint, body, final, job_id=job['id'])
            except assets.RETRIEVAL_ERRORS:
                continue
    except assets.RETRIEVAL_ERRORS:
        return


def saved_logo(root, employer, supplied=None):
    sha256 = logo_hash(employer)
    if not assets.read(root, sha256):
        return None
    logo = employer['logo']
    if supplied:
        expected = supplied.get('expected_sha256')
        if expected and sha256 != expected:
            return {'status': 'failure', 'reason': 'The saved logo differs from the reviewed logo',
                    'sha256': sha256, 'page_url': logo.get('page_url')}
        if (logo.get('source') != 'operator-verified-branding'
                or logo.get('requested_page') != supplied['url']
                or logo.get('reviewed_url') != supplied.get('logo_url')
                or logo.get('evidence') != supplied['evidence'].strip()):
            return None
    return {'status': 'already_present', 'sha256': sha256, 'page_url': logo.get('page_url')}


def store_logo(workspace, employer, provenance, data, final_url, *, job_id=None, supplied=None):
    sha256 = digest(data)
    if supplied and (expected := supplied.get('expected_sha256')) and sha256 != expected:
        raise LogoMismatch('The logo retrieved from the official source differs from the reviewed logo')
    with workspace.edit() as state:
        current = companies.by_id(state.get('employers', []), employer['id'])
        if not current or (current['name'], current.get('aliases')) != (employer['name'], employer.get('aliases')):
            raise ValueError('Employer identity changed during retrieval. Read the inventory again.')
        if result := saved_logo(workspace.path, current, supplied):
            return result
        pages = pages_by_employer(state).get(employer['id'], [])
        if job_id:
            listing = companies.by_id(state['jobs'], job_id)
            link = companies.employer_link(state, job_id)
            if not listing or not link or link['employer_id'] != current['id'] or (
                published_hint(listing, current, pages) != provenance
            ):
                raise ValueError('The verified listing evidence changed during retrieval')
        elif provenance['source'] == 'verified-branding-page' and provenance['requested_page'] not in pages:
            raise ValueError('The verified branding source changed during retrieval')
        current_hash = logo_hash(current)
        if current_hash and current_hash != sha256 and assets.read(workspace.path, current_hash):
            raise LogoMismatch('The saved logo differs from the image found on the selected official source')
        assets.persist(workspace.path, data)
        current['logo'] = {'sha256': sha256, **provenance, 'final_url': final_url, 'retrieved_at': now()}
        return {'status': 'success', 'sha256': sha256, 'page_url': provenance['page_url']}


class LogoMismatch(ValueError):
    """Reviewed and current logo bytes differ."""


def inventory(workspace, args):
    if args:
        raise ValueError('company-logo-inventory takes no arguments')
    state = workspace.read()
    return {'workspace': str(workspace.path), 'workspace_id': workspace.workspace_id,
            'companies': inventory_entries(workspace.path, state)}


def inventory_entries(root, state):
    employers = state.get('employers', [])
    logos = logo_urls(root, state)
    sites = pages_by_employer(state)
    entries = {row['id']: {'id': row['id'], 'employer_id': row['id'], 'name': row['name'],
                           'aliases': row.get('aliases', []), 'sources': sites.get(row['id'], []),
                           'job_ids': [], 'application_ids': [], 'history_ids': [], 'attempt_ids': [],
                           'status': 'already_present' if row['id'] in logos else 'missing'}
               for row in employers}
    links = {row['id']: row['employer_id'] for row in state.get('employer_links', [])}
    jobs = {row['id']: row for row in state['jobs']}

    def reference(name, employer_id, kind, identifier):
        entry = entries.get(employer_id)
        if not entry:
            key = 'unresolved-' + digest(companies.name_key(name).encode())[:24]
            entry = entries.setdefault(key, {'id': key, 'employer_id': None, 'name': name,
                                            'job_ids': [], 'application_ids': [], 'history_ids': [], 'attempt_ids': [],
                                            'status': 'unresolved'})
        if identifier not in entry[kind]:
            entry[kind].append(identifier)

    employers_by_id = {row['id']: row for row in employers}
    for job_id, job in jobs.items():
        employer_id = links.get(job_id)
        employer = employers_by_id.get(employer_id)
        if employer and companies.employer_evidence_conflict(job, employer):
            links.pop(job_id)
            employer_id = None
        reference(job.get('employer') or 'Unknown employer', employer_id, 'job_ids', job_id)
    represented_roles = set(jobs)
    for app in state['applications']:
        job_id = app.get('job_id')
        job = jobs.get(job_id, {})
        represented_roles.add(job_id or app['id'])
        reference(job.get('employer') or app.get('employer') or 'Unknown employer',
                  links.get(job_id), 'application_ids', app['id'])
    history_links = {row['id']: row['job_id'] for row in state.get('company_history_links', [])}
    for decision in state.get('historical_decisions', []):
        history_id = companies.history_id(decision)
        reference(decision.get('employer') or 'Unknown employer', links.get(history_links.get(history_id)),
                  'history_ids', history_id)
    for job_id in state.get('unlisted_removals', {}):
        if job_id not in represented_roles:
            reference('Unknown employer', links.get(job_id), 'job_ids', job_id)
    for attempt in state.get('submission_attempts', []):
        binding = attempt.get('binding') or {}
        job_id = binding.get('job_id')
        job = jobs.get(job_id, {})
        employer_id = links.get(job_id)
        if job_id not in jobs:
            employer_id = employer_id or binding.get('employer_id')
        reference(job.get('employer') or binding.get('employer') or 'Unknown employer',
                  employer_id, 'attempt_ids', attempt['id'])
    return sorted(entries.values(), key=lambda entry: (companies.name_key(entry['name']), entry['id']))


def backfill(workspace, args):
    if set(args) - {'workspace_id', 'company_ids', 'sources'} or args.get('workspace_id') != workspace.workspace_id:
        raise ValueError('Use the workspace ID returned by the current company logo inventory')
    selected = args.get('company_ids')
    if (not isinstance(selected, list) or not 1 <= len(selected) <= BACKFILL_LIMIT
            or any(not isinstance(value, str) for value in selected) or len(set(selected)) != len(selected)):
        raise ValueError(f'Choose 1 to {BACKFILL_LIMIT} distinct company IDs from the inventory')
    state = workspace.read()
    inventory = {row['id']: row for row in inventory_entries(workspace.path, state)}
    if not set(selected) <= inventory.keys():
        raise ValueError('The selected companies changed. Read the workspace inventory again.')
    supplied = args.get('sources', {})
    if not isinstance(supplied, dict) or not supplied.keys() <= set(selected):
        raise ValueError('Supply official branding evidence only for selected companies')
    for employer_id, evidence in supplied.items():
        if (not inventory[employer_id]['employer_id'] or not isinstance(evidence, dict)
                or not {'url', 'evidence'} <= evidence.keys()
                or evidence.keys() - {'url', 'evidence', 'expected_sha256', 'logo_url'}
                or not isinstance(evidence['evidence'], str)
                or not evidence['evidence'].strip() or len(evidence['evidence']) > 1000):
            raise ValueError('Identify the verified official branding page and its evidence for a confirmed employer')
        branding.page_address(evidence['url'])
        if 'expected_sha256' in evidence and (
            not isinstance(evidence['expected_sha256'], str) or not assets.SHA256.fullmatch(evidence['expected_sha256'])
        ):
            raise ValueError('Use the expected logo SHA-256 of the reviewed normalized PNG')
        if 'logo_url' in evidence:
            if 'expected_sha256' not in evidence:
                raise ValueError('Supply the expected logo SHA-256 when selecting an exact logo URL')
            assets.public_logo(evidence['logo_url'])
    entries = []
    employers = {row['id']: row for row in state.get('employers', [])}
    for entry in (inventory[key] for key in selected):
        employer = employers.get(entry['employer_id'])
        outcome = backfill_company(workspace, state, entry, employer, supplied.get(entry['id']))
        entries.append({**entry, **outcome})
    return {'workspace': str(workspace.path), 'workspace_id': workspace.workspace_id,
            'companies': entries, 'counts': dict(Counter(row['status'] for row in entries))}


def backfill_company(workspace, state, entry, employer, supplied):
    if not employer:
        return {'status': 'unresolved', 'reason': 'Confirm the hiring employer before adding a logo'}
    if companies.research_employer(state, employer['name']).get('id') != employer['id']:
        return {'status': 'unresolved', 'reason': 'The employer name is ambiguous in the workspace'}
    if result := saved_logo(workspace.path, employer, supplied):
        return result
    deadline = monotonic() + 4
    result = {'status': 'missing', 'reason': 'No verified official branding page is available'}
    selection = supplied.get('logo_url') if supplied else None
    if not supplied:
        job_ids = set(entry['job_ids'])
        for job in state['jobs']:
            if job['id'] in job_ids and (hint := published_hint(job, employer, entry['sources'])):
                result = try_logo(workspace, employer, hint, deadline, job_id=job['id'])
                if result['status'] in ('success', 'already_present'):
                    return result
                break
    pages = [supplied['url']] if supplied else entry['sources']
    names = {companies.name_key(name) for name in (employer['name'], *employer.get('aliases', []))}
    for page in list(dict.fromkeys(pages))[:SOURCE_LIMIT]:
        if monotonic() >= deadline:
            return {'status': 'failure', 'reason': 'Branding retrieval reached its time limit'}
        try:
            url, observed = branding.fetch(page, names, deadline, selection=selection)
            if not url:
                if result['status'] == 'missing':
                    reason = ('The selected logo URL was not declared on the official page' if selection
                              else 'No explicit matching logo was found on the official page')
                    result = {'status': 'missing', 'reason': reason}
                continue
            evidence = {'source': 'operator-verified-branding' if supplied else 'verified-branding-page',
                        'page_url': observed, 'requested_page': page, 'url': url}
            if supplied:
                evidence['evidence'] = supplied['evidence'].strip()
                if selection:
                    evidence['reviewed_url'] = selection
            result = try_logo(workspace, employer, evidence, deadline, supplied=supplied)
        except assets.UnsupportedLogo as exc:
            result = {'status': 'unsupported', 'reason': str(exc)}
        except assets.RETRIEVAL_ERRORS:
            result = {'status': 'failure', 'reason': 'The official branding page could not be safely retrieved'}
        if result['status'] in ('success', 'already_present'):
            return result
    return result


def try_logo(workspace, employer, evidence, deadline, *, job_id=None, supplied=None):
    try:
        bitmap, final = assets.retrieve(evidence['url'], deadline)
        return store_logo(workspace, employer, evidence, bitmap, final, job_id=job_id, supplied=supplied)
    except LogoMismatch as exc:
        return {'status': 'failure', 'reason': str(exc), 'page_url': evidence['page_url']}
    except assets.UnsupportedLogo as exc:
        return {'status': 'unsupported', 'reason': str(exc)}
    except assets.RETRIEVAL_ERRORS:
        return {'status': 'failure', 'reason': 'The logo could not be verified and saved'}
