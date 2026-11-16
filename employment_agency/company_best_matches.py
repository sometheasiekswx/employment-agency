"""Store a private, evidence-linked company comparison for a search profile."""

import json

from . import companies, matching
from .application_context import listing_sha256, selected_jobs
from .application_queue import confirmed_equivalents, equivalent_submissions
from .store import digest, now


REVIEW_FIELD = 'best_match_reviews'
MAX_REASON = 240
MAX_COMPARED_JOBS = 2000
MAX_REVIEW_FACTS = 5000


class ResearchIncomplete(ValueError):
    def __init__(self, result):
        self.result = result
        blockers = result['completion']['blockers']
        super().__init__('Company research is incomplete. ' + '; '.join(
            f"{blocker.get('name', 'Research task')}: {blocker['message']}" for blocker in blockers
        ))


def public_employer(employer):
    """Expose the existing employer context without private comparison notes."""
    return {key: value for key, value in employer.items() if key != REVIEW_FIELD} if employer else None


def fingerprint(value):
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def unique_ids(value, minimum, maximum, message):
    if (not isinstance(value, list) or not minimum <= len(value) <= maximum
            or any(not isinstance(item, str) or not item for item in value)
            or len(set(value)) != len(value)):
        raise ValueError(message)
    return value


def potentially_suitable(job, profile, unavailable):
    removals = job.get('removals', [])
    return (job['id'] not in unavailable and job.get('availability') != 'closed'
            and not (removals and not removals[-1].get('restored_at'))
            and not matching.match(job, profile, [])['hard_conflicts'])


def eligible_inventory(jobs, employer, profile, links, unavailable):
    result = {}
    for job in jobs:
        link = links.get(job['id'])
        if (not link or link['employer_id'] != employer['id']
                or companies.employer_evidence_conflict(job, employer)
                or job.get('availability') != 'retrieved'
                or not potentially_suitable(job, profile, unavailable)):
            continue
        result[job['id']] = {
            'vacancy_id': link['vacancy_id'],
            'listing': listing_sha256(job),
            'posted_at': job.get('posted_at'),
            'requirements': job.get('requirement_evidence', {}),
        }
    return result


def comparison_context(state):
    from .service import legacy_rejections, submitted_job_ids

    links = {row['id']: row for row in state.get('employer_links', [])}
    submitted = (submitted_job_ids(state) | companies.submission_dates(state).keys()
                 | confirmed_equivalents(state, equivalent_submissions(state)))
    mirrors = set()
    if submitted:
        employers = {row['id']: row for row in state.get('employers', [])}
        jobs = {job['id']: job for job in state['jobs']}
        verified_links = {
            job_id: link for job_id, link in links.items() if job_id in jobs
            and (employer := employers.get(link['employer_id']))
            and not companies.employer_evidence_conflict(jobs[job_id], employer)
        }
        groups = vacancy_groups(jobs, verified_links)
        submitted_groups = {groups[job_id] for job_id in submitted & groups.keys()}
        mirrors = {job_id for job_id, group in groups.items() if group in submitted_groups}
    return (
        links,
        submitted | mirrors | legacy_rejections(state).keys(),
        {
            row['id']: {field: row[field] for field in ('id', 'text', 'category', 'association', 'dates') if field in row}
            for row in matching.available(state['facts'])
            if str(row.get('category', '')).casefold() not in ('reference', 'referee', 'contact', 'references', 'referees')
        },
    )


def vacancy_groups(jobs, links):
    """Map listings to distinct vacancies, including chains of overlapping posting keys."""
    parents = {job_id: job_id for job_id in jobs}
    by_key = {}

    def root(job_id):
        while job_id != parents[job_id]:
            parents[job_id] = parents[parents[job_id]]
            job_id = parents[job_id]
        return job_id

    for job_id, job in jobs.items():
        keys = companies.posting_keys(job)
        if link := links.get(job_id):
            keys.add(('vacancy', link['employer_id'], link['vacancy_id']))
        for key in keys:
            prior = by_key.setdefault(key, job_id)
            parents[root(prior)] = root(job_id)
    return {job_id: root(job_id) for job_id in jobs}


