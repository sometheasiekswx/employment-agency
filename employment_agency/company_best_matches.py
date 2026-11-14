"""Store a private, evidence-linked company comparison for a search profile."""

import json

from . import companies, matching
from .application_context import listing_sha256
from .application_queue import confirmed_equivalents, equivalent_submissions
from .store import digest, now


REVIEW_FIELD = 'best_match_reviews'
MAX_REASON = 240


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


def eligible_inventory(state, employer, profile, links, unavailable):
    result = {}
    for job in state['jobs']:
        link = links.get(job['id'])
        removals = job.get('removals', [])
        if (not link or link['employer_id'] != employer['id']
                or job['id'] in unavailable or job.get('availability') != 'retrieved'
                or (removals and not removals[-1].get('restored_at'))
                or companies.employer_evidence_conflict(job, employer)
                or matching.match(job, profile, [])['hard_conflicts']):
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

    return (
        {row['id']: row for row in state.get('employer_links', [])},
        submitted_job_ids(state) | companies.submission_dates(state).keys()
        | confirmed_equivalents(state, equivalent_submissions(state)) | legacy_rejections(state).keys(),
        {row['id']: row for row in matching.available(state['facts'])},
    )


def check_compared_inventory(inventory, jobs, compared):
    seen = set()
    identities = {
        job_id: {('vacancy', item['vacancy_id']), *companies.posting_keys(jobs[job_id])}
        for job_id, item in inventory.items()
    }
    for job_id in compared:
        identity = identities[job_id]
        if seen.intersection(identity):
            raise ValueError('Compare distinct vacancies. Two listings refer to the same vacancy')
        seen.update(identity)
    if any(not seen.intersection(identity) for identity in identities.values()):
        raise ValueError('Compare every suitable vacancy at the verified employer')



def comparison_fingerprint(profile, inventory, facts, compared, picks):
    return fingerprint({
        'profile': profile,
        'inventory': inventory,
        'facts': {fact_id: facts[fact_id] for pick in picks for fact_id in pick['fact_ids']},
        'compared': compared,
        'picks': picks,
    })


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
    fields = {'workspace_id', 'employer_id', 'profile_id', 'compared_job_ids', 'picks'}
    if set(args) != fields or args['workspace_id'] != workspace.workspace_id:
        raise ValueError('Provide a complete comparison for the current workspace')
    compared = unique_ids(args['compared_job_ids'], 3, 2000, 'Provide at least three distinct compared job IDs')
    reviewed = normalize_picks(args['picks'])
    if not {pick['job_id'] for pick in reviewed} <= set(compared):
        raise ValueError('Both recommendations must be included in the compared roles')

    with workspace.edit() as state:
        employer = companies.by_id(state['employers'], args['employer_id'])
        profile = companies.by_id(state['profiles'], args['profile_id'])
        if not employer or not profile:
            raise ValueError('Choose a known verified employer and search profile from this workspace')
        links, unavailable, facts = comparison_context(state)
        inventory = eligible_inventory(state, employer, profile, links, unavailable)
        if not set(compared) <= inventory.keys():
            raise ValueError('Every compared role must be a current, suitable listing at the verified employer')
        jobs = {row['id']: row for row in state['jobs']}
        check_compared_inventory(inventory, jobs, compared)
        if any(fact_id not in facts for pick in reviewed for fact_id in pick['fact_ids']):
            raise ValueError('Fit reasons must cite existing, confirmed career facts')
        record = {
            'profile_id': profile['id'],
            'compared_job_ids': compared,
            'picks': reviewed,
            'reviewed_at': now(),
            'fingerprint': comparison_fingerprint(profile, inventory, facts, compared, reviewed),
        }
        reviews = employer.get(REVIEW_FIELD)
        if not isinstance(reviews, dict):
            reviews = employer[REVIEW_FIELD] = {}
        reviews[profile['id']] = record
    return {'employer_id': employer['id'], **record}


def project(state):
    """Expose only current picks to Jobs. Keep comparison records in private storage."""
    profiles = {row['id']: row for row in state['profiles']}
    visible = []
    context = None
    for employer in state.get('employers', []):
        reviews = employer.pop(REVIEW_FIELD, {})
        if not isinstance(reviews, dict):
            continue
        for profile_id, review in reviews.items():
            if profile_id not in profiles or not isinstance(review, dict):
                continue
            if context is None:
                context = comparison_context(state)
            links, unavailable, facts = context
            profile = profiles[profile_id]
            try:
                picks = normalize_picks(review.get('picks'))
                compared = unique_ids(review.get('compared_job_ids'), 3, 2000, 'Invalid compared jobs')
            except ValueError:
                continue
            if any(fact_id not in facts for pick in picks for fact_id in pick['fact_ids']):
                continue
            inventory = eligible_inventory(state, employer, profile, links, unavailable)
            if (set(compared) <= inventory.keys() and {pick['job_id'] for pick in picks} <= set(compared)
                    and comparison_fingerprint(profile, inventory, facts, compared, picks) == review.get('fingerprint')):
                visible.append({
                    'employer_id': employer['id'],
                    'profile_id': profile_id,
                    'picks': [{'job_id': pick['job_id'], 'reason': pick['reason']} for pick in picks],
                })
    return visible
