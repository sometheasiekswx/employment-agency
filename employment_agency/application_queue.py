"""Effective job and application decisions for the SQLite workspace queues."""

from datetime import datetime, timezone


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


def project(state):
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
    submitted = submitted_job_ids(state)
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
        elif version:
            stage = 'active'
        elif job.get('saved'):
            stage = 'saved'
        else:
            continue
        saved = bool(job.get('saved') and stage not in ('submitted', 'removed'))
        archived = bool(version.get('archived') and (stage != 'submitted' or version.get('status') == 'submitted'))
        yield role, version.get('id'), stage, archived, at, saved
