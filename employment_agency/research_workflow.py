"""Build-local instructions and durable, task-scoped research receipts."""

from datetime import datetime, timedelta
from pathlib import Path
import json

from . import __version__, companies, company_logos, job_feeds, public_pages, sources
from .application_context import https_address, listing_sha256, selected_jobs
from .store import digest, encode, now, uid

GUIDE_PATH = Path(__file__).with_name('guides') / 'research.md'
SOURCE_MAX_AGE = timedelta(hours=24)


def guide():
    content = GUIDE_PATH.read_bytes()
    return {'package_version': __version__, 'sha256': digest(content),
            'path': str(GUIDE_PATH.resolve()), 'text': content.decode('utf-8')}


def get_run(state, research_id, profile_id=None):
    if not isinstance(research_id, str) or not research_id:
        raise ValueError('Start a company research task and supply its research_id')
    run = companies.by_id(state.get('research_runs', []), research_id)
    if not run or (profile_id is not None and run['profile_id'] != profile_id):
        raise ValueError('Use a research task for the current workspace and selected profile')
    if run.get('guide_sha256') != guide()['sha256']:
        raise ValueError('The research workflow changed. Read the current guide and start a new research task.')
    return run


def source_fingerprint(job):
    # SQLite snapshots sort nested dictionaries. Normalize before binding a
    # freshly imported job so storage round-trips do not invalidate its receipt.
    normalized = json.loads(json.dumps(job, sort_keys=True))
    return digest(encode([listing_sha256(normalized), normalized.get('careers_url'),
                          normalized.get('posted_at'), normalized.get('reposted_at')]))


def source_identity(receipt):
    """A board's ownership page is evidence, not the identity of the feed checked."""
    source = receipt.get('source')
    if isinstance(source, dict) and source.get('kind') and source.get('board'):
        return ('feed', source['kind'], source['board'])
    if url := receipt.get('url'):
        if selector := job_feeds.selector_for(url):
            return ('feed', *selector)
        parsed = sources.public_url(public_pages.clean_url(url))
        host = parsed.hostname.rstrip('.').lower()
        if ':' in host:
            host = '[' + host + ']'
        return ('page', parsed._replace(netloc=host, fragment='').geturl())
    return ('source', str(source))


def current_check(checked_at, reference):
    try:
        return timedelta(0) <= reference - datetime.fromisoformat(checked_at) <= SOURCE_MAX_AGE
    except (TypeError, ValueError, OverflowError):
        return False


def operation(workspace, action, args):
    if args.get('workspace_id') != workspace.workspace_id:
        raise ValueError('Provide the current workspace ID')
    if action == 'company-research-start':
        if set(args) != {'workspace_id', 'profile_id'}:
            raise ValueError('Provide the workspace and selected profile to start research')
        with workspace.edit() as state:
            if not isinstance(args['profile_id'], str) or not companies.by_id(state['profiles'], args['profile_id']):
                raise ValueError('Choose a search profile in this workspace')
            run = {'id': uid(), 'profile_id': args['profile_id'], 'started_at': now(),
                   'guide_sha256': guide()['sha256'], 'sources': [], 'logos': []}
            state.setdefault('research_runs', []).append(run)
            return {'workspace': str(workspace.path), 'workspace_id': workspace.workspace_id, **run}
    if action == 'company-research-status':
        if set(args) != {'workspace_id', 'research_id'}:
            raise ValueError('Provide the workspace and research task IDs')
        return {'workspace': str(workspace.path), 'workspace_id': workspace.workspace_id,
                **get_run(workspace.read(), args.get('research_id'))}
    if action != 'company-research-record':
        raise ValueError('Unknown research workflow operation')
    fields = {'workspace_id', 'research_id', 'url', 'status', 'job_ids', 'evidence'}
    if set(args) != fields or not https_address(args['url']):
        raise ValueError('Provide the research task, public HTTPS source, outcome, checked jobs and evidence')
    if args['status'] not in ('retrieved', 'partial', 'blocked', 'unsupported', 'failed'):
        raise ValueError('Choose a recorded source outcome')
    evidence = args['evidence']
    if not isinstance(evidence, str) or not evidence.strip() or len(evidence) > 2000 or '\x00' in evidence:
        raise ValueError('Describe the external source check and any coverage limitation')
    with workspace.edit() as state:
        get_run(state, args['research_id'])
        # External tools are an explicit operator attestation, never a shared-scraper receipt.
        jobs = selected_jobs(state, args, limit=None) if args['job_ids'] else []
        if args['job_ids'] != [] and not jobs:
            raise ValueError('Provide checked workspace job IDs')
        if args['status'] not in ('retrieved', 'partial') and jobs:
            raise ValueError('A failed source check cannot verify listings')
        recorded_at = now()
        reference = datetime.fromisoformat(recorded_at)
        for job in jobs:
            if not current_check(job.get('checked_at'), reference):
                raise ValueError(f"{job['title']}: preserve a timezone-aware checked_at from a source check "
                                 "within the last 24 hours before recording external evidence.")
        return record_source(state, args['research_id'], jobs, method='external',
                             url=args['url'], status=args['status'], note=evidence.strip(),
                             observed_at=recorded_at)


