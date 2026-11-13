"""An exact, reserved application handoff for a person or an authorized agent."""

import re
from urllib.parse import urlsplit

from . import companies, packages
from .store import digest, encode, now, uid


def approval(service, state, args):
    version = companies.by_id(state['applications'], args.get('application_id'))
    if not version or version['status'] not in ('draft', 'reviewed') or not version.get('manifest_hash'):
        raise ValueError('Choose an intact draft or reviewed application version')
    job = companies.by_id(state['jobs'], version.get('job_id'))
    destination = urlsplit(job.get('url', '')) if job else urlsplit('')
    if (destination.scheme != 'https' or not destination.hostname or destination.username is not None
            or destination.password is not None or any(character.isspace() for character in job['url'])):
        raise ValueError('Add the exact employer application URL to the listing first')
    packages.check_submission_version(service.w.path, version, job, state['facts'])
    link = companies.check_slot(state, job['id'])
    documents = []
    for role in ('resume.pdf', 'cover-letter.pdf'):
        path = packages.path_for(service.w.path, version, role)
        documents.append({'path': path.relative_to(service.w.path).as_posix(),
                          'sha256': digest(path.read_bytes())})
    binding = {
        'job_id': job['id'], 'application_id': version['id'], 'employer_id': link['employer_id'],
        'vacancy_id': link['vacancy_id'], 'manifest_hash': version['manifest_hash'],
        'job_sha256': digest(encode(job)), 'destination': job['url'], 'documents': documents,
    }
    return {'binding': binding, 'title': job['title'], 'employer': job['employer']}


def handoff(service, action, args):
    if action == 'company-submission-status':
        state = service.w.read()
        return [attempt for attempt in state.get('submission_attempts', [])
                if attempt['channel'] == 'manual' and attempt['application_id'] == args.get('application_id')]
    if action == 'company-submission-review':
        result = approval(service, service.w.read(), args)
        result['id'] = uid()
        result['fingerprint'] = digest(encode(result))
        return result
    if action not in ('company-submission-reserve', 'company-submission-resolve'):
        raise ValueError('Unknown submission operation')
    attempt_id = args.get('id')
    if not isinstance(attempt_id, str) or not re.fullmatch('[a-f0-9]{32}', attempt_id):
        raise ValueError('Review an application handoff first')
    with service.w.edit() as state:
        attempts = state.setdefault('submission_attempts', [])
        attempt = companies.by_id(attempts, attempt_id)
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
