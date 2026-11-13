"""Employer identity, effective submission history and application allowances."""

from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone

from . import matching
from .store import digest, encode, uid

HELD = {'executing', 'unknown', 'handed_off'}
SUBMITTED = {'submitted', 'sent', 'confirmed', 'applied'}


def clock():
    return datetime.now(timezone.utc)


def name_key(value):
    return ' '.join(str(value).casefold().split())


def by_id(records, value):
    return next((record for record in records if record.get('id') == value), None)


def employer_link(state, job_id):
    return by_id(state.get('employer_links', []), job_id)


def source_employer(state, source_id):
    source = by_id(state['sources'], source_id)
    if source is None:
        return None
    board = (source['kind'], source['board'])
    equivalents = {item['id'] for item in state['sources'] if (item['kind'], item['board']) == board}
    return next((row['id'] for row in state.get('employers', [])
                 if equivalents.intersection(row['source_ids'])), None)


def occurrence(value, zone):
    """Return an instant and its precision. Naive times belong to the workspace."""
    if not isinstance(value, str) or not value:
        return None, False
    try:
        if len(value) == 10:
            return datetime.combine(date.fromisoformat(value), time.max, zone), True
        instant = datetime.fromisoformat(value)
        return instant if instant.tzinfo else instant.replace(tzinfo=zone), False
    except ValueError:
        return None, False


def valid_occurrence(value, zone):
    instant, date_only = occurrence(value, zone)
    current = clock()
    if not instant or (instant.date() > current.astimezone(zone).date() if date_only else instant > current):
        raise ValueError('Enter the actual submission date or time, up to today')
    return value


def cooldown_after(instant, zone, date_only=False):
    local = instant.astimezone(zone)
    year, month_index = divmod(local.year * 12 + local.month - 1 + 3, 12)
    month = month_index + 1
    day = min(local.day, monthrange(year, month)[1])
    target = local.replace(year=year, month=month, day=day)
    if date_only:
        target = datetime.combine(target.date() + timedelta(days=1), time.min, zone)
    # The later instant covers both the repeated hour and the skipped hour.
    return max(target.replace(fold=fold).astimezone(timezone.utc) for fold in (0, 1))


def history_id(record):
    return digest(encode(record))[:24]


def submission_dates(state):
    from .service import corrected_submission

    dates = {}
    for job in state['jobs']:
        if job.get('prior_application') == 'submitted':
            dates.setdefault(job['id'], []).append(job.get('prior_submitted_on'))
    for version in state['applications']:
        if version['status'] == 'submitted' and not corrected_submission(version, state):
            dates.setdefault(version.get('job_id'), []).append(
                version.get('occurred_at') or version.get('submitted_at')
            )
    for attempt in state.get('submission_attempts', []):
        if attempt['status'] == 'confirmed':
            dates.setdefault(attempt['binding']['job_id'], []).append(attempt.get('occurred_at'))
    for record in state.get('historical_decisions', []):
        if name_key(record.get('status', '')) not in SUBMITTED:
            continue
        association = by_id(state.get('company_history_links', []), history_id(record))
        if association:
            dates.setdefault(association['job_id'], []).append(association['occurred_at'])
    return dates


def history_review(state, names, dates):
    links = state.get('employer_links', [])
    known_jobs = {listing['id']: listing for listing in state['jobs']}
    linked = {link['id'] for link in links}
    historical = {link['id'] for link in state.get('company_history_links', [])}
    return [
        {'job_id': job_id, 'title': known_jobs[job_id]['title'], 'reason': 'Confirm the employer'}
        for job_id in dates if job_id in known_jobs and job_id not in linked
        and name_key(known_jobs[job_id]['employer']) in names
    ] + [
        {'history_id': history_id(record), 'title': record.get('title') or record.get('employer'),
         'date': record.get('sentAt'), 'reason': 'Link the historical submission to a listing'}
        for record in state.get('historical_decisions', [])
        if name_key(record.get('status', '')) in SUBMITTED and name_key(record.get('employer', '')) in names
        and history_id(record) not in historical
    ]


