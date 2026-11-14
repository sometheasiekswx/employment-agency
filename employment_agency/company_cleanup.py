"""Reversible cleanup of Jobs after two confirmed vacancies in a company round."""

from datetime import datetime

from . import companies
from .application_context import listing_sha256
from .application_queue import COMPANY_CLEANUP_SOURCE, pending_choices, project
from .store import digest, encode, now


REASON = 'Company application limit reached'
SKIP_EVENT = 'company_jobs_cleanup_skipped'


def active_pairs(evidence, cutoff):
    for employer_id, (record, window, occurrences) in evidence.items():
        until, pair = window
        projected_until = record['cooldown_until']
        if (until and cutoff < until and projected_until and cutoff < datetime.fromisoformat(projected_until)
                and len(pair) == companies.ROUND_CAPACITY
                and all(occurrences[vacancy][0] <= cutoff for vacancy in pair)):
            yield employer_id, (record, sorted(pair))


def protected_work(state, links):
    from .agent_execution import RUNNING, RESUMABLE

    jobs = {row['binding']['job_id'] for row in state.get('submission_attempts', [])
            if row['status'] in companies.HELD}
    vacancies = set(companies.active_holds(state, links))
    for run in state.get('agent_runs', []):
        if run['status'] in RUNNING | RESUMABLE | {'uncertain', 'record_pending'}:
            jobs.add(run['job_id'])
            authority = run.get('authority', {})
            if authority.get('employer_id') and authority.get('vacancy_id'):
                vacancies.add((authority['employer_id'], authority['vacancy_id']))
    for run in state['runs']:
        if run.get('inflight'):
            jobs.add(run['inflight'])
        if run['status'] in {'running', 'paused', 'failed', 'cancelled'}:
            jobs.update(set(run.get('queue') or ()) - set(run.get('done', ())))
    vacancies.update((link['employer_id'], link['vacancy_id']) for job_id in jobs if (link := links.get(job_id)))
    return jobs, vacancies


def plan(state, rounds):
    employers = {employer['id']: employer for employer in state.get('employers', [])}
    report = {'companies': [], 'candidates': [], 'skipped': []}
    if not rounds:
        return report

    for employer_id, (record, pair) in sorted(rounds.items()):
        report['companies'].append({
            'employer_id': employer_id, 'employer': employers[employer_id]['name'],
            'vacancy_ids': pair, 'cooldown_until': record['cooldown_until'],
        })
    names = companies.employer_name_ids(employers.values())
    links = {link['id']: link for link in state.get('employer_links', [])}
    choices = pending_choices(state)
    stages = {role: stage for role, _, stage, _, _, _ in project(state, choices=choices)}
    pending_vacancies = {(link['employer_id'], link['vacancy_id'])
                         for job_id in choices if stages.get(job_id) not in {'submitted', 'removed'}
                         and (link := links.get(job_id))}
    protected_jobs, protected_vacancies = protected_work(state, links)
    for job in sorted(state['jobs'], key=lambda row: row['id']):
        job_id = job['id']
        if stages.get(job_id) in {'submitted', 'removed'} or job_id in choices:
            continue
        link = links.get(job_id)
        entry = {'job_id': job_id, 'title': job['title']}
        if not link:
            matches = sorted(names.get(companies.name_key(job['employer']), set()) & rounds.keys())
            if matches:
                report['skipped'].append({**entry, 'possible_employer_ids': matches, 'code': 'employer_unresolved',
                                          'message': 'Confirm the hiring employer before removing this listing'})
            continue
        employer_id, vacancy_id = link['employer_id'], link['vacancy_id']
        if employer_id not in rounds:
            continue
        record, pair = rounds[employer_id]
        vacancy = employer_id, vacancy_id
        if vacancy_id in record['submitted_vacancies'] or vacancy in pending_vacancies:
            continue
        entry['employer_id'] = employer_id
        entry['vacancy_id'] = vacancy_id
        if companies.employer_evidence_conflict(job, employers[employer_id]):
            report['skipped'].append({**entry, 'code': 'employer_evidence_conflict',
                                      'message': 'Review the conflicting hiring employer evidence'})
        elif job_id in protected_jobs or vacancy in protected_vacancies:
            report['skipped'].append({**entry, 'code': 'application_in_progress',
                                      'message': 'Resolve or finish the existing application work'})
        else:
            removal_id = digest(encode([COMPANY_CLEANUP_SOURCE, employer_id, pair, job_id]))[:32]
            history = job.get('removals') or state.get('unlisted_removals', {}).get(job_id, ())
            if any(event['id'] == removal_id or (
                event.get('source') == COMPANY_CLEANUP_SOURCE and event.get('employer_id') == employer_id
                and set(event.get('vacancy_ids', ())).intersection(pair)
            ) for event in history):
                continue
            report['candidates'].append({
                **entry, 'removal_id': removal_id, 'vacancy_ids': pair, 'listing_sha256': listing_sha256(job),
            })
    return report


def apply(state, report):
    jobs = {job['id']: job for job in state['jobs']}
    at = now()
    for row in report['candidates']:
        job = jobs[row['job_id']]
        history = state.get('unlisted_removals', {}).get(job['id'], [])
        job.setdefault('removals', history).append({
            'id': row['removal_id'], 'at': at, 'reason': REASON, 'source': COMPANY_CLEANUP_SOURCE,
            'employer_id': row['employer_id'], 'vacancy_ids': row['vacancy_ids'],
        })
    prior = [event.get('records') for event in state['events'] if event.get('type') == SKIP_EVENT]
    if report['skipped'] and report['skipped'] not in prior:
        state['events'].append({'at': at, 'type': SKIP_EVENT,
                                'records': report['skipped']})


def after_submission(state, previous, current):
    cutoff = companies.clock()
    old_pairs = dict(active_pairs(previous, cutoff))
    qualifying = {}
    for employer_id, (record, pair) in active_pairs(current, cutoff):
        _, _, old_dates = previous.get(employer_id, (None, None, {}))
        _, _, dates = current[employer_id]
        _, old_pair = old_pairs.get(employer_id, (None, []))
        if not set(pair).intersection(old_pair) and any(old_dates.get(vacancy) != dates[vacancy] for vacancy in pair):
            qualifying[employer_id] = record, pair
    if qualifying:
        apply(state, plan(state, qualifying))


def operation(service, action, args):
    w = service.w

    def preview(state):
        evidence = companies.round_evidence(state, service.workspace_zone())
        rounds = dict(active_pairs(evidence, companies.clock()))
        report = {'workspace': str(w.path), 'workspace_id': w.workspace_id, **plan(state, rounds)}
        return {**report, 'fingerprint': digest(encode(report))}

    if action == 'company-jobs-cleanup-preview':
        if args:
            raise ValueError('Company Jobs cleanup preview takes no arguments')
        return preview(w.read())
    if set(args) != {'confirmed', 'fingerprint'} or args['confirmed'] is not True:
        raise ValueError('Confirm the company Jobs cleanup preview before applying it')
    with w.edit() as state:
        report = preview(state)
        if report['fingerprint'] != args['fingerprint']:
            raise companies.CompanyBlocked('company_jobs_cleanup_changed',
                                           'Company Jobs cleanup changed. Preview the current scope before applying it.')
        apply(state, report)
        return {**report, 'removed_count': len(report['candidates'])}