def distinct_inventory(inventory, jobs, links):
    return vacancy_groups({job_id: jobs[job_id] for job_id in inventory}, links)


def check_compared_inventory(groups, compared):
    seen = {groups[job_id] for job_id in compared}
    if len(seen) != len(compared):
        raise ValueError('Compare distinct vacancies. Two listings refer to the same vacancy')
    if seen != set(groups.values()):
        raise ValueError('Compare every suitable vacancy at the verified employer')


def basis_fingerprint(employer, profile, inventory, facts):
    return fingerprint({
        'employer_id': employer['id'],
        'profile': profile,
        'inventory': inventory,
        'facts': facts,
    })


def target(workspace, state, args):
    if args.get('workspace_id') != workspace.workspace_id:
        raise ValueError('Provide a complete comparison for the current workspace')
    employer = companies.by_id(state['employers'], args.get('employer_id'))
    profile = companies.by_id(state['profiles'], args.get('profile_id'))
    if not employer or not profile:
        raise ValueError('Choose a known verified employer and search profile from this workspace')
    return employer, profile


def basis(workspace, args):
    if set(args) != {'workspace_id', 'employer_id', 'profile_id'}:
        raise ValueError('Provide the current workspace, verified employer and search profile')
    state = workspace.read()
    employer, profile = target(workspace, state, args)
    links, unavailable, facts = comparison_context(state)
    jobs = {job['id']: job for job in state['jobs']}
    inventory = eligible_inventory(jobs.values(), employer, profile, links, unavailable)
    groups = distinct_inventory(inventory, jobs, links)
    if len(set(groups.values())) < 3:
        raise ValueError('At least three distinct suitable vacancies are required')
    if len(inventory) > MAX_COMPARED_JOBS or len(facts) > MAX_REVIEW_FACTS:
        raise ValueError('The company review input exceeds the supported size')
    return {
        'workspace_id': workspace.workspace_id, 'employer_id': employer['id'], 'profile': profile,
        'basis': basis_fingerprint(employer, profile, inventory, facts),
        'jobs': [
            {**{field: job.get(field) for field in (
                'id', 'title', 'location', 'description', 'requirements', 'requirement_evidence', 'url',
                'posted_at', 'closes', 'eligibility', 'sponsorship', 'salary', 'work_arrangement', 'seniority',
            )}, 'vacancy_id': inventory[job['id']]['vacancy_id'], 'vacancy_group_id': groups[job['id']]}
            for job in state['jobs'] if job['id'] in inventory
        ],
        'facts': list(facts.values()),
    }


def normalize_picks(picks):
    if not isinstance(picks, list) or len(picks) != 2:
        raise ValueError('Provide exactly two reviewed picks')
    reviewed = []
    for pick in picks:
        if not isinstance(pick, dict) or set(pick) != {'job_id', 'reason', 'fact_ids'}:
            raise ValueError('Each pick needs a job ID, reason and confirmed fact IDs')
        reason = pick['reason']
        if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > MAX_REASON:
            raise ValueError(f'Give each pick a fit reason of 1 to {MAX_REASON} characters')
        ids = unique_ids(pick['fact_ids'], 1, 25, 'Give each pick distinct confirmed fact IDs')
        reviewed.append({**pick, 'reason': ' '.join(reason.split()), 'fact_ids': ids})
    unique_ids([pick['job_id'] for pick in reviewed], 2, 2, 'Choose two distinct job IDs')
    return reviewed


