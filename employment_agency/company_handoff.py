"""An exact, reserved application handoff for a person or an authorized agent."""

import re

from . import application_context, companies, packages
from .store import digest, encode, now, uid


def website_destination(state, job):
    return next((item for item in application_context.destinations(state, job) if item['channel'] == 'website'), None)


def approval(service, state, args):
    version = companies.by_id(state['applications'], args.get('application_id'))
    if not version or version['status'] not in ('draft', 'reviewed') or not version.get('manifest_hash'):
        raise ValueError('Choose an intact draft or reviewed application version')
    job = companies.by_id(state['jobs'], version.get('job_id'))
    if not job:
        raise ValueError('Add the exact employer application URL to the listing first')
    packages.check_submission_version(service.w.path, version, job, state['facts'])
    link = companies.check_slot(state, job['id'])
    destination = website_destination(state, job)
    if not destination:
        raise ValueError('Add the exact employer application URL to the listing first')
    documents = []
    for role in ('resume.pdf', 'cover-letter.pdf'):
        path = packages.path_for(service.w.path, version, role)
        documents.append({'path': path.relative_to(service.w.path).as_posix(),
                          'sha256': digest(path.read_bytes())})
    binding = {
        'job_id': job['id'], 'application_id': version['id'], 'employer_id': link['employer_id'],
        'vacancy_id': link['vacancy_id'], 'manifest_hash': version['manifest_hash'],
        'job_sha256': digest(encode(job)), 'destination': destination['value'], 'documents': documents,
    }
    return {'binding': binding, 'title': job['title'], 'employer': job['employer']}


def check_continuation(service, state, attempt):
    if not attempt or attempt['channel'] != 'manual' or attempt['status'] != 'handed_off':
        raise ValueError('There is no open self-application to continue')
    binding = attempt['binding']
    job = companies.by_id(state['jobs'], binding['job_id'])
    version = companies.by_id(state['applications'], binding['application_id'])
    if not job or not version or version['job_id'] != job['id']:
        raise ValueError('The reserved application version is unavailable')
    if blocker := application_context.role_blocker(state, job):
        raise ValueError(blocker[1])
    link = companies.check_slot(state, job['id'], attempt_id=attempt['id'])
    if (link['employer_id'], link['vacancy_id']) != (binding['employer_id'], binding['vacancy_id']):
        raise ValueError('The hiring employer or vacancy changed since reserving the application')
    website = website_destination(state, job)
    if (not website or website['value'] != binding['destination']
            or (attempt.get('self_apply_request') and website['source_url'] != binding['destination_source'])):
        raise ValueError('The application destination changed. Verify the outcome before starting again.')
    if attempt.get('self_apply_request') and application_context.listing_sha256(job) != binding['job_sha256']:
        raise ValueError('The listing changed. Verify the outcome before starting again.')
    if blocker := application_context.version_blocker(service.w.path, state, job, version):
        raise ValueError(blocker[1])
    documents = application_context.verify_documents(service.w.path, version)
    by_path = {document['path']: document['sha256'] for document in documents}
    if version['manifest_hash'] != binding['manifest_hash'] or any(
        by_path.get(document['path']) != document['sha256'] for document in binding['documents']
    ):
        raise ValueError('The reserved documents could not be verified')
    return attempt


def continuation(service, attempt_id):
    with service.w.lock:
        state = service.w.read()
        return check_continuation(service, state, companies.by_id(state.get('submission_attempts', []), attempt_id))


