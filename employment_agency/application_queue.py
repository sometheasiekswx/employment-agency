"""Effective job and application decisions for the SQLite workspace queues."""

from datetime import datetime, timezone

from .store import now


def timestamp(value):
    try:
        stamp = datetime.fromisoformat(value)
        return (stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)).timestamp()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def application_time(version):
    created = timestamp(version.get('created_at'))
    if version['status'] != 'submitted':
        return created
    submitted = version.get('submitted_at') or next((
        event.get('at') for event in version.get('comments', [])
        if event.get('status') == 'submitted' and event.get('kind') != 'comment'
    ), None)
    submitted = timestamp(submitted)
    return created if submitted is None else submitted


def project(state, *, include_unqueued=False):
    from .companies import submission_dates
    from .service import application_role, corrected_submission, legacy_rejections, submitted_job_ids

    selected = {}
    for version in state['applications']:
        if version['status'] == 'submitted' and corrected_submission(version, state):
            continue
        at = application_time(version)
        created = timestamp(version.get('created_at'))
        priority = (version['status'] == 'submitted', not version.get('archived'),
                    at if at is not None else float('-inf'),
                    created if created is not None else float('-inf'))
        role = application_role(version)
        if role not in selected or priority >= selected[role][0]:
            selected[role] = (priority, version, at)
    submitted = submitted_job_ids(state) | submission_dates(state).keys()
    receipt_roles = {attempt['binding']['job_id'] for attempt in state.get('submission_attempts', [])
                     if attempt['status'] == 'confirmed'}
    legacy_removed = legacy_rejections(state)
    jobs = {job['id']: job for job in state['jobs']}
    unlisted = state.get('unlisted_removals', {})
    for role in dict.fromkeys([*jobs, *selected, *unlisted]):
        job = jobs.get(role, {})
        _, version, at = selected.get(role, (None, {}, None))
        removals = job.get('removals') or unlisted.get(role, [])
        if (removals and not removals[-1].get('restored_at')) or role in legacy_removed:
            stage = 'removed'
        elif role in submitted or job.get('prior_application') == 'submitted':
            stage = 'submitted'
            if role in receipt_roles and version.get('status') != 'submitted':
                version, at = {}, None
        elif version:
            stage = 'active'
        elif job.get('saved'):
            stage = 'saved'
        elif not include_unqueued:
            continue
        else:
            stage = None
        saved = bool(job.get('saved') and stage not in ('submitted', 'removed'))
        archived = bool(version.get('archived') and (stage != 'submitted' or version.get('status') == 'submitted'))
        yield role, version.get('id'), stage, archived, at, saved


QUEUE_SECTIONS = {'jobs', 'applications', 'application-comments', 'submission_attempts',
                  'historical_decisions', 'company_history_links', ''}


def pending_agent_roles(state):
    existing = {job['id'] for job in state['jobs']}
    links = {row['id']: row['vacancy_id'] for row in state.get('employer_links', [])}
    submitted_vacancies = {vacancy for row in state.get('company_rounds', [])
                           for vacancy in row.get('submitted_vacancies', [])}
    for role, application, stage, archived, _, _ in project(state, include_unqueued=True):
        if role in existing and stage not in ('submitted', 'removed') and links.get(role) not in submitted_vacancies:
            yield role, None if archived else application


def project_agent_queue(state):
    marked = {row['id']: row['updated_at'] for row in state.get('agent_intents', []) if row['marked']}
    if marked:
        for role, application in pending_agent_roles(state):
            if role in marked:
                yield role, application, marked[role]


def mark_agent(state, job_id, marked):
    from .companies import by_id

    if not isinstance(marked, bool):
        raise ValueError('Choose whether to mark this role for your agent')
    if not by_id(state['jobs'], job_id):
        raise ValueError('Choose a role in this workspace')
    if marked and not any(role == job_id for role, _ in pending_agent_roles(state)):
        raise ValueError('Only a role awaiting application can be marked for your agent')
    intents = state.setdefault('agent_intents', [])
    old = by_id(intents, job_id)
    if old and old['marked'] == marked:
        return old
    record = {'id': job_id, 'marked': marked, 'updated_at': now()}
    if old is not None:
        old.update(record)
    elif marked:
        intents.append(record)
    return record