def save(workspace, args):
    fields = {'workspace_id', 'employer_id', 'profile_id', 'compared_job_ids', 'picks', 'basis'}
    if set(args) != fields or args['workspace_id'] != workspace.workspace_id:
        raise ValueError('Provide a complete comparison for the current workspace')
    compared = unique_ids(args['compared_job_ids'], 3, MAX_COMPARED_JOBS,
                          'Provide at least three distinct compared job IDs')
    reviewed = normalize_picks(args['picks'])
    if not {pick['job_id'] for pick in reviewed} <= set(compared):
        raise ValueError('Both recommendations must be included in the compared roles')

    with workspace.edit() as state:
        employer, profile = target(workspace, state, args)
        links, unavailable, facts = comparison_context(state)
        jobs = {row['id']: row for row in state['jobs']}
        inventory = eligible_inventory(jobs.values(), employer, profile, links, unavailable)
        current_basis = basis_fingerprint(employer, profile, inventory, facts)
        if args['basis'] != current_basis:
            raise ValueError('The comparison basis changed. Read the current listings and facts and review again')
        if not set(compared) <= inventory.keys():
            raise ValueError('Every compared role must be a current, suitable listing at the verified employer')
        check_compared_inventory(distinct_inventory(inventory, jobs, links), compared)
        if any(fact_id not in facts for pick in reviewed for fact_id in pick['fact_ids']):
            raise ValueError('Fit reasons must cite existing, confirmed career facts')
        record = {
            'profile_id': profile['id'],
            'compared_job_ids': compared,
            'picks': reviewed,
            'reviewed_at': now(),
            'basis': current_basis,
            'fingerprint': fingerprint([current_basis, compared, reviewed]),
        }
        reviews = employer.get(REVIEW_FIELD)
        if not isinstance(reviews, dict):
            reviews = employer[REVIEW_FIELD] = {}
        reviews[profile['id']] = record
    return {'employer_id': employer['id'], **record}


def current_picks(employer, profile, inventory, facts, groups, review):
    if not isinstance(review, dict) or review.get('profile_id') != profile['id']:
        return []
    try:
        picks = normalize_picks(review.get('picks'))
        compared = unique_ids(review.get('compared_job_ids'), 3, MAX_COMPARED_JOBS, 'Invalid compared jobs')
        if (not set(compared) <= inventory.keys()
                or not {pick['job_id'] for pick in picks} <= set(compared)
                or any(fact_id not in facts for pick in picks for fact_id in pick['fact_ids'])):
            return []
        check_compared_inventory(groups, compared)
    except ValueError:
        return []
    current_basis = basis_fingerprint(employer, profile, inventory, facts)
    if (current_basis != review.get('basis')
            or fingerprint([current_basis, compared, picks]) != review.get('fingerprint')):
        return []
    return [{'job_id': pick['job_id'], 'reason': pick['reason']} for pick in picks]


def review_status(employer, profile, jobs, context):
    links, unavailable, facts = context
    inventory = eligible_inventory(jobs.values(), employer, profile, links, unavailable)
    groups = distinct_inventory(inventory, jobs, links)
    count = len(set(groups.values()))
    result = {
        'employer_id': employer['id'], 'profile_id': profile['id'],
        'vacancy_count': count, 'status': 'not_required',
    }
    if count <= 2:
        return result
    reviews = employer.get(REVIEW_FIELD, {})
    if isinstance(reviews, dict) and profile['id'] not in reviews:
        return {**result, 'status': 'missing'}
    review = reviews.get(profile['id']) if isinstance(reviews, dict) else None
    picks = current_picks(employer, profile, inventory, facts, groups, review)
    return {**result, 'status': 'current', 'picks': picks} if picks else {**result, 'status': 'stale'}


def jobs_by_employer(jobs, links):
    grouped = {}
    for job_id, job in jobs.items():
        if link := links.get(job_id):
            grouped.setdefault(link['employer_id'], {})[job_id] = job
    return grouped


def project(state):
    """Expose current picks and required reviews, discarding private comparison records."""
    context = comparison_context(state)
    grouped = jobs_by_employer({job['id']: job for job in state['jobs']}, context[0])
    picks, statuses = [], []
    for employer in state.get('employers', []):
        if jobs := grouped.get(employer['id']):
            for profile in state['profiles']:
                status = review_status(employer, profile, jobs, context)
                if review_picks := status.pop('picks', None):
                    picks.append({
                        'employer_id': employer['id'], 'profile_id': profile['id'], 'picks': review_picks,
                    })
                if status['status'] in ('missing', 'stale'):
                    statuses.append(status)
        employer.pop(REVIEW_FIELD, None)
    return picks, statuses


def employer_labels(job):
    evidence = job.get('employer_evidence')
    published = evidence.get('name', '') if isinstance(evidence, dict) else ''
    return {companies.name_key(job['employer']), companies.name_key(published)} - {''}


