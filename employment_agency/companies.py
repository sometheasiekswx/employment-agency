"""Employer identity, effective submission history and application allowances."""

from calendar import monthrange
from datetime import date, datetime, time, timezone

from . import matching
from urllib.parse import urlsplit

from .store import digest, encode, now, uid

HELD = {'reserved', 'preparing', 'needs_user', 'awaiting_approval', 'cancelling',
        'executing', 'unknown', 'handed_off'}
SUBMITTED = {'submitted', 'sent', 'confirmed', 'applied'}
DEFAULT_COOLDOWN_MONTHS = 3
ROUND_CAPACITY = 2
UNNAMED_EMPLOYERS = frozenset({'unknown', 'confidential', 'undisclosed', 'n/a', 'not specified',
                               'company', 'hiring company', 'confidential company'})


class CompanyBlocked(ValueError):
    def __init__(self, code, message, job_id=None):
        super().__init__(message)
        self.code = code
        self.job_id = job_id


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


def calculate_round(state, employer, dates, zone, months, holds):
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
        if len(used) == ROUND_CAPACITY or ((used or unknown) and not vacancy):
            until = cooldown_after(instant, zone, months)
            assumed = date_only
    held = sorted(vacancy_id for (owner_id, vacancy_id) in holds if owner_id == employer_id)
    return {'id': employer_id, 'used': sorted(used | unknown), 'held': held,
            'submitted_vacancies': sorted(dates_by_vacancy), 'unresolved': unresolved,
            'cooldown_until': until.isoformat() if until else None,
            'cooldown_time_assumed': bool(until and assumed), 'over_limit': over_limit}


def update_rounds(state, zone):
    employers = state.get('employers', [])
    if not employers and 'company_rounds' not in state:
        return
    dates = submission_dates(state)
    holds = active_holds(state)
    months = state.get('company_cooldown_months', DEFAULT_COOLDOWN_MONTHS)
    state['company_rounds'] = [
        calculate_round(state, employer, dates, zone, months, holds) for employer in employers
    ]


def allowance(round_record, pending=None):
    round_record = round_record or {}
    pending = pending or {}
    until = round_record.get('cooldown_until')
    cooling = bool(until and clock() < datetime.fromisoformat(until))
    expired = bool(until and not cooling)
    used = set() if expired else set(round_record.get('used', []))
    held = set(round_record.get('held', []))
    unresolved = round_record.get('unresolved', [])
    # A single undated submission occupies a slot. A queued role or hold
    # cannot make its existing date ambiguous or start the cooldown.
    review = bool(unresolved and (expired or len(used) >= ROUND_CAPACITY
                                  or any(row['reason'] != 'Confirm the submission date' for row in unresolved)))
    pending_vacancies = set(pending.values())
    occupied = used | held | pending_vacancies
    overflow = len(occupied) > ROUND_CAPACITY
    return {**round_record, 'cooling': cooling, 'review_needed': review,
            'pending': sorted(pending_vacancies), 'pending_job_ids': sorted(pending),
            'occupied': sorted(occupied), 'overflow': overflow,
            'remaining': 0 if cooling or review else max(0, ROUND_CAPACITY - len(occupied))}


def active_holds(state, links=None):
    if links is None:
        links = {row['id']: row for row in state.get('employer_links', [])}
    result = {}
    for attempt in state.get('submission_attempts', []):
        if attempt['status'] in HELD and (link := links.get(attempt['binding']['job_id'])):
            key = (link['employer_id'], link['vacancy_id'])
            result.setdefault(key, set()).add(attempt['id'])
    return result


