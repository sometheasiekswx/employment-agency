"""Durable progress for the jobs in one preparation run."""

from .store import digest, encode, now, uid


def item_id(run_id, job_id):
    return digest(encode([run_id, job_id]))[:32]


def item(state, run_id, job_id, *, create=False):
    key = item_id(run_id, job_id)
    rows = state.get('run_items', [])
    found = next((row for row in rows if row['id'] == key), None)
    if found is None and create:
        found = {'id': key, 'run_id': run_id, 'job_id': job_id, 'status': 'queued'}
        state.setdefault('run_items', []).append(found)
    return found


def reserve(row, cost):
    row['status'] = 'requesting'
    row['provider_attempt'] = {'id': uid(), 'reserved': cost, 'started_at': now(), 'status': 'requesting'}


def provider_outcome(row, status):
    if row.get('provider_attempt'):
        row['provider_attempt'].update(status=status, checked_at=now())
    row['status'] = status


def interrupt(state, run_id, job_id):
    row = item(state, run_id, job_id, create=True)
    provider_outcome(row, 'unknown')
    row['error'] = 'Interrupted paid request; billing uncertain. Not retried on resume.'