def record_source(state, research_id, jobs, *, method, status, url=None, source=None, note='',
                  observed_at=None, closed_jobs=()):
    run = get_run(state, research_id)
    receipt = {'id': uid(), 'method': method, 'status': status, 'url': url,
               'source': source, 'checked_at': observed_at or now(), 'note': note,
               'jobs': {job['id']: source_fingerprint(job) for job in jobs}}
    if closed_jobs:
        receipt['closed_jobs'] = {job['id']: source_fingerprint(job) for job in closed_jobs}
    if method == 'external':
        receipt['recorded_at'] = receipt.pop('checked_at')
        receipt['job_checked_at'] = {job['id']: job['checked_at'] for job in jobs}
    run['sources'].append(receipt)
    return receipt


def begin_discovery(workspace, research_id, discovery_id):
    with workspace.edit() as state:
        get_run(state, research_id).setdefault('active_discoveries', []).append(discovery_id)


def finish_discovery(workspace, research_id, discovery_id, rows):
    """Retain all outcomes, including blocked sources and limits after import."""
    if not research_id:
        return
    with workspace.edit() as state:
        run = get_run(state, research_id)
        for row in rows:
            receipt = companies.by_id(run['sources'], row.get('research_receipt_id'))
            if receipt:
                receipt.update(status=row['status'], note=row.get('note', ''))
            else:
                record_source(state, research_id, [], method=row.get('method', 'discovery'),
                              status=row['status'], url=row.get('url'),
                              source=row.get('source'), note=row.get('note', ''),
                              observed_at=row.get('observed_at'))
        run['active_discoveries'] = [value for value in run.get('active_discoveries', []) if value != discovery_id]


def record_logo(workspace, research_id, employer, outcome, attempted, evidence):
    if not research_id or not employer:
        return
    with workspace.edit() as state:
        run = get_run(state, research_id)
        current = companies.by_id(state.get('employers', []), employer['id'])
        if not current or current['name'] != employer['name']:
            raise ValueError('The company changed during logo retrieval. Check it again.')
        run['logos'].append({'id': uid(), 'employer_id': employer['id'], 'name': employer['name'],
                             'checked_at': now(), 'attempted_urls': attempted,
                             'evidence': evidence, **outcome})


def receipt_time(receipt):
    return receipt.get('checked_at') or receipt.get('recorded_at') or ''


def covers_listing(receipt, job_id, signature, closed, reference):
    if receipt['status'] not in ('retrieved', 'partial'):
        return False
    checked_at = (receipt.get('job_checked_at', {}).get(job_id, '') if receipt['method'] == 'external'
                  else receipt['checked_at'])
    if not current_check(checked_at, reference):
        return False
    return (receipt.get('jobs', {}).get(job_id) == signature
            or (closed and receipt.get('closed_jobs', {}).get(job_id) == signature))


def completion(workspace, state, run, checked, employer_ids):
    """Check evidence for this task; retain honest gaps without inventing success."""
    blockers, gaps = [], []
    if run is None:
        return [{'code': 'research_task_required', 'message': 'Start company-research-start and use its research_id.'}], gaps
    receipts = run['sources']
    if not receipts:
        blockers.append({'code': 'research_source_required',
                         'message': 'Check at least one source and record its outcome in this research task.'})
    observed = {job_id for receipt in receipts for job_id in receipt.get('jobs', {})}
    omitted = sorted(observed - {job['id'] for job in checked})
    if omitted:
        blockers.append({'code': 'research_jobs_omitted', 'job_ids': omitted,
                         'message': 'Include every checked job ID recorded in this research task.'})
    if run.get('active_discoveries'):
        blockers.append({'code': 'research_fetch_in_progress',
                         'message': 'Wait for discovery and its evidence recording to finish.'})
    # A discovery failure may be saved after a later external retry of the same page.
    latest = {}
    for receipt in receipts:
        key = source_identity(receipt)
        if key not in latest or receipt_time(receipt) >= receipt_time(latest[key]):
            latest[key] = receipt
    reference = datetime.fromisoformat(now())
    for job in checked:
        signature = source_fingerprint(job)
        closed = job.get('availability') == 'closed'
        if not any(covers_listing(row, job['id'], signature, closed, reference)
                   for row in latest.values()):
            blockers.append({'code': 'source_check_missing', 'job_id': job['id'],
                             'name': job['employer'], 'title': job['title'],
                             'message': 'Retrieve this listing in the current research task or record an evidenced external check.'})
    for receipt in latest.values():
        if (receipt['status'] in ('retrieved', 'partial')
                and not current_check(receipt_time(receipt), reference)):
            gaps.append({'kind': 'source', **receipt, 'code': 'source_check_stale',
                         'message': 'This source check is over 24 hours old or has an invalid timestamp. Recheck the source.'})
        elif receipt['status'] != 'retrieved':
            gaps.append({'kind': 'source', **receipt})
    logos = company_logos.logo_urls(workspace.path, state)
    employers = {row['id']: row for row in state.get('employers', [])}
    for employer_id in employer_ids:
        employer = employers[employer_id]
        if employer_id in logos:
            continue
        receipt = next((row for row in reversed(run['logos']) if row['employer_id'] == employer_id
                        and row['name'] == employer['name'] and row.get('attempted_urls')), None)
        if (receipt and receipt.get('reason')
                and receipt['status'] in ('missing', 'failure', 'unsupported')):
            gaps.append({'kind': 'logo', **receipt})
        else:
            blockers.append({'code': 'logo_check_missing', 'employer_id': employer_id,
                             'name': employer['name'],
                             'message': 'Use company-logo-backfill with this research_id and an official branding source; verify the saved mark or report the recorded failure.'})
    return blockers, gaps