def calculate_round(state, employer, dates, zone):
    employer_id = employer['id']
    links = [link for link in state.get('employer_links', []) if link['employer_id'] == employer_id]
    jobs = {job['id']: job for job in state['jobs']}
    dates_by_vacancy = {}
    for link in links:
        job_id = link['id']
        if job_id in dates:
            candidates = [link['submitted_on']] if link.get('submitted_on') else dates[job_id]
            dates_by_vacancy.setdefault(link['vacancy_id'], []).extend(candidates)
    names = {name_key(name) for name in [employer['name'], *employer['aliases']]}
    unresolved = history_review(state, names, dates)
    events = []
    unknown = set()
    for vacancy, candidates in dates_by_vacancy.items():
        dated = [(instant, precise) for value in candidates
                 for instant, precise in [occurrence(value, zone)] if instant]
        if dated:
            instant, date_only = min(dated)
            events.append((instant, vacancy, date_only))
        else:
            unknown.add(vacancy)
    unresolved.extend(
        {'job_id': link['id'], 'title': jobs.get(link['id'], {}).get('title', 'Historical listing'),
         'reason': 'Confirm the submission date'}
        for link in links if link['vacancy_id'] in unknown
    )
    for pause in state.get('company_pauses', []):
        if pause['employer_id'] == employer_id:
            instant, _ = occurrence(pause['at'], zone)
            if instant:
                events.append((instant, '', False))
    used = set()
    until = None
    over_limit = 0
    for instant, vacancy, date_only in sorted(events, key=lambda event: (event[0], not event[1], event[1])):
        if until and instant >= until:
            used.clear()
            until = None
        if until:
            over_limit += bool(vacancy)
            continue
        if vacancy:
            used.add(vacancy)
        if len(used) == 2 or ((used or unknown) and not vacancy):
            until = cooldown_after(instant, zone, date_only)
    held = sorted({
        link['vacancy_id']
        for attempt in state.get('submission_attempts', []) if attempt['status'] in HELD
        for link in [employer_link(state, attempt['binding']['job_id'])]
        if link and link['employer_id'] == employer_id
    } - dates_by_vacancy.keys())
    return {'id': employer_id, 'used': sorted(used | unknown), 'held': held,
            'submitted_vacancies': sorted(dates_by_vacancy), 'unresolved': unresolved,
            'cooldown_until': until.isoformat() if until else None, 'over_limit': over_limit}


def update_rounds(state, zone):
    if state.get('employers'):
        dates = submission_dates(state)
        state['company_rounds'] = [calculate_round(state, employer, dates, zone) for employer in state['employers']]


def allowance(round_record):
    if not round_record:
        return {'remaining': 2, 'cooling': False, 'review_needed': False}
    until = round_record['cooldown_until']
    cooling = bool(until and clock() < datetime.fromisoformat(until))
    expired = bool(until and not cooling)
    used = set() if expired else set(round_record['used'])
    held = set(round_record['held'])
    unresolved = round_record['unresolved']
    # A missing date on a single earlier application is safe to count as one.
    # Other unresolved history can change the round's employer or allowance.
    review = bool(unresolved and (expired or len(used | held) >= 2
                                  or any(row['reason'] != 'Confirm the submission date' for row in unresolved)))
    return {**round_record, 'cooling': cooling, 'review_needed': review,
            'remaining': 0 if cooling or review else max(0, 2 - len(used | held))}


def company_status(state, employer_id):
    return allowance(by_id(state.get('company_rounds', []), employer_id))


def job_status(state, job_id):
    link = employer_link(state, job_id)
    return company_status(state, link['employer_id']) if link else allowance(None)


def discovery_status(state, job):
    link = employer_link(state, job['id'])
    if link:
        return company_status(state, link['employer_id'])
    label = name_key(job.get('employer', ''))
    matches = [employer['id'] for employer in state.get('employers', [])
               if label and any(label == name_key(name) for name in (employer['name'], *employer['aliases']))]
    return company_status(state, matches[0]) if len(matches) == 1 else allowance(None)


def source_cooldown(state, source_id):
    return company_status(state, source_employer(state, source_id))['cooling']


def check_slot(state, job_id, attempt_id=None):
    link = employer_link(state, job_id)
    if not link:
        raise ValueError('Confirm the hiring employer in Compare roles at this company before applying')
    status = job_status(state, job_id)
    if status['cooling']:
        raise ValueError('This company is paused until ' + status['cooldown_until'])
    if status['review_needed']:
        raise ValueError('Review this company’s unresolved application history before applying')
    if link['vacancy_id'] in status.get('submitted_vacancies', []):
        raise ValueError('This vacancy is already recorded as submitted')
    for attempt in state.get('submission_attempts', []):
        if attempt['status'] in HELD:
            other = employer_link(state, attempt['binding']['job_id'])
            if other and other['vacancy_id'] == link['vacancy_id']:
                if attempt['id'] == attempt_id:
                    return link
                raise ValueError('An active or uncertain attempt already holds this vacancy')
    if status['remaining'] < 1:
        raise ValueError('Both application slots are in use at this company')
    return link