def completion(state, profile, checked):
    context = comparison_context(state)
    links, unavailable, facts = context
    employers = {row['id']: row for row in state.get('employers', [])}
    names = companies.employer_name_ids(employers.values())
    jobs = {job['id']: job for job in state['jobs']}
    grouped = jobs_by_employer(jobs, links)
    checked_ids = {job['id'] for job in checked}
    scoped = {
        link['employer_id'] for job_id in checked_ids
        if (link := links.get(job_id)) and link['employer_id'] in employers
    }
    blockers = []
    for job_id, job in jobs.items():
        link = links.get(job_id)
        employer = employers.get(link['employer_id']) if link else None
        verified = employer and not companies.employer_evidence_conflict(job, employer)
        # Unchecked, unverified listings only affect a company when current evidence
        # can connect the listing to an employer already covered by this research.
        if job_id not in checked_ids:
            if verified or job.get('availability') != 'retrieved':
                continue
            if not ((employer and employer['id'] in scoped)
                    or any(names.get(label, set()) & scoped for label in employer_labels(job))):
                continue
        if not potentially_suitable(job, profile, unavailable):
            continue
        common = {'job_id': job_id, 'name': job['employer'], 'title': job['title']}
        if not verified:
            blockers.append({
                **common, 'code': 'employer_identity_unresolved',
                'message': f"Confirm the hiring employer for {job['title']} using current listing evidence.",
            })
        elif job.get('availability') != 'retrieved':
            blockers.append({
                **common, 'code': 'listing_availability_unverified',
                'message': f"Verify current listing availability for {job['title']}.",
            })

    statuses = []
    for employer_id, employer in employers.items():
        if employer_id not in scoped:
            continue
        result = review_status(employer, profile, grouped.get(employer_id, {}), context)
        result.pop('picks', None)
        status = result['status']
        statuses.append({**result, 'name': employer['name']})
        if status in ('missing', 'stale'):
            message = ('Read the current comparison basis and save two highlights with confirmed fit evidence.'
                       if facts else 'Resolve the shortage of confirmed career facts before reviewing highlights.')
            blockers.append({
                'code': f'company_highlights_{status}', 'employer_id': employer_id,
                'name': employer['name'], 'message': message,
            })
    return {'ready': not blockers, 'companies': statuses, 'blockers': blockers}


def research(workspace, args, *, finalize):
    from . import research_workflow

    fields = {'workspace_id', 'profile_id', 'job_ids'}
    if ((finalize and set(args) != fields | {'research_id'})
            or set(args) - (fields | {'research_id'})
            or args.get('workspace_id', workspace.workspace_id) != workspace.workspace_id):
        raise ValueError('Provide the current workspace, search profile, research_id and checked job IDs')
    state = workspace.read()
    profile = companies.by_id(state['profiles'], args.get('profile_id'))
    if not profile:
        raise ValueError('Choose a search profile in this workspace')
    run = research_workflow.get_run(state, args['research_id'], profile['id']) if 'research_id' in args else None
    if finalize:
        checked = selected_jobs(state, args, limit=None)
    else:
        # Earlier assessment callers can pass an empty list or repeat a checked role.
        ids = args.get('job_ids')
        if not isinstance(ids, list) or any(not isinstance(job_id, str) for job_id in ids):
            raise ValueError('Provide the checked workspace job IDs')
        checked = selected_jobs(state, {'job_ids': list(dict.fromkeys(ids))}, limit=None) if ids else []
    result = {
        'workspace': str(workspace.path), 'workspace_id': workspace.workspace_id,
        'profile_id': profile['id'], 'completion': completion(state, profile, checked),
    }
    evidence_blockers, gaps = research_workflow.completion(
        workspace, state, run, checked,
        {row['employer_id'] for row in result['completion']['companies']},
    )
    result['completion']['blockers'].extend(evidence_blockers)
    result['completion'].update(ready=not result['completion']['blockers'], gaps=gaps,
                                coverage_complete=not gaps and not result['completion']['blockers'])
    result['research_id'] = run['id'] if run else None
    if finalize:
        if not result['completion']['ready']:
            raise ResearchIncomplete(result)
        return result
    return {**companies.research(state, profile, args['job_ids']), **result}
