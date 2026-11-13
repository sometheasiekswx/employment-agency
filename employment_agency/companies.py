"""Employer identity, effective submission history and application allowances."""

from calendar import monthrange
from datetime import date, datetime, time, timezone

from . import matching
from .store import digest, encode, uid

HELD = {'executing', 'unknown', 'handed_off'}
SUBMITTED = {'submitted', 'sent', 'confirmed', 'applied'}
DEFAULT_COOLDOWN_MONTHS = 3


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


def source_research_name(state, source):
    return next((
        row['research_name'] for row in state['sources']
        if (row['kind'], row['board']) == (source['kind'], source['board']) and row.get('research_name')
    ), None)


def occurrence(value, zone):
    """Return an instant and its precision. Naive times belong to the workspace."""
    if not isinstance(value, str) or not value:
        return None, False
    try:
        if len(value) == 10:
            return datetime.combine(date.fromisoformat(value), time.min, zone), True
        instant = datetime.fromisoformat(value)
        return instant if instant.tzinfo else instant.replace(tzinfo=zone), False
    except ValueError:
        return None, False


def valid_occurrence(value, zone):
    instant, date_only = occurrence(value, zone)
    current = clock()
    if not instant or (instant.date() > current.astimezone(zone).date() if date_only else instant > current):
        raise ValueError('Enter the actual submission date or time, up to today')
    return value if date_only else instant.isoformat()


def cooldown_after(instant, zone, months):
    local = instant.astimezone(zone)
    year, month_index = divmod(local.year * 12 + local.month - 1 + months, 12)
    month = month_index + 1
    day = min(local.day, monthrange(year, month)[1])
    target = local.replace(year=year, month=month, day=day)
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
            dates.setdefault(version.get('job_id'), []).append(application_occurrence(version))
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


def application_occurrence(version):
    return version.get('occurred_at') or version.get('submitted_at') or next((
        event.get('at') for event in version.get('comments', [])
        if event.get('status') == 'submitted' and event.get('kind') != 'comment'
    ), None)


def submission_occurrence(values, zone):
    """Prefer an actual time to an assumed midnight on the same day."""
    candidates = [parsed for value in values if (parsed := occurrence(value, zone))[0]]
    if not candidates:
        return None, False
    return min(candidates, key=lambda parsed: (
        parsed[0].astimezone(zone).date(), parsed[1], parsed[0].astimezone(timezone.utc),
    ))


def submission_time(values, zone):
    instant, assumed = submission_occurrence(values, zone)
    return {'at': instant.isoformat(), 'assumed': assumed} if instant else None


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
        {'title': app['title'], 'reason': 'Verify the employer for this submitted application'}
        for app in state['applications'] if app.get('job_id') not in known_jobs
        and app.get('job_id') in dates and app.get('job_id') not in linked
        and name_key(app.get('employer', '')) in names
    ] + [
        {'history_id': history_id(record), 'title': record.get('title') or record.get('employer'),
         'date': record.get('sentAt'), 'reason': 'Link the historical submission to a listing'}
        for record in state.get('historical_decisions', [])
        if name_key(record.get('status', '')) in SUBMITTED and name_key(record.get('employer', '')) in names
        and history_id(record) not in historical
    ]


def calculate_round(state, employer, dates, zone, months):
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
        instant, date_only = submission_occurrence(candidates, zone)
        if instant:
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
    assumed = False
    over_limit = 0
    for instant, vacancy, date_only in sorted(events, key=lambda event: (
        event[0].astimezone(timezone.utc), not event[1], event[1],
    )):
        if until and instant >= until:
            used.clear()
            until = None
        if until:
            if vacancy:
                over_limit += 1
                extended = cooldown_after(instant, zone, months)
                # Month-end clamping or a repeated local hour can produce an earlier deadline.
                if extended >= until:
                    until = extended
                    assumed = date_only
            continue
        if vacancy:
            used.add(vacancy)
        if len(used) == 2 or ((used or unknown) and not vacancy):
            until = cooldown_after(instant, zone, months)
            assumed = date_only
    held = sorted({
        link['vacancy_id']
        for attempt in state.get('submission_attempts', []) if attempt['status'] in HELD
        for link in [employer_link(state, attempt['binding']['job_id'])]
        if link and link['employer_id'] == employer_id
    } - dates_by_vacancy.keys())
    return {'id': employer_id, 'used': sorted(used | unknown), 'held': held,
            'submitted_vacancies': sorted(dates_by_vacancy), 'unresolved': unresolved,
            'cooldown_until': until.isoformat() if until else None,
            'cooldown_time_assumed': bool(until and assumed), 'over_limit': over_limit}


