"""Effective job and application decisions for the workspace queues."""

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


def pending_choices(state):
    """A legacy bookmark or agent mark is sufficient to keep a role for later."""
    choices = {job['id']: '' for job in state['jobs'] if job.get('saved')}
    choices.update((row['id'], row['updated_at'])
                   for row in state.get('agent_intents', []) if row['marked'])
    return choices


def equivalent_submissions(state):
    vacancies = {vacancy for row in state.get('company_rounds', [])
                 for vacancy in row.get('submitted_vacancies', [])}
    return {link['id'] for link in state.get('employer_links', []) if link['vacancy_id'] in vacancies}


def project(state, *, include_unqueued=False, choices=None):
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
    choices = pending_choices(state) if choices is None else choices
    equivalent = equivalent_submissions(state)
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
        elif job and role in choices and role not in equivalent:
            stage = 'saved'
        elif include_unqueued:
            stage = None
        else:
            continue
        saved = bool(job and role in choices and role not in equivalent and stage not in ('submitted', 'removed'))
        archived = bool(version.get('archived') and (stage != 'submitted' or version.get('status') == 'submitted'))
        yield role, version.get('id'), stage, archived, at, saved


QUEUE_SECTIONS = {'jobs', 'applications', 'application-comments', 'submission_attempts',
                  'historical_decisions', 'company_history_links', 'agent_intents',
                  'employer_links', 'company_rounds', ''}


def project_agent_queue(state):
    choices = pending_choices(state)
    if choices:
        for role, application, _, archived, _, saved in project(state, choices=choices):
            if saved:
                yield role, None if archived else application, choices[role]


def set_pending(state, job_id, saved, *, legacy_agent=False):
    from .companies import by_id

    if not isinstance(saved, bool):
        raise ValueError('Saved must be true or false')
    job = by_id(state['jobs'], job_id)
    if not job:
        raise ValueError('Choose a role in this workspace')
    job['saved'] = saved
    intents = state.get('agent_intents', [])
    old = by_id(intents, job_id)
    if old and old['marked'] == saved:
        return old
    record = {'id': job_id, 'marked': saved, 'updated_at': now()}
    if old is not None:
        old.update(record)
    elif legacy_agent and saved:
        state.setdefault('agent_intents', []).append(record)
    return record