def map_job(state, args, zone):
    job = by_id(state['jobs'], args['job_id'])
    if not job or args.get('confirmed') is not True:
        raise ValueError('Confirm the actual hiring employer for this listing')
    employers = state.setdefault('employers', [])
    employer_id = args.get('employer_id')
    existing = employer_link(state, job['id'])
    if existing and employer_id not in (None, '', existing['employer_id']):
        raise ValueError('This listing already has a confirmed employer')
    employer = by_id(employers, employer_id or (existing and existing['employer_id']))
    if employer_id and not employer:
        raise ValueError('Choose an existing employer')
    if not employer:
        name = args.get('name') or job['employer']
        if not isinstance(name, str) or not name.strip() or len(name) > 300:
            raise ValueError('Enter the hiring employer name')
        if any(name_key(name) == name_key(other['name']) for other in employers):
            raise ValueError('Choose the existing employer or enter a distinct verified name')
        employer = {'id': uid(), 'name': name.strip(), 'aliases': [], 'source_ids': []}
        employers.append(employer)
    if job['employer'] and job['employer'] not in employer['aliases']:
        employer['aliases'].append(job['employer'])
    source_id = args.get('source_id')
    if source_id:
        if not by_id(state['sources'], source_id) or source_employer(state, source_id) not in (None, employer['id']):
            raise ValueError('Choose a source that belongs to this employer')
        if source_id not in employer['source_ids']:
            employer['source_ids'].append(source_id)
    requisition = args.get('requisition', '')
    if not isinstance(requisition, str) or len(requisition) > 200:
        raise ValueError('Enter a valid employer requisition ID')
    requisition = requisition.strip()
    same = employer_link(state, args.get('same_job_id'))
    if args.get('same_job_id') and (not same or same['employer_id'] != employer['id']):
        raise ValueError('Choose a verified listing for the same vacancy')
    if requisition:
        same = next((link for link in state.get('employer_links', [])
                     if link['employer_id'] == employer['id'] and link.get('requisition') == requisition), same)
    vacancy_id = same['vacancy_id'] if same else (existing['vacancy_id'] if existing else uid())
    if existing and existing['vacancy_id'] != vacancy_id:
        if job['id'] in submission_dates(state) or any(
            row['binding']['job_id'] == job['id'] and row['status'] in HELD
            for row in state.get('submission_attempts', [])
        ):
            raise ValueError('Reconcile the submitted or active record before changing the vacancy')
    link = existing if existing else {'id': job['id']}
    link.update(employer_id=employer['id'], vacancy_id=vacancy_id)
    if requisition:
        link['requisition'] = requisition
    if args.get('submitted_on'):
        if job['id'] not in submission_dates(state):
            raise ValueError('Record a submission before confirming its date')
        link['submitted_on'] = valid_occurrence(args['submitted_on'], zone)
    if not existing:
        state.setdefault('employer_links', []).append(link)
    return link


def link_source_jobs(state, source, jobs, zone):
    employer_id = source_employer(state, source['id'])
    if not employer_id:
        return
    for job in jobs:
        if employer_link(state, job['id']):
            continue
        map_job(state, {'job_id': job['id'], 'employer_id': employer_id,
                        'requisition': job.get('source_requisition', ''), 'confirmed': True}, zone)


def company_roles(state, job_id, profile_id):
    job = by_id(state['jobs'], job_id)
    if not job:
        raise ValueError('Unknown job')
    link = employer_link(state, job_id)
    employer = by_id(state.get('employers', []), link['employer_id']) if link else None
    names = ({name_key(job['employer'])} if not employer else
             {name_key(name) for name in [employer['name'], *employer['aliases']]})
    candidates = [{'id': other['id'], 'title': other['title'], 'employer': other['employer']}
                  for other in state['jobs'] if name_key(other['employer']) in names
                  and name_key(other['employer']) and not employer_link(state, other['id'])]
    status = company_status(state, employer['id']) if employer else allowance(None)
    if not employer:
        unresolved = history_review(state, names - {''}, submission_dates(state))
        status = {**status, 'remaining': 0, 'review_needed': bool(unresolved), 'unresolved': unresolved}
    profile = by_id(state['profiles'], profile_id)
    rows = []
    coverage = []
    if employer:
        coverage = [source for source in state['sources'] if source['id'] in employer['source_ids']]
        if not status['cooling']:
            eligible = {}
            for other in state['jobs']:
                other_link = employer_link(state, other['id'])
                if (other_link and other_link['employer_id'] == employer['id']
                        and other.get('availability') != 'closed'
                        and other_link['vacancy_id'] not in status.get('submitted_vacancies', [])):
                    eligible[other['id']] = other_link['vacancy_id']
            seen = set()
            for row in matching.ranked([other for other in state['jobs'] if other['id'] in eligible],
                                       profile or {}, state['facts']):
                vacancy = eligible[row['job']['id']]
                if vacancy not in seen and not row['match']['hard_conflicts']:
                    rows.append(row)
                    seen.add(vacancy)
    return {'employer': employer, 'employers': state.get('employers', []),
            'sources': coverage, 'available_sources': state['sources'],
            'candidates': candidates, 'status': status, 'roles': rows,
            'linked_listings': [{'id': listing['id'], 'title': listing['title']}
                                for listing in state['jobs'] if employer
                                and (association := employer_link(state, listing['id']))
                                and association['employer_id'] == employer['id']]}