def update_rounds(state, zone):
    employers = state.get('employers', [])
    if not employers and 'company_rounds' not in state:
        return
    dates = submission_dates(state)
    months = state.get('company_cooldown_months', DEFAULT_COOLDOWN_MONTHS)
    state['company_rounds'] = [
        calculate_round(state, employer, dates, zone, months) for employer in employers
    ]


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


def employer_name_ids(employers):
    by_name = {}
    for employer in employers:
        for name in (employer['name'], *employer.get('aliases', [])):
            if label := name_key(name):
                by_name.setdefault(label, set()).add(employer['id'])
    return by_name


def discovery_employer(job, link, name_ids):
    if link:
        return link['employer_id']
    matches = name_ids.get(name_key(job.get('employer', '')), ())
    return next(iter(matches)) if len(matches) == 1 else None


def discovery_status(state, job):
    return company_status(state, discovery_employer(
        job, employer_link(state, job['id']), employer_name_ids(state.get('employers', [])),
    ))


def source_cooldown(state, source_id):
    return company_status(state, source_employer(state, source_id))['cooling']


def research_employer(state, name):
    names = employer_name_ids(state.get('employers', []))
    ids = names.get(name_key(name), set())
    if len(ids) > 1:
        return {'name': name, 'needs_review': True, 'remaining': 0,
                'reason': 'Verify which hiring employer this is'}
    employer = by_id(state.get('employers', []), next(iter(ids), None))
    label = employer['name'] if employer else name
    aliases = employer.get('aliases', []) if employer else []
    unresolved = history_review(state, {name_key(value) for value in (label, *aliases)}, submission_dates(state))
    status = company_status(state, employer['id'] if employer else None)
    needs_review = bool(unresolved or status['review_needed'])
    return {
        'name': label, 'id': employer['id'] if employer else None, 'aliases': aliases,
        'submitted_count': len(status.get('submitted_vacancies', [])),
        'cooling': status['cooling'], 'cooldown_until': status.get('cooldown_until'),
        'remaining': 0 if needs_review else status['remaining'], 'needs_review': needs_review,
        'unresolved': unresolved,
    }


def posting_keys(job):
    keys = set()
    for field in ('source_requisition', 'vacancy_requisition'):
        if job.get(field):
            keys.add((field, job.get('source'), job[field]))
    if job.get('url'):
        keys.add(('url', job['url']))
    return keys


