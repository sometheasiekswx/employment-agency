"""Live application context, verified role destinations, and scoped answers."""

import ipaddress
import re
from urllib.parse import urlsplit

from . import companies, master, matching, packages
from .application_queue import project
from .public_pages import pdf_vacancy_url, safe_link
from .store import digest, encode, now, uid
from .workspaces import inside, settings

CHANNELS = ('website', 'telegram', 'email')
CONTEXT_BATCH_LIMIT = 100
UNSET_STAGE = object()
LISTING_FIELDS = (
    'id', 'title', 'employer', 'location', 'description', 'requirements', 'url', 'email',
    'availability', 'eligibility', 'sponsorship', 'closes', 'source', 'source_requisition',
    'vacancy_requisition', 'salary', 'expectation', 'seniority', 'work_arrangement',
)


def without_branding(job):
    """Keep logo references and UI confirmation proof out of application artifacts."""
    clean = dict(job)
    clean.pop('published_alias_proof', None)
    if 'logo_url' in clean.get('company', {}):
        clean['company'] = {key: value for key, value in clean['company'].items() if key != 'logo_url'}
    if 'logo' in clean.get('employer_evidence', {}):
        clean['employer_evidence'] = {key: value for key, value in clean['employer_evidence'].items() if key != 'logo'}
    return clean


def listing_sha256(job):
    """Bind material application data independently of bookmarks and refresh times."""
    material = {key: job.get(key) for key in LISTING_FIELDS}
    if evidence := job.get('employer_evidence'):
        material['employer_evidence'] = {key: evidence.get(key) for key in ('name', 'url', 'source', 'requisition')}
    return digest(encode(material))


def https_address(value):
    if (not isinstance(value, str) or not value or len(value) > 2000 or '\\' in value
            or any(character.isspace() or ord(character) < 32 for character in value)):
        return None
    try:
        url = urlsplit(safe_link(value))
        if url.password is not None:
            return None
        host = url.hostname.rstrip('.')
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if ('.' not in host or host.endswith(('.localhost', '.local', '.internal'))
                    or not re.fullmatch(r'[a-zA-Z0-9.-]+', host) or host.split('.')[-1].isdigit()):
                return None
        else:
            if not address.is_global or address.is_multicast or address.is_reserved:
                return None
        return value
    except ValueError:
        return None


def channel_address(channel, value):
    if channel == 'email':
        if isinstance(value, str) and len(value) <= 254 and re.fullmatch(
            r'[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', value
        ):
            name, domain = value.rsplit('@', 1)
            return name + '@' + domain.lower()
        return None
    url = https_address(value)
    if not url:
        return None
    address = urlsplit(url)
    if channel == 'telegram':
        if address.hostname in ('t.me', 'www.t.me', 'telegram.me') and not address.query and not address.fragment:
            if re.fullmatch(r'/[A-Za-z][A-Za-z0-9_]{4,31}/?', address.path):
                return 'https://t.me/' + address.path.strip('/').lower()
    elif channel == 'website' and not pdf_vacancy_url(url):
        if address.hostname not in ('t.me', 'www.t.me', 'telegram.me', 'web.telegram.org'):
            return url
    return None


def scoped_job(state, job_id):
    job = companies.by_id(state['jobs'], job_id)
    if not job:
        raise ValueError('Choose a role in this workspace')
    link = companies.employer_link(state, job_id)
    scope = {'job_id': job_id, 'listing_sha256': listing_sha256(job),
             'vacancy_id': link['vacancy_id'] if link else None}
    return job, scope


def destinations(state, job):
    link = companies.employer_link(state, job['id'])
    employer = companies.by_id(state.get('employers', []), link['employer_id']) if link else None
    if not employer or companies.employer_evidence_conflict(job, employer):
        return []
    _, scope = scoped_job(state, job['id'])
    entries = [entry for entry in state.get('application_destinations', []) if entry['job_id'] == job['id']]
    verified = [entry for entry in entries if entry['scope'] == scope
                and channel_address(entry['channel'], entry['value']) == entry['value']]
    # A previous restriction still prevents fallback until the user rechecks it.
    if any(entry.get('required') and entry not in verified for entry in entries):
        return []
    required = [entry for entry in verified if entry.get('required')]
    if required:
        return sorted(required, key=lambda entry: CHANNELS.index(entry['channel']))
    if not any(entry['channel'] == 'website' for entry in entries):
        if url := channel_address('website', job.get('url')):
            verified.append({'channel': 'website', 'value': url, 'source_url': url,
                             'provenance': {'source': 'role-listing', 'employer_link_id': link['id']}})
    return sorted(verified, key=lambda entry: CHANNELS.index(entry['channel']))