def start(service, args):
    request_key = args.get('request_key')
    if not isinstance(request_key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', request_key):
        raise ValueError('Provide a request key for this application start')
    request = {key: args.get(key) for key in ('job_id', 'application_id', 'destination', 'listing_sha256')}
    request_hash = digest(encode(request))
    with service.w.edit() as state:
        attempts = state.setdefault('submission_attempts', [])
        prior = next((row for row in attempts if row.get('self_apply_request') == request_key), None)
        if prior:
            if prior.get('request_hash') != request_hash:
                raise ValueError('This request key belongs to a different application start')
            return check_continuation(service, state, prior) if prior['status'] == 'handed_off' else prior
        job = companies.by_id(state['jobs'], request['job_id'])
        version = companies.by_id(state['applications'], request['application_id'])
        if not job or not version or version['job_id'] != job['id']:
            raise ValueError('Choose the exact application version for this role')
        listing_hash = application_context.listing_sha256(job)
        if request['listing_sha256'] is not None and request['listing_sha256'] != listing_hash:
            raise ValueError('The listing changed. Refresh the role before proceeding.')
        link = companies.employer_link(state, job['id'])
        for blocker in (application_context.role_blocker(state, job), companies.slot_blocker(state, job['id'])):
            if blocker:
                raise ValueError(blocker[1])
        destination = website_destination(state, job)
        if not destination:
            raise ValueError('Verify the website where this vacancy accepts applications')
        if request['destination'] is not None and request['destination'] != destination['value']:
            raise ValueError('The application destination changed. Refresh the role before proceeding.')
        if blocker := application_context.version_blocker(service.w.path, state, job, version):
            raise ValueError(blocker[1])
        documents = [row for row in application_context.verify_documents(service.w.path, version)
                     if row['role'] in ('resume.pdf', 'cover-letter.pdf')]
        if not any(row['role'] == 'resume.pdf' for row in documents):
            raise ValueError('Choose a version with a verified CV')
        binding = {'job_id': job['id'], 'application_id': version['id'], 'employer_id': link['employer_id'],
                   'vacancy_id': link['vacancy_id'], 'manifest_hash': version['manifest_hash'],
                   'job_sha256': listing_hash, 'destination': destination['value'], 'documents': documents,
                   'destination_source': destination['source_url']}
        timestamp = now()
        attempt = {'id': uid(), 'binding': binding, 'fingerprint': digest(encode(binding)),
                   'self_apply_request': request_key, 'request_hash': request_hash,
                   'channel': 'manual', 'submission_channel': 'website', 'application_id': version['id'],
                   'title': job['title'], 'employer': job['employer'], 'status': 'handed_off',
                   'created_at': timestamp, 'updated_at': timestamp}
        attempts.append(attempt)
        return attempt


def report(service, args):
    """Keep a user report even when recording the associated document fails."""
    from .service import text

    attempt_id = args['id']
    outcome = args.get('outcome')
    evidence = text(args.get('evidence', ''), 2000)
    if args.get('confirmed') is not True or outcome not in ('confirmed', 'not_sent') or not evidence:
        raise ValueError('Confirm the outcome and describe the evidence you checked')
    with service.w.lock:
        with service.w.edit() as state:
            attempt = companies.by_id(state.get('submission_attempts', []), attempt_id)
            if not attempt or not attempt.get('self_apply_request'):
                raise ValueError('Choose a self-application reservation')
            if attempt['status'] not in ('handed_off', 'unknown', outcome):
                raise ValueError('This application already has a different recorded outcome')
            receipt = {'evidence': evidence, 'source': 'user-report'}
            result = {'receipt': receipt}
            if outcome == 'confirmed':
                occurred_at = companies.valid_occurrence(args.get('occurred_at'), service.workspace_zone())
                channel = args.get('submission_channel', 'website')
                if channel not in (*application_context.CHANNELS, 'other'):
                    raise ValueError('Choose the channel used to apply')
                documents_used = args.get('documents_used')
                if documents_used is not None and not isinstance(documents_used, bool):
                    raise ValueError('Confirm whether you used this application version')
                destination = args.get('submission_destination', attempt['binding']['destination'] if channel == 'website' else '')
                destination = text(destination, 2000)
                # A manual outcome reports what happened. It does not verify a new destination for sending.
                result.update(occurred_at=occurred_at, submission_channel=channel, submission_destination=destination,
                              documents_used=documents_used, follow_up=text(args.get('follow_up', ''), 2000))
            if attempt.get('receipt'):
                if any(attempt.get(key) != value for key, value in result.items() if key != 'follow_up') or (
                    attempt['status'] == 'unknown' and outcome != 'confirmed'
                ):
                    raise ValueError('A different outcome has already been recorded for this reservation')
                if attempt['status'] == outcome:
                    return attempt
            else:
                attempt.update(result, updated_at=now(), status='not_sent' if outcome == 'not_sent' else 'unknown')
                if outcome == 'confirmed':
                    attempt['note'] = 'Submission evidence saved. Recording the application is pending.'
            if outcome == 'not_sent':
                return attempt

        try:
            with service.w.edit() as state:
                attempt = companies.by_id(state['submission_attempts'], attempt_id)
                application_id = None
                if attempt['documents_used'] is True:
                    version = companies.by_id(state['applications'], attempt['application_id'])
                    if not version or version['manifest_hash'] != attempt['binding']['manifest_hash']:
                        raise ValueError('The reserved document version could not be verified')
                    documents = application_context.verify_documents(service.w.path, version)
                    if not all(document in documents for document in attempt['binding']['documents']):
                        raise ValueError('The reserved document version could not be verified')
                    service.review(state, {'id': version['id'], 'status': 'submitted',
                                          'occurred_at': attempt['occurred_at'], 'comment': evidence})
                    application_id = version['id']
                attempt.update(status='confirmed', document_application_id=application_id, updated_at=now())
                attempt.pop('note', None)
                return attempt
        except (ValueError, KeyError, OSError) as exc:
            # A saved receipt is authority to retry recording, never to open the site anew.
            saved = companies.by_id(service.w.read()['submission_attempts'], attempt_id)
            return {**saved, 'note': 'Submission needs reconciliation. ' + str(exc)}


def handoff(service, action, args):
    if action == 'company-submission-continue':
        return continuation(service, args.get('id'))
    if action == 'company-submission-status':
        state = service.w.read()
        if job_id := args.get('job_id'):
            if not companies.by_id(state['jobs'], job_id):
                raise ValueError('Choose a role in this workspace')
            if (version_id := args.get('application_id')) and not any(
                app['job_id'] == job_id and app['id'] == version_id for app in state['applications']
            ):
                raise ValueError('Choose an application version for this role')
            return [attempt for attempt in state.get('submission_attempts', [])
                    if attempt['channel'] == 'manual' and attempt['binding']['job_id'] == job_id]
        return [attempt for attempt in state.get('submission_attempts', [])
                if attempt['channel'] == 'manual' and attempt['application_id'] == args.get('application_id')]
    if action == 'company-submission-review':
        result = approval(service, service.w.read(), args)
        result['id'] = uid()
        result['fingerprint'] = digest(encode(result))
        return result
    if action not in ('company-submission-reserve', 'company-submission-resolve', 'company-submission-follow-up'):
        raise ValueError('Unknown submission operation')
    attempt_id = args.get('id')
    if not isinstance(attempt_id, str) or not re.fullmatch('[a-f0-9]{32}', attempt_id):
        raise ValueError('Review an application handoff first')
    if action == 'company-submission-resolve':
        attempt = companies.by_id(service.w.read().get('submission_attempts', []), attempt_id)
        if attempt and attempt.get('self_apply_request'):
            return report(service, args)
    with service.w.edit() as state:
        attempts = state.setdefault('submission_attempts', [])
        attempt = companies.by_id(attempts, attempt_id)
        if action == 'company-submission-follow-up':
            from .service import text

            if not attempt or not attempt.get('self_apply_request') or attempt['status'] != 'confirmed':
                raise ValueError('Choose a recorded self-application')
            attempt.update(follow_up=text(args.get('follow_up', ''), 2000), updated_at=now())
            return attempt
        if action == 'company-submission-reserve':
            if args.get('approved') is not True:
                raise ValueError('Approve the exact documents and destination first')
            if attempt:
                if (attempt['channel'] != 'manual' or args.get('fingerprint') != attempt['fingerprint']
                        or args.get('application_id') != attempt['application_id']):
                    raise ValueError('Review the exact application again')
                return attempt
            reviewed = approval(service, state, args)
            reviewed['id'] = attempt_id
            fingerprint = digest(encode(reviewed))
            if fingerprint != args.get('fingerprint'):
                raise ValueError('The application or destination changed. Review it again.')
            attempt = {**reviewed, 'fingerprint': fingerprint, 'channel': 'manual',
                       'application_id': args['application_id'], 'status': 'handed_off',
                       'created_at': now(), 'updated_at': now()}
            attempts.append(attempt)
            return attempt
        if not attempt or attempt['channel'] != 'manual' or attempt['status'] != 'handed_off':
            raise ValueError('Choose a reserved submission handoff')
        outcome = args.get('outcome')
        evidence = args.get('evidence')
        if (args.get('confirmed') is not True or outcome not in ('confirmed', 'not_sent')
                or not isinstance(evidence, str) or not evidence.strip() or len(evidence) > 2000):
            raise ValueError('Confirm the outcome and describe the evidence you checked')
        if outcome == 'confirmed':
            attempt['occurred_at'] = companies.valid_occurrence(args.get('occurred_at'), service.workspace_zone())
            try:
                service.review(state, {'id': attempt['application_id'], 'status': 'submitted',
                                      'occurred_at': attempt['occurred_at'], 'comment': evidence.strip()})
            except ValueError as exc:
                # Retain the verified outcome even when the draft cannot be sealed.
                attempt['note'] = str(exc)
        attempt.update(status=outcome, updated_at=now(), receipt={'evidence': evidence.strip()})
        return attempt