class ApplicationSlots:
    """Project the same effective pending queue used by both local queue endpoints."""

    def __init__(self, state, queue=None):
        from .application_queue import project

        self.links = {row['id']: row for row in state.get('employer_links', [])}
        self.employers = {row['id']: row for row in state.get('employers', [])}
        self.jobs = {row['id']: row for row in state['jobs']}
        if queue is None:
            queue = {role: (stage, saved) for role, _, stage, _, _, saved in project(state)}
        self.queue = queue
        self.pending = {role for role, (_, saved) in queue.items() if saved}
        pending_by_employer = {}
        for job_id in self.pending:
            if link := self.links.get(job_id):
                pending_by_employer.setdefault(link['employer_id'], {})[job_id] = link['vacancy_id']
        self.holds = active_holds(state, self.links)
        held_by_employer = {}
        for employer_id, vacancy_id in self.holds:
            held_by_employer.setdefault(employer_id, []).append(vacancy_id)
        rounds = {row['id']: row for row in state.get('company_rounds', [])}
        self.statuses = {employer_id: allowance({**rounds.get(employer_id, {}),
                                                'held': sorted(held_by_employer.get(employer_id, ()))},
                                               pending_by_employer.get(employer_id))
                         for employer_id in self.employers}

    def status(self, employer_id):
        return self.statuses.get(employer_id) or allowance(None)

    def blocker(self, job_id, attempt_id=None, *, for_pending=False):
        stage, _ = self.queue.get(job_id, (None, False))
        if stage == 'removed':
            return 'role_removed', 'Restore this role before applying'
        if stage == 'submitted':
            return 'already_submitted', 'This vacancy is already recorded as submitted'
        link = self.links.get(job_id)
        employer = self.employers.get(link['employer_id']) if link else None
        if not employer:
            return 'employer_unresolved', 'Confirm the actual hiring employer before applying'
        if employer_evidence_conflict(self.jobs[job_id], employer):
            return ('employer_evidence_conflict',
                    'The current listing names a different hiring employer. Recheck the listing before applying.')
        status = self.status(employer['id'])
        vacancy = link['vacancy_id']
        holds = self.holds.get((employer['id'], vacancy), set())
        if vacancy in status.get('submitted_vacancies', []):
            return 'already_submitted', 'This vacancy is already recorded as submitted'
        if status['cooling']:
            return 'company_paused', 'This company is paused until ' + status['cooldown_until']
        if status['review_needed']:
            return 'company_history_unresolved', 'Review this company’s unresolved application history before applying'
        if status['overflow']:
            return 'company_queue_overflow', 'Narrow To apply choices for this company to its available application slots'
        if not for_pending and holds - {attempt_id}:
            return 'application_in_progress', 'An active or uncertain attempt already holds this vacancy'
        if vacancy not in status['occupied'] and not status['remaining']:
            return 'company_slots_used', 'Both application slots are in use at this company'
        return None

    def selection_blockers(self, job_ids):
        problems = {}
        by_company = {}
        for job_id in job_ids:
            if blocker := self.blocker(job_id):
                problems[job_id] = blocker
                continue
            link = self.links[job_id]
            by_company.setdefault(link['employer_id'], {}).setdefault(link['vacancy_id'], []).append(job_id)
        for employer_id, vacancies in by_company.items():
            status = self.status(employer_id)
            extra = vacancies.keys() - set(status['occupied'])
            for vacancy, listing_ids in vacancies.items():
                if len(listing_ids) > 1:
                    blocker = ('duplicate_vacancy', 'Choose one listing for this vacancy before starting')
                elif vacancy in extra and len(extra) > status['remaining']:
                    blocker = ('company_slots_used', 'Choose which roles to apply for within '
                               + self.employers[employer_id]['name'] + '’s available slots')
                else:
                    continue
                problems.update(dict.fromkeys(listing_ids, blocker))
        return problems

    def check_pending(self, job_id):
        if blocker := self.blocker(job_id, for_pending=True):
            raise CompanyBlocked(*blocker, job_id=job_id)


def company_status(state, employer_id):
    return allowance(by_id(state.get('company_rounds', []), employer_id))


def job_status(state, job_id):
    slots = ApplicationSlots(state)
    link = slots.links.get(job_id)
    return slots.status(link['employer_id'] if link else None)


def employer_name_ids(employers):
    by_name = {}
    for employer in employers:
        for name in (employer['name'], *employer.get('aliases', [])):
            if label := name_key(name):
                by_name.setdefault(label, set()).add(employer['id'])
    return by_name


def employer_evidence_conflict(job, employer):
    evidence = job.get('employer_evidence', {})
    if not isinstance(evidence, dict) or not evidence.get('name'):
        return False
    accepted = {name_key(name) for name in (employer['name'], *employer.get('aliases', []))}
    return name_key(evidence['name']) not in accepted


def published_alias(job):
    from .application_context import https_address

    evidence = job.get('employer_evidence')
    listed = job.get('employer', '')
    if (isinstance(evidence, dict) and evidence.get('source') == 'published-hiring-employer'
            and evidence.get('url') == job.get('url') and https_address(evidence.get('url'))
            and isinstance(evidence.get('name'), str)
            and name_key(listed) not in (UNNAMED_EMPLOYERS | {''})
            and name_key(evidence['name']) == name_key(listed)):
        return listed
    return None