def save_destination(state, *, job_id, channel, value, source_url, evidence, required=False, instructions=''):
    from .service import text

    value = channel_address(channel, value)
    evidence = text(evidence, 2000)
    instructions = text(instructions, 2000)
    if not value or not https_address(source_url) or not evidence or not isinstance(required, bool):
        raise ValueError('Provide the verified application destination and its source evidence')
    _, scope = scoped_job(state, job_id)
    if not scope['vacancy_id']:
        raise ValueError('Confirm the hiring employer before recording an application destination')
    entries = state.setdefault('application_destinations', [])
    prior = next((entry for entry in entries if entry['job_id'] == job_id and entry['channel'] == channel), None)
    record = {'id': prior['id'] if prior else uid(), 'job_id': job_id, 'scope': scope, 'channel': channel,
              'value': value, 'source_url': source_url, 'instructions': instructions, 'required': required,
              'provenance': {'actor': 'workspace-owner', 'source': 'application-destination',
                             'evidence': evidence, 'verified_at': now()}}
    if prior:
        prior.update(record)
    else:
        entries.append(record)
    return record


def save_answer(state, *, job_id, question, value, field=None):
    from .service import text

    question = text(question, 500)
    value = text(value, 2000)
    field = text(field, 200) if field is not None else None
    if not question or not value:
        raise ValueError('Provide the application question and confirmed answer')
    _, scope = scoped_job(state, job_id)
    answers = state.setdefault('application_answers', [])
    prior = next((answer for answer in answers if answer['scope'] == scope
                  and answer['question'] == question and answer.get('field') == field), None)
    record = {'id': prior['id'] if prior else uid(), 'job_id': job_id, 'scope': scope, 'question': question,
              'value': value, 'field': field, 'confirmed_at': now(),
              'provenance': {'actor': 'workspace-owner', 'source': 'application-answer'}}
    if prior:
        prior.update(record)
    else:
        answers.append(record)
    return record


def record(service, args, save):
    if args.get('confirmed') is not True:
        raise ValueError('Confirm the supplied application information')
    inputs = {key: value for key, value in args.items() if key != 'confirmed'}
    with service.w.edit() as state:
        return save(state, **inputs)


def selected_jobs(state, args, *, limit=CONTEXT_BATCH_LIMIT):
    ids = args.get('job_ids')
    if (not isinstance(ids, list) or not ids or (limit is not None and len(ids) > limit)
            or any(not isinstance(job_id, str) for job_id in ids) or len(set(ids)) != len(ids)):
        suffix = f' (up to {limit})' if limit is not None else ''
        raise ValueError('Select distinct roles by workspace job ID' + suffix)
    known = {job['id']: job for job in state['jobs']}
    if set(ids) - known.keys():
        raise ValueError('The selection includes an unknown workspace job ID')
    return [known[job_id] for job_id in ids]


def verify_documents(root, application):
    if not application.get('folder') or not application.get('manifest_hash') or packages.changed(root, application):
        raise ValueError('Documents changed or are missing. Validate a new draft before applying.')
    manifest = packages.record(root, application)
    if manifest['job'].get('id') != application['job_id']:
        raise ValueError('The files are linked to a different listing. Prepare a new draft.')
    mapping = packages.document_map(manifest)
    if mapping != application.get('documents'):
        raise ValueError('The stored document mapping changed. Validate the application version.')
    return [{'role': role, 'path': inside(root, application['folder'] + '/' + name).relative_to(root).as_posix(),
             'sha256': manifest['files'][name]} for role, name in mapping.items()]


def version_blocker(root, state, job, application):
    if not application or application['status'] not in ('draft', 'reviewed') or application.get('archived'):
        return 'version_required', 'Prepare or choose a current application version'
    try:
        packages.check_submission_version(root, application, job, state['facts'])
    except (OSError, ValueError, KeyError) as exc:
        message = str(exc) if isinstance(exc, ValueError) else 'Application files are missing or unreadable'
        if 'Career evidence changed' in message:
            return 'facts_changed', message
        if 'different listing' in message:
            return 'listing_changed', message
        return 'documents_changed', message
    return None