def research(state, profile, job_ids):
    """Rank the checked listings, putting first-time employers before return visits."""
    from .service import legacy_rejections

    employers = {row['id']: row for row in state.get('employers', [])}
    name_ids = employer_name_ids(employers.values())
    links = {row['id']: row for row in state.get('employer_links', [])}
    sources = {f"{source['kind']}:{source['board']}": source for source in state['sources']}
    rounds = {row['id']: allowance(row) for row in state.get('company_rounds', [])}
    submitted = submission_dates(state)
    submitted_postings = {key for job in state['jobs'] if job['id'] in submitted for key in posting_keys(job)}
    rejected = legacy_rejections(state)
    listing_ids = {job['id'] for job in state['jobs']}
    unresolved = {
        name_key(app.get('employer', ''))
        for app in state['applications'] if app.get('job_id') not in listing_ids
        and app.get('job_id') in submitted and app.get('job_id') not in links
    }
    wanted = set(job_ids)
    employer_groups = {}
    pending = {}
    unresolved_names = {
        name_key(job['employer'])
        for job in state['jobs'] if job['id'] in submitted and job['id'] not in links
    } | unresolved
    linked_history = {row['id'] for row in state.get('company_history_links', [])}
    unresolved_names.update(
        name_key(row.get('employer', '')) for row in state.get('historical_decisions', [])
        if name_key(row.get('status', '')) in SUBMITTED and history_id(row) not in linked_history
    )
    for job in state['jobs']:
        if job['id'] not in wanted:
            continue
        link = links.get(job['id'])
        employer_id = discovery_employer(job, link, name_ids)
        status = rounds.get(employer_id, allowance(None))
        removals = job.get('removals', [])
        if (job['id'] in submitted or job['id'] in rejected
                or submitted_postings.intersection(posting_keys(job))
                or (removals and not removals[-1].get('restored_at'))
                or status['cooling']
                or (link and link['vacancy_id'] in status.get('submitted_vacancies', []))
                or (link and link['vacancy_id'] in status.get('held', []))):
            continue
        name = job.get('employer', '').strip()
        if not name or name_key(name) == 'unknown':
            continue
        key = employer_id or name_key(name)
        if key not in employer_groups:
            employer = employers.get(employer_id)
            aliases = (employer['name'], *employer.get('aliases', [])) if employer else (name,)
            if (status['review_needed'] or any(name_key(alias) in unresolved_names for alias in aliases)
                    or (not employer and name_key(name) in name_ids)):
                pending[key] = {'name': name, 'reason': 'Verify the hiring employer and earlier submissions'}
            employer_groups[key] = {
                'id': employer_id, 'name': employer['name'] if employer else name,
                'submitted_count': len(status.get('submitted_vacancies', [])),
                'remaining': status['remaining'], 'jobs': [],
                'sources': {
                    source['id']: source for source in sources.values()
                    if employer and source['id'] in employer.get('source_ids', [])
                },
            }
        employer_groups[key]['jobs'].append(job)
        source = sources.get(job.get('source'))
        if source:
            employer_groups[key]['sources'][source['id']] = source

    companies = []
    for key, group in employer_groups.items():
        if key in pending or not group['remaining']:
            continue
        seen = set()
        roles = []
        for row in matching.ranked(group.pop('jobs'), profile, state['facts']):
            job = row['job']
            link = links.get(job['id'])
            keys = posting_keys(job)
            if link:
                keys.add(('vacancy', link['vacancy_id']))
            if seen.intersection(keys) or row['match']['hard_conflicts']:
                continue
            seen.update(keys)
            if not job.get('salary', {}).get('max') and not job.get('salary', {}).get('min'):
                row['match']['unknowns'].append('Advertised pay is not listed')
            if (profile.get('needs_sponsorship') and job.get('sponsorship') != 'yes'
                    and job.get('eligibility') == 'confirmed'):
                row['match']['unknowns'].append('Sponsorship availability needs confirmation')
            roles.append(row)
        if roles:
            companies.append({**group, 'sources': list(group['sources'].values()), 'roles': roles})
    companies.sort(key=lambda group: (
        bool(group['submitted_count']), not group['roles'][0]['match']['eligible_for_preparation'],
        len(group['roles'][0]['match']['gaps']), -len(group['roles'][0]['match']['fact_ids']),
    ))
    return {'companies': companies[:5], 'needs_review': list(pending.values())}


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


def map_job(state, args, zone, *, source_listing=False):
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
    if not source_listing and job['employer'] and job['employer'] not in employer['aliases']:
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
    mapped = {link['id']: link for link in state.get('employer_links', [])}
    vacancies = {
        listing['vacancy_requisition']: listing['id']
        for listing in state['jobs'] if listing.get('vacancy_requisition')
        and listing.get('source') == f"{source['kind']}:{source['board']}"
        and (link := mapped.get(listing['id'])) and link['employer_id'] == employer_id
    }
    for job in jobs:
        if job['id'] in mapped:
            continue
        requisition = job.get('vacancy_requisition')
        map_job(state, {'job_id': job['id'], 'employer_id': employer_id,
                        'same_job_id': vacancies.get(requisition),
                        'requisition': f"{job['source']}:{requisition}" if requisition else job.get('source_requisition', ''),
                        'confirmed': True}, zone, source_listing=True)
        if requisition:
            vacancies.setdefault(requisition, job['id'])


def company_roles(state, job_id, profile_id):
    from .service import legacy_rejections

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
            rejected = legacy_rejections(state)
            links = {row['id']: row for row in state.get('employer_links', [])}
            for other in state['jobs']:
                other_link = links.get(other['id'])
                removals = other.get('removals', [])
                if (other_link and other_link['employer_id'] == employer['id']
                        and other.get('availability') != 'closed'
                        and other['id'] not in rejected
                        and not (removals and not removals[-1].get('restored_at'))
                        and other_link['vacancy_id'] not in status.get('submitted_vacancies', [])
                        and other_link['vacancy_id'] not in status.get('held', [])):
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