def alias_confirmation(job):
    alias = published_alias(job)
    if not alias:
        return {}
    evidence = job['employer_evidence']
    material = [job.get(key) for key in ('id', 'url', 'source', 'source_requisition', 'vacancy_requisition')]
    material.extend(evidence.get(key) for key in ('name', 'url', 'source', 'requisition'))
    return {'published_alias': alias, 'published_alias_proof': digest(encode([alias, *material]))}


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
        return {'name': name, 'needs_review': True, 'remaining': 0, 'research_eligible': False,
                'reason': 'Verify which hiring employer this is'}
    employer = by_id(state.get('employers', []), next(iter(ids), None))
    label = employer['name'] if employer else name
    aliases = employer.get('aliases', []) if employer else []
    unresolved = history_review(state, {name_key(value) for value in (label, *aliases)}, submission_dates(state))
    employer_id = employer['id'] if employer else None
    research_status = company_status(state, employer_id)
    status = ApplicationSlots(state).status(employer_id)
    needs_review = bool(unresolved or research_status['review_needed'])
    return {
        'name': label, 'id': employer['id'] if employer else None, 'aliases': aliases,
        'submitted_count': len(status.get('submitted_vacancies', [])),
        'cooling': status['cooling'], 'cooldown_until': status.get('cooldown_until'),
        'remaining': 0 if needs_review else status['remaining'], 'needs_review': needs_review,
        'research_eligible': bool(not needs_review and research_status['remaining']),
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
    slots = ApplicationSlots(state)
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
                'remaining': slots.status(employer_id)['remaining'], 'research_eligible': bool(status['remaining']),
                'jobs': [],
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
        if key in pending or not group.pop('research_eligible'):
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
            current_employer = employers.get(link['employer_id']) if link else None
            verified = bool(current_employer and not employer_evidence_conflict(job, current_employer))
            roles.append({**row, 'job': {**job, 'hiring_employer_verified': verified}})
        if roles:
            companies.append({**group, 'sources': list(group['sources'].values()), 'roles': roles})
    companies.sort(key=lambda group: (
        bool(group['submitted_count']), not group['roles'][0]['match']['eligible_for_preparation'],
        len(group['roles'][0]['match']['gaps']), -len(group['roles'][0]['match']['fact_ids']),
    ))
    return {'companies': companies[:5], 'needs_review': list(pending.values())}


def slot_blocker(state, job_id, attempt_id=None):
    return ApplicationSlots(state).blocker(job_id, attempt_id)


def check_slot(state, job_id, attempt_id=None):
    if blocker := slot_blocker(state, job_id, attempt_id):
        raise CompanyBlocked(*blocker, job_id=job_id)
    return employer_link(state, job_id)


def map_job(state, args, zone, *, provenance=None):
    job = by_id(state['jobs'], args['job_id'])
    if not job or args.get('confirmed') is not True:
        raise ValueError('Confirm the actual hiring employer for this listing')
    employers = state.setdefault('employers', [])
    employer_id = args.get('employer_id')
    existing = employer_link(state, job['id'])
    replace_employer = args.get('replace_employer') is True
    if existing and (replace_employer or employer_id not in (None, '', existing['employer_id'])):
        if not replace_employer:
            raise ValueError('This listing already has a confirmed employer')
        if job['id'] in submission_dates(state) or any(
            row['binding']['job_id'] == job['id'] and row['status'] in HELD
            for row in state.get('submission_attempts', [])
        ):
            raise ValueError('Reconcile the submitted or active record before changing the employer')
    employer = by_id(employers, employer_id or (existing and not replace_employer and existing['employer_id']))
    if employer_id and not employer:
        raise ValueError('Choose an existing employer')
    names = employer_name_ids(employers)
    record_alias = args.get('record_alias') is True
    if record_alias:
        if provenance or not employer_id:
            raise ValueError('Choose an existing hiring employer before recording its published alias')
        pending_confirmation = alias_confirmation(job)
        if not pending_confirmation or any(args.get(key) != value for key, value in pending_confirmation.items()):
            raise CompanyBlocked(
                'employer_alias_changed',
                'Review the current published hiring employer and confirm its alias again.',
                job_id=job['id'],
            )
    job_source = next((source for source in state['sources']
                       if f"{source['kind']}:{source['board']}" == job.get('source')), None)
    source_owner = None
    if job_source:
        from .job_feeds import EMPLOYER_BOARDS

        if job_source['kind'] in EMPLOYER_BOARDS:
            source_owner = source_employer(state, job_source['id'])
    if not employer:
        name = args.get('name') or job['employer']
        if not isinstance(name, str) or not name.strip() or len(name) > 300:
            raise ValueError('Enter the hiring employer name')
        if name_key(name) in UNNAMED_EMPLOYERS:
            raise ValueError('Enter the confirmed hiring employer’s name')
        if name_key(name) in names:
            raise ValueError('Choose the existing employer or enter a distinct verified name')
        employer = {'id': uid(), 'name': name.strip(), 'aliases': [], 'source_ids': []}
        employers.append(employer)
    if source_owner and source_owner != employer['id']:
        raise ValueError('The listing source belongs to another company. Recheck the employer.')
    listed = job['employer']
    listed_key = name_key(listed)
    if provenance is None and (record_alias or (listed_key == name_key(employer['name']) and 'record_alias' not in args)):
        if names.get(listed_key, set()) - {employer['id']}:
            raise ValueError('This listing label already belongs to another company. Confirm the employer without recording the label as an alias.')
        if listed not in employer['aliases']:
            employer['aliases'].append(listed)
    if employer_evidence_conflict(job, employer):
        raise ValueError('The current listing names a different hiring employer. Recheck the listing before confirming.')
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
        matching_requisition = next((link for link in state.get('employer_links', [])
                                     if link['employer_id'] == employer['id']
                                     and link.get('requisition') == requisition), None)
        if same and matching_requisition and same['vacancy_id'] != matching_requisition['vacancy_id']:
            raise ValueError('The selected listing and requisition refer to different vacancies')
        same = matching_requisition or same
    same_employer = existing and existing['employer_id'] == employer['id']
    vacancy_id = same['vacancy_id'] if same else (existing['vacancy_id'] if same_employer else uid())
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
    elif existing and not same_employer:
        link.pop('requisition', None)
    if args.get('submitted_on'):
        if job['id'] not in submission_dates(state):
            raise ValueError('Record a submission before confirming its date')
        link['submitted_on'] = valid_occurrence(args['submitted_on'], zone)
    verify_existing_source = (provenance and provenance.get('source') == 'verified-official-listing'
                              and link.get('provenance', {}).get('source') in (None, 'user-confirmation'))
    if not same_employer or verify_existing_source:
        link['provenance'] = {
            **(provenance or {'actor': 'workspace-owner', 'source': 'user-confirmation', 'url': job.get('url', '')}),
            'verified_at': now(),
        }
    if existing and not same_employer:
        link.pop('publisher_provenance', None)
    if not existing:
        state.setdefault('employer_links', []).append(link)
    return link


def confirm_researched_listing(state, args, zone):
    from .application_context import https_address
    from .company_logo_pages import page_address
    from .service import text

    job = by_id(state['jobs'], args.get('job_id'))
    official_url = args.get('source_url')
    evidence = text(args.get('evidence', ''), 2000)
    name = text(args.get('name', ''), 300)
    if (args.get('verified') is not True or not job or not https_address(official_url) or not evidence or not name
            or not https_address(job.get('url'))
            or urlsplit(official_url).hostname != urlsplit(job['url']).hostname):
        raise ValueError('Provide the official same-site listing evidence identifying the hiring employer')
    published = job.get('employer_evidence', {}).get('name') or job['employer']
    matches = employer_name_ids(state.get('employers', [])).get(name_key(name), set())
    names = {name_key(name), name_key(published)}
    if name_key(published) != name_key(name) and (
        not matches or employer_name_ids(state.get('employers', [])).get(name_key(published), set()) != matches
    ):
        raise ValueError('The listing and research identify different hiring employers')
    if (len(matches) > 1 or (args.get('employer_id') and args['employer_id'] not in matches)
            or names.intersection({'unknown', 'confidential', 'undisclosed', ''})):
        raise ValueError('The hiring employer identity needs user confirmation')
    publisher = None
    if 'publisher_evidence' in args:
        publisher = text(args['publisher_evidence'], 1000)
        if not publisher:
            raise ValueError('Describe how you verified that the site belongs to the hiring employer')
        page_address(official_url)
    link = map_job(state, {'job_id': job['id'], 'name': name, 'employer_id': next(iter(matches), None),
                           'requisition': args.get('requisition', job.get('employer_evidence', {}).get('requisition', '')),
                           'confirmed': True}, zone, provenance={
                               'actor': 'research-agent', 'source': 'verified-official-listing',
                               'url': official_url, 'evidence': evidence, 'published_name': published,
                           })
    if publisher:
        binding = {'url': official_url, 'evidence': publisher}
        prior = link.get('publisher_provenance') or {}
        if any(prior.get(key) != value for key, value in binding.items()):
            link['publisher_provenance'] = {**binding, 'verified_at': now()}
    return link


def associate_board(state, source, employer_id=None, name=None, *, evidence_url):
    """Persist a board owner when its official publishing relationship has been checked."""
    from .job_feeds import EMPLOYER_BOARDS

    if source['kind'] not in EMPLOYER_BOARDS:
        raise ValueError('Choose an employer-owned careers board')
    employer = by_id(state.get('employers', []), employer_id)
    owner = source_employer(state, source['id'])
    if owner and owner != employer_id:
        raise ValueError('The careers board already has a different verified hiring employer')
    if not employer:
        employer = {'id': uid(), 'name': name, 'aliases': [], 'source_ids': []}
        state.setdefault('employers', []).append(employer)
    if source['id'] not in employer['source_ids']:
        employer['source_ids'].append(source['id'])
        source['employer_provenance'] = {'actor': 'research-agent', 'source': 'verified-employer-board',
                                         'url': evidence_url, 'verified_at': now()}
    return employer


def accepted_board_names(source, employer):
    return {name_key(value) for value in (employer['name'], *employer['aliases'], source['board'])}


def link_source_jobs(state, source, jobs, zone):
    from .job_feeds import EMPLOYER_BOARDS

    employer_id = source_employer(state, source['id'])
    if not employer_id or source['kind'] not in EMPLOYER_BOARDS:
        return
    employer = by_id(state['employers'], employer_id)
    accepted_names = accepted_board_names(source, employer)
    source_key = f"{source['kind']}:{source['board']}"
    mapped = {link['id']: link for link in state.get('employer_links', [])}
    vacancies = {
        listing['vacancy_requisition']: listing['id']
        for listing in state['jobs'] if listing.get('vacancy_requisition')
        and listing.get('source') == f"{source['kind']}:{source['board']}"
        and (link := mapped.get(listing['id'])) and link['employer_id'] == employer_id
    }
    for job in jobs:
        if (job['id'] in mapped or job.get('source') != source_key
                or name_key(job['employer']) not in accepted_names):
            continue
        requisition = job.get('vacancy_requisition')
        map_job(state, {'job_id': job['id'], 'employer_id': employer_id,
                        'same_job_id': vacancies.get(requisition),
                        'requisition': f"{job['source']}:{requisition}" if requisition else job.get('source_requisition', ''),
                        'confirmed': True}, zone, provenance={
                            'actor': 'discovery', 'source': 'verified-employer-board', 'source_id': source['id'],
                            'url': job['url'], 'source_requisition': job.get('source_requisition', ''),
                        })
        if requisition:
            vacancies.setdefault(requisition, job['id'])


def link_verified_listing(state, job, zone):
    """Reuse exact posting evidence or a confirmed employer's explicitly published alias."""
    from .application_context import https_address

    if employer_link(state, job['id']):
        return
    alias = published_alias(job)
    if not alias:
        return
    evidence = job['employer_evidence']
    employers = state.get('employers', [])
    candidates = employer_name_ids(employers).get(name_key(alias), set())
    source_host = urlsplit(evidence['url']).hostname
    known_sources = {item['id']: item for item in state['jobs']}
    linked_hosts = {link['employer_id'] for link in state.get('employer_links', [])
                    if link.get('provenance', {}).get('source') == 'verified-official-listing'
                    and (other := known_sources.get(link['id']))
                    and https_address(other.get('url'))
                    and urlsplit(other['url']).hostname == source_host}
    # The advert's spelling is independent evidence only when the publisher has
    # already been verified as an official source for this exact employer.
    if len(candidates) != 1 or candidates != linked_hosts:
        return
    map_job(state, {'job_id': job['id'], 'employer_id': next(iter(candidates)),
                    'requisition': evidence.get('requisition', ''), 'confirmed': True}, zone, provenance={
                        'actor': 'discovery', 'source': evidence['source'], 'url': evidence['url'],
                        'published_name': evidence['name'],
                    })


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
    slots = ApplicationSlots(state)
    status = slots.status(employer['id'] if employer else None)
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
    return {'job_id': job_id, **alias_confirmation(job),
            'employer': employer, 'employers': state.get('employers', []),
            'sources': coverage, 'available_sources': state['sources'],
            'candidates': candidates, 'status': status, 'roles': rows,
            'linked_listings': [{'id': listing['id'], 'title': listing['title']}
                                for listing in state['jobs'] if employer
                                and (association := employer_link(state, listing['id']))
                                and association['employer_id'] == employer['id']]}