def role_blocker(state, job, *, stage=UNSET_STAGE):
    if stage is UNSET_STAGE:
        stage = next((row[2] for row in project(state) if row[0] == job['id']), None)
    if stage == 'removed':
        return 'role_removed', 'Restore this role before applying'
    if stage == 'submitted':
        return 'already_submitted', 'This vacancy is already recorded as submitted'
    if job.get('availability') == 'closed' or 'Deadline passed' in matching.match(job, {}, [])['hard_conflicts']:
        return 'listing_closed', 'This vacancy is closed or its deadline has passed'
    if job.get('eligibility') == 'conflict':
        return 'eligibility_conflict', 'Resolve the confirmed work-rights conflict before applying'
    return None


def role_context(service, state, job, application_id=None, profile_id=None, *, queue_entry=None, slots=None):
    _, scope = scoped_job(state, job['id'])
    link = companies.employer_link(state, job['id'])
    employer = companies.by_id(state.get('employers', []), link['employer_id']) if link else None
    slots = slots or companies.ApplicationSlots(state)
    allowance = slots.status(link['employer_id'] if link else None)
    if not employer:
        unresolved = companies.history_review(state, {companies.name_key(job['employer'])}, companies.submission_dates(state))
        allowance = {**allowance, 'remaining': 0, 'review_needed': bool(unresolved), 'unresolved': unresolved}
    if queue_entry is None:
        queue_entry = next((row for row in project(state) if row[0] == job['id']), None)
    stage = queue_entry[2] if queue_entry else None
    current_id = queue_entry[1] if queue_entry and (stage == 'submitted' or not queue_entry[3]) else None
    application = companies.by_id(state['applications'], application_id or current_id)
    if application_id is not None and (application is None or application['job_id'] != job['id']):
        raise ValueError('Choose an application version for this role')
    profiles = state['profiles']
    profile = companies.by_id(profiles, profile_id or (application or {}).get('profile_id'))
    if profile_id is not None and profile is None:
        raise ValueError('Choose a search profile in this workspace')
    if profile is None and len(profiles) == 1:
        profile = profiles[0]
    assessment = matching.match(job, profile or {}, state['facts'])
    relevant = set(assessment['fact_ids']) | set((application or {}).get('fact_ids', []))
    verified = destinations(state, job)
    attempts = [attempt for attempt in state.get('submission_attempts', [])
                if attempt['binding']['job_id'] == job['id'] or (link and attempt['binding'].get('vacancy_id') == link['vacancy_id'])]
    blockers = []
    for result in (role_blocker(state, job, stage=stage), slots.blocker(job['id'])):
        if result and all(code != result[0] for code, _ in blockers):
            blockers.append(result)
    if employer and not verified and not companies.employer_evidence_conflict(job, employer):
        blockers.append(('destination_unverified', 'Verify where this vacancy accepts applications'))
    documents = []
    if application and (application['status'] == 'submitted' or not (problem := version_blocker(service.w.path, state, job, application))):
        try:
            documents = verify_documents(service.w.path, application)
        except (OSError, ValueError, KeyError) as exc:
            blockers.append(('documents_changed', str(exc) if isinstance(exc, ValueError)
                             else 'Application files are missing or unreadable'))
    elif application:
        blockers.append(problem)
    if not application and stage not in ('submitted', 'removed'):
        blockers.append(('version_required', 'Prepare an application for this role'))
        if profile is None:
            blockers.append(('profile_required', 'Choose a search profile to prepare this application'))
        elif not assessment['eligible_for_preparation']:
            blockers.append(('preparation_blocked', 'Resolve matching constraints before preparing'))
        if master.status(service.w)['changed']:
            blockers.append(('master_changed', 'Review the changed master before preparing this application'))
    other_listings = []
    if link:
        equivalent = {row['id'] for row in state.get('employer_links', [])
                      if row['vacancy_id'] == link['vacancy_id'] and row['id'] != job['id']}
        other_listings = [{'id': item['id'], 'title': item['title'], 'url': item.get('url')}
                          for item in state['jobs'] if item['id'] in equivalent]
    return {
        'job': job, 'application': application, 'documents': documents, 'employer': employer,
        'employer_link': link, 'allowance': allowance, 'equivalent_listings': other_listings,
        'profile': {key: value for key, value in profile.items() if key != 'minimum'} if profile else None,
        'assessment': assessment, 'listing_sha256': scope['listing_sha256'],
        'facts': [fact for fact in matching.available(state['facts']) if fact['id'] in relevant],
        'identity': {key: state['identity'][key] for key in ('name', 'email', 'phone', 'location', 'languages')
                     if key in state['identity']},
        'answers': [answer for answer in state.get('application_answers', []) if answer['scope'] == scope],
        'destinations': verified, 'attempts': attempts,
        'blockers': [{'code': code, 'message': message} for code, message in blockers],
    }


def read(service, args):
    with service.w.lock:
        state = service.w.read()
        jobs = selected_jobs(state, args)
        versions = args.get('application_ids', {})
        if (not isinstance(versions, dict) or set(versions) - {job['id'] for job in jobs}
                or any(not isinstance(version, str) or not version for version in versions.values())):
            raise ValueError('Specify an application version only for a selected role')
        queue = {entry[0]: entry for entry in project(state, include_unqueued=True)}
        slots = companies.ApplicationSlots(state, {job_id: (row[2], row[5]) for job_id, row in queue.items()})
        roles = [role_context(service, state, job, versions.get(job['id']), args.get('profile_id'),
                              queue_entry=queue.get(job['id']), slots=slots) for job in jobs]
        return {
            'workspace_id': service.w.workspace_id, 'workspace': str(service.w.path), 'roles': roles,
            'authority': {'granted': False},
            'policy': {'timezone': settings(service.w.path)['timezone'], 'channel_order': list(CHANNELS),
                       'references': 'Use workspace reference policy only when the role requests references. Disclose only required details.',
                       'reference_policy_available': inside(service.w.path, 'master/references.json').is_file(),
                       'uncertain_outcome': 'Check the outcome before retrying or changing channels.'},
        }


def handoff(service, args):
    all_pending = args.get('all_pending') is True
    if set(args) != ({'all_pending'} if all_pending else {'job_ids'}):
        raise ValueError('Choose exact To apply job IDs or request all pending roles')
    state = service.w.read()
    slots = companies.ApplicationSlots(state)
    ids = sorted(slots.pending) if all_pending else [job['id'] for job in selected_jobs(state, args, limit=None)]
    result = {'workspace_id': service.w.workspace_id, 'workspace': str(service.w.path), 'job_ids': ids}
    if not ids:
        return {**result, 'text': None, 'blockers': [
            {'job_id': None, 'code': 'empty_queue', 'message': 'Add a role to To apply first'}]}
    problems = slots.selection_blockers(ids)
    for job_id in ids:
        job = slots.jobs[job_id]
        stage, _ = slots.queue.get(job_id, (None, False))
        role_problem = role_blocker(state, job, stage=stage)
        if role_problem:
            problems[job_id] = role_problem
        elif job_id not in slots.pending:
            problems[job_id] = ('role_not_pending', 'This role is no longer in To apply. Refresh your selection.')
    if problems:
        return {**result, 'text': None, 'blockers': [
            {'job_id': job_id, 'code': code, 'message': message}
            for job_id, (code, message) in problems.items()]}
    lines = [
        'Apply for these exact roles using Employment Agency.',
        f'Workspace: {service.w.path}',
        f'Workspace ID: {service.w.workspace_id}',
        'Read the workspace instructions and the shared app’s docs/agents.md.',
        f'Use application-context on these job_ids in batches of up to {CONTEXT_BATCH_LIMIT}. '
        'Verify workspace_id in every batch. If the local app is stopped, use the shared CLI for the same workspace.',
        'Recheck the live company allowance, exact documents, destination and earlier attempts. '
        'Use the shared preparation and reserved submission operations, record the evidence, and ask about blockers.',
        'Job IDs:',
        *[f'- {job_id}' for job_id in ids],
    ]
    return {**result, 'text': '\n'.join(lines), 'blockers': []}


def research_handoff(service, args):
    if set(args) - {'profile_id'}:
        raise ValueError('Choose the search profile for the research prompt')
    profile_id = args.get('profile_id')
    if profile_id is not None and (
        not isinstance(profile_id, str) or not companies.by_id(service.w.read()['profiles'], profile_id)
    ):
        raise ValueError('Choose a search profile in this workspace')
    lines = [
        'Find five additional eligible hiring companies with Employment Agency.',
        f'Workspace: {service.w.path}',
        f'Workspace ID: {service.w.workspace_id}',
        f'Search profile ID: {profile_id}' if profile_id else 'Use the current workspace search preferences.',
        'Read the workspace instructions and the five-company workflow in the shared app’s docs/agents.md.',
        'Before opening sources, call GET /api/company-avoid and verify its workspace path. '
        'Skip active cooldowns and companies already presented. Run company-research-check for each employer '
        'before targeted fetching and prioritize employers with no previous submissions.',
        'Check the official careers site and employer-owned boards. Import verified listings through the shared app '
        'and show every eligible role by company, with source links, gaps in coverage and unknown requirements.',
        'Keep this request to job research.',
    ]
    return {'workspace_id': service.w.workspace_id, 'workspace': str(service.w.path),
            'profile_id': profile_id, 'text': '\n'.join(lines)}
