"""Durable selected-role execution and the service-owned application tools."""

from datetime import datetime, timedelta, timezone
import hmac
import json
import queue
import re
import secrets
import sqlite3
import threading

from . import application_context as context, companies, master, matching, packages
from .agent_website import Help, Interrupted, Unavailable, Website, contact_value
from .application_delivery import ACTIVE as LEGACY_ACTIVE, Delivery, address, application_message, fingerprint
from .codex_runtime import CodexError, CodexInterrupted, CodexRuntime
from .delivery_connections import Gmail, Telegram
from .store import atomic, digest, encode, now, uid
from .workspaces import city_for, inside, settings


RUNNING = {'queued', 'preparing', 'applying', 'stopping'}
RESUMABLE = {'needs_help', 'interrupted'}
ATTEMPT_OPEN = {'reserved', 'executing', 'unknown'}
DOCS = ('resume.pdf', 'cover-letter.pdf')
AUTHORITY_HOURS = 24
ANSWER_WAIT_SECONDS = 180
TOOL = {'type': 'function', 'name': 'apply_selected_role', 'deferLoading': False,
        'description': 'Prepare and apply for the single selected role using the application service. '
                       'The service verifies the scope, prompts for any missing answers, and checks delivery.',
        'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}}


def identity_binding(role):
    return fingerprint(role['identity'])


def destination_binding(role):
    return [{key: entry[key] for key in ('channel', 'value', 'source_url', 'required', 'instructions') if key in entry}
            for entry in role['destinations']]


def document_binding(role):
    return [entry for entry in role['documents'] if entry['role'] in DOCS]


def get_row(state, collection, identifier):
    return companies.by_id(state.get(collection, []), identifier)


def cv_dispatched(attempt):
    return any(document.get('role') == 'resume.pdf' for dispatch in attempt.get('dispatches', [])
               for document in dispatch.get('documents', []))


class AgentExecution:
    def __init__(self, service, *, runtime=None, website=None, telegram=None, mail=None):
        self.service, self.w = service, service.w
        self.runtime = runtime or CodexRuntime()
        self.website = website or Website()
        self.telegram = telegram or Telegram()
        self.mail = mail or Gmail()
        self.lock = threading.RLock()
        self.changed = threading.Condition(self.lock)
        self.commands = queue.Queue()
        self.active = {}
        self.thread = None
        self.closing = False
        self.origin = digest(str(self.w.path).encode())

    @property
    def busy(self):
        return bool(self.commands.unfinished_tasks)

    def close(self):
        with self.changed:
            self.closing = True
            for stop in self.active.values():
                stop.set()
            self.changed.notify_all()
            if not self.thread or not self.thread.is_alive():
                return
            self.commands.put(None)
        self.thread.join(timeout=45)
        if self.thread.is_alive():
            raise ValueError('An application channel is still returning an outcome; wait before closing this workspace')

    def sender(self, channel):
        if channel == 'email':
            return address(self.mail.sender())
        account = self.telegram.sender()
        if not isinstance(account, str) or not re.fullmatch(r'[A-Za-z0-9_]{1,100}', account):
            raise ValueError('The Telegram sender identity could not be verified')
        return account

    def channels(self):
        try:
            self.sender('email')
        except Exception:
            email = {'available': False, 'reason': 'Connect the intended Gmail account in this app to use recruitment email.'}
        else:
            email = {'available': True, 'reason': ''}
        telegram = self.telegram.readiness()
        if telegram['available']:
            try:
                self.sender('telegram')
            except ValueError:
                telegram = {'available': False, 'reason': 'Verify the Telegram sender in the app’s signed-in user session.'}
        return {'website': self.website.readiness(), 'telegram': telegram, 'email': email}

    def capabilities(self, args):
        if not self.w.database or settings(self.w.path).get('demo'):
            reason = 'Connected application runs require this app’s local SQLite workspace.'
            unavailable = {'available': False, 'reason': reason}
            return {**unavailable, 'runtime': unavailable, 'channels': dict.fromkeys(context.CHANNELS, unavailable)}
        runtime, channels = self.runtime.readiness(), self.channels()
        available = runtime['available'] and any(channel['available'] for channel in channels.values())
        result = {'available': available, 'reason': runtime['reason'] or ('' if available else
                  'No connected application channel is available.'), 'runtime': runtime, 'channels': channels}
        if 'job_ids' in args:
            state = self.w.read()
            roles = []
            for job in context.selected_jobs(state, args):
                destinations = context.destinations(state, job)
                # Employer verification is a user input in the role journey. Do
                # not mistake the absence of a link for a verified destination.
                role_reason = next((channels[d['channel']]['reason'] for d in destinations), '')
                supported = next((d for d in destinations if channels[d['channel']]['available']), None)
                has_candidate = (not companies.employer_link(state, job['id']) and channels['website']['available']
                                 and context.channel_address('website', job.get('url')))
                ready = available and bool(supported or has_candidate)
                roles.append({'job_id': job['id'], 'available': ready, 'reason': '' if ready else
                              result['reason'] or role_reason or 'Verify a destination for this role.'})
            result['roles'] = roles
        return result

    def status(self, state, args):
        ids = args.get('job_ids')
        if ids is not None:
            ids = {job['id'] for job in context.selected_jobs(state, args)}
        runs = [run for run in state.get('agent_runs', []) if (ids is None or run['job_id'] in ids)
                and (not args.get('id') or run['id'] == args['id'])]
        if not args.get('id'):
            runs = list({run['job_id']: run for run in runs}.values())
        return {'runs': [self.summary(state, run) for run in runs]}

    def summary(self, state, run):
        attempt = get_row(state, 'submission_attempts', run.get('attempt_id')) or {}
        status, message = run['status'], run['message']
        live = run['id'] in self.active
        same = self.same_origin(run) and self.has_permit(run)
        if not live and status in RUNNING | RESUMABLE:
            if attempt.get('status') in {'executing', 'unknown'} or attempt.get('disclosed_at'):
                status, message = 'uncertain', 'Check the external outcome before retrying or changing channels.'
            elif status in RUNNING or not same:
                status, message = 'interrupted', ('Start again to authorize this restored workspace.' if not same else
                                                   'The connected run was interrupted before disclosure. Resume explicitly.')
        journaled = self.read_receipt(attempt) if attempt.get('status') in ATTEMPT_OPEN and attempt.get('disclosed_at') else None
        if journaled:
            status, message = 'record_pending', 'A verified receipt is retained. Record it without resending.'
        row = {key: run[key] for key in ('id', 'job_id', 'application_id', 'channel', 'updated_at', 'attempt_id') if run.get(key)}
        inert_reservation = (not live and attempt.get('status') == 'reserved' and not attempt.get('disclosed_at')
                             and not attempt.get('dispatches') and attempt.get('agent_run_id') == run['id'])
        row.update(status=status, message=message,
                   can_resume=status in RESUMABLE and (not live or not run.get('question', {}).get('field')) and same
                   and datetime.now(timezone.utc) < datetime.fromisoformat(run['authority']['expires_at']),
                   can_stop=status in RUNNING | RESUMABLE and (live or same or inert_reservation),
                   can_resolve=status in {'uncertain', 'record_pending'})
        if status == 'needs_help' and run.get('question'):
            row['question'] = run['question']
        if status == 'uncertain':
            row['can_associate_document'] = cv_dispatched(attempt)
        if attempt.get('receipt') or journaled:
            evidence = journaled or attempt
            for key in ('receipt', 'document_application_id', 'occurred_at'):
                if key in evidence:
                    row[key] = evidence[key]
        return row

    def action(self, operation, args):
        if operation == 'agent-capabilities':
            return self.capabilities(args)
        if not self.w.database or settings(self.w.path).get('demo'):
            raise ValueError('Connected application runs require this app’s local SQLite workspace')
        with self.changed:
            if operation == 'agent-application-status':
                return self.status(self.w.read(), args)
            if operation == 'agent-application-start':
                return self.start(args)
            if operation == 'agent-application-resolve':
                return self.resolve(args)
            if operation in ('agent-application-answer', 'agent-application-resume', 'agent-application-stop'):
                return self.control(operation.removeprefix('agent-application-'), args)
            raise ValueError('Unknown connected agent operation')

    def find_run(self, state, identifier):
        run = get_row(state, 'agent_runs', identifier)
        if not run:
            raise ValueError('Choose a connected application run in this workspace')
        return run

    def same_origin(self, run):
        authority = run['authority']
        return authority['workspace_id'] == self.w.workspace_id and authority.get('origin_sha256') == self.origin

    def permit_path(self, run):
        name = self.origin + '-' + self.w.workspace_id + '-' + run['id'] + '.permit'
        return inside(self.w.config_path, 'agent-permits/' + name)

    @staticmethod
    def permit_mac(run, key):
        authority = {name: value for name, value in run['authority'].items() if name != 'permit_scope_mac'}
        binding = [run['id'], run['job_id'], run['request_sha256'], authority,
                   run['application_id'], run.get('prepared_manifest_hash')]
        return hmac.digest(key, fingerprint(binding).encode(), 'sha256').hex()

    def permit_key(self, run):
        expected = run['authority'].get('permit_scope_mac')
        if not expected:
            return None
        try:
            with self.permit_path(run).open('rb') as file:
                key = file.read(33)
            if len(key) == 32 and secrets.compare_digest(expected, self.permit_mac(run, key)):
                return key
        except (OSError, ValueError):
            pass
        return None

    def has_permit(self, run):
        return self.permit_key(run) is not None

    def issue_permit(self, run):
        if self.w.config_path.is_relative_to(self.w.path):
            raise ValueError('Keep the local agent permission folder outside the career workspace')
        permit = secrets.token_bytes(32)
        atomic(self.permit_path(run), permit)
        run['authority']['permit_scope_mac'] = self.permit_mac(run, permit)

    def remove_expired_permits(self, state):
        instant = datetime.now(timezone.utc)
        for run in state.get('agent_runs', []):
            if self.same_origin(run) and datetime.fromisoformat(run['authority']['expires_at']) <= instant:
                self.revoke_permit(run)

    def revoke_permit(self, run):
        try:
            self.permit_path(run).unlink(missing_ok=True)
        except OSError:
            # Terminal audit status still prevents dispatch when removal fails.
            pass

    def start(self, args):
        request_key = args.get('request_key')
        if not isinstance(request_key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{12,100}', request_key):
            raise ValueError('Provide the application start request key')
        state = self.w.read()
        jobs = context.selected_jobs(state, args)
        job_ids = [job['id'] for job in jobs]
        versions = args.get('application_ids', {})
        profile_id = args.get('profile_id')
        if (not isinstance(versions, dict) or set(versions) - set(job_ids)
                or any(not isinstance(value, str) or not value for value in versions.values())
                or profile_id is not None and not isinstance(profile_id, str)):
            raise ValueError('Provide version and profile IDs for the selected roles')
        request_hash = fingerprint([sorted(job_ids), versions, profile_id])
        existing = [run for run in state.get('agent_runs', []) if run['request_key'] == request_key and self.same_origin(run)]
        if existing:
            if any(run['request_sha256'] != request_hash for run in existing):
                raise ValueError('This request key already authorizes a different application selection')
            return {'runs': [self.summary(state, run) for run in existing]}
        if self.closing:
            raise ValueError('The local application is closing')
        if self.busy or (self.service.delivery and self.service.delivery.busy):
            raise ValueError('Wait for or stop the existing application activity before starting another selection')
        if self.service.worker and self.service.worker.is_alive():
            raise ValueError('Wait for the existing preparation run before starting this selection')
        ready = self.capabilities({})
        if not ready['available']:
            raise ValueError(ready['reason'])
        senders = {channel: self.sender(channel) for channel in ('telegram', 'email')
                   if ready['channels'][channel]['available']}
        self.remove_expired_permits(state)
        created = []
        with self.w.edit() as state:
            self.release_inert_reservations(state, set(job_ids))
            jobs = context.selected_jobs(state, args)
            slots = companies.ApplicationSlots(state)
            if problems := slots.selection_blockers(job_ids):
                job_id, blocker = next(iter(problems.items()))
                raise companies.CompanyBlocked(*blocker, job_id=job_id)
            for job in jobs:
                role = context.role_context(self.service, state, job, versions.get(job['id']), profile_id, slots=slots)
                self.check_start(role, ready['channels'])
                link = role['employer_link']
                if any(run['authority']['vacancy_id'] == link['vacancy_id'] and
                       self.summary(state, run)['status'] in RUNNING | RESUMABLE | {'uncertain', 'record_pending'}
                       and self.same_origin(run) and self.has_permit(run)
                       for run in state.get('agent_runs', [])):
                    raise ValueError('Resolve or stop the existing run for this vacancy first')
                stamp = now()
                app = role['application'] or {}
                fact_ids = sorted(fact['id'] for fact in role['facts'])
                profile = get_row(state, 'profiles', (role['profile'] or {}).get('id'))
                authority = {
                    'workspace_id': self.w.workspace_id, 'origin_sha256': self.origin, 'granted_at': stamp,
                    'expires_at': (datetime.now(timezone.utc) + timedelta(hours=AUTHORITY_HOURS)).isoformat(),
                    'employer_id': link['employer_id'], 'vacancy_id': link['vacancy_id'],
                    'listing_sha256': role['listing_sha256'], 'identity_sha256': identity_binding(role),
                    'destinations': destination_binding(role), 'senders': senders,
                    'profile_id': (profile or {}).get('id'),
                    'preparation_sha256': self.preparation_binding(state, role, profile) if not app else None,
                    'application_id': app.get('id'), 'preparation_fact_ids': role['assessment']['fact_ids'][:10],
                    'manifest_hash': app.get('manifest_hash'), 'fact_ids': fact_ids,
                    'facts_sha256': self.facts_binding(state, fact_ids),
                    'answers': {row['id']: fingerprint(row) for row in role['answers']},
                }
                run = {'id': uid(), 'job_id': job['id'], 'application_id': app.get('id'), 'authority': authority,
                       'request_key': request_key, 'request_sha256': request_hash, 'created_at': stamp, 'updated_at': stamp,
                       'status': 'queued', 'message': 'Queued for the connected application agent.', 'channels_checked': []}
                state.setdefault('agent_runs', []).append(run)
                created.append(run)
            for run in created:
                self.issue_permit(run)
        for run in created:
            self.enqueue(run['id'])
        return {'runs': [self.summary(state, run) for run in created]}

    def release_inert_reservations(self, state, job_ids):
        vacancies = {link['vacancy_id'] for job_id in job_ids if (link := companies.employer_link(state, job_id))}
        released = False
        for run in state.get('agent_runs', []):
            if (run['authority']['vacancy_id'] not in vacancies or run['id'] in self.active
                    or self.same_origin(run) and self.has_permit(run)):
                continue
            attempt = get_row(state, 'submission_attempts', run.get('attempt_id'))
            if (attempt and attempt.get('agent_run_id') == run['id'] and attempt['status'] == 'reserved'
                    and not attempt.get('disclosed_at') and not attempt.get('dispatches')):
                reason = 'The prior application authorization is no longer usable. No dispatch was recorded.'
                self.release_unsent(state, run, reason)
                run.update(status='interrupted', message=reason, updated_at=now())
                released = True
        if released:
            companies.update_rounds(state, self.service.workspace_zone())

    @staticmethod
    def check_start(role, channels):
        for blocker in role['blockers']:
            if blocker['code'] != 'version_required' or role['application']:
                raise ValueError(blocker['message'])
        if not (role['employer_link'] and any(channels[d['channel']]['available'] for d in role['destinations'])):
            reasons = [channels[d['channel']]['reason'] for d in role['destinations']]
            raise ValueError(next((reason for reason in reasons if reason), 'Verify an available application destination.'))
        if any(attempt.get('status') in LEGACY_ACTIVE | {'handed_off', 'reserved', 'confirmed'}
               for attempt in role['attempts']):
            raise ValueError('Resolve the existing submission attempt for this vacancy first')

    def enqueue(self, identifier):
        self.active[identifier] = threading.Event()
        self.commands.put(identifier)
        if not self.thread or not self.thread.is_alive():
            self.thread = threading.Thread(target=self.work, daemon=True, name='connected-application-agent')
            self.thread.start()

    def control(self, operation, args):
        identifier = args.get('id')
        state = self.w.read()
        run = self.find_run(state, identifier)
        reported = self.summary(state, run)
        stopping = self.active.get(identifier)
        if operation == 'stop':
            if not reported['can_stop']:
                raise ValueError('This run is no longer stoppable')
            if stopping:
                stopping.set()
            with self.w.edit() as state:
                run = self.find_run(state, identifier)
                if run['status'] in RUNNING | RESUMABLE:
                    run.update(status='stopping' if stopping else 'stopped',
                               message='Stop requested.' if stopping else 'Stopped before external dispatch.', updated_at=now())
                    if not stopping:
                        self.release_unsent(state, run, 'The run stopped before external dispatch.')
                        self.revoke_permit(run)
            self.changed.notify_all()
            return self.status(state, {'id': identifier})
        if operation == 'answer':
            question = reported.get('question', {})
            if not question.get('field') or question.get('id') != args.get('question_id'):
                raise ValueError('Answer the current, exact application question')
            answer = args.get('answer')
            if not isinstance(answer, str) or not answer.strip() or len(answer) > 2000:
                raise ValueError('Provide a confirmed application answer')
        elif not reported['can_resume']:
            raise ValueError('This run requires reconciliation or a fresh authorization before it can continue')
        if self.closing:
            raise ValueError('The local application is closing')
        if not stopping:
            ready = self.runtime.readiness()
            if not ready['available']:
                raise ValueError(ready['reason'])
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            try:
                self.live_role(state, run)
            except Help as exc:
                raise ValueError(str(exc)) from exc
            if operation == 'answer':
                permit = self.permit_key(run)
                if permit is None:
                    raise ValueError('This answer requires a current application authorization')
                row = context.save_answer(state, job_id=run['job_id'], question=question['prompt'],
                                          field=question['field'], value=answer)
                run['authority']['answers'][row['id']] = fingerprint(row)
                run['authority']['permit_scope_mac'] = self.permit_mac(run, permit)
            run.pop('question', None)
            run.update(status='applying' if stopping else 'queued', message='Continuing the selected application.', updated_at=now())
        if not stopping:
            self.enqueue(identifier)
        self.changed.notify_all()
        return self.status(state, {'id': identifier})

    def live_role(self, state, run):
        authority = run['authority']
        if (not self.same_origin(run) or not self.has_permit(run) or datetime.now(timezone.utc) >=
                datetime.fromisoformat(authority['expires_at'])):
            raise Help('The selected-role authorization expired or belongs to another workspace. Start again.')
        job = get_row(state, 'jobs', run['job_id'])
        if not job or context.role_blocker(state, job):
            raise Help('This role is no longer eligible for the authorized application.')
        slots = companies.ApplicationSlots(state)
        if blocker := slots.blocker(job['id'], attempt_id=run.get('attempt_id')):
            raise companies.CompanyBlocked(*blocker, job_id=job['id'])
        role = context.role_context(self.service, state, job, run['application_id'], authority['profile_id'], slots=slots)
        link = role['employer_link'] or {}
        if (any(link.get(key) != authority[key] for key in ('employer_id', 'vacancy_id'))
                or role['listing_sha256'] != authority['listing_sha256']
                or destination_binding(role) != authority['destinations'] or identity_binding(role) != authority['identity_sha256']
                or self.facts_binding(state, authority['fact_ids']) != authority['facts_sha256']
                or {row['id']: fingerprint(row) for row in role['answers']} != authority['answers']):
            raise Help('The listing, employer, destination, contact details or confirmed facts changed. Stop and start again to authorize the changes.')
        if not authority['application_id']:
            profile = get_row(state, 'profiles', authority['profile_id'])
            if (self.preparation_binding(state, role, profile) != authority['preparation_sha256']
                    or role['assessment']['fact_ids'][:10] != authority['preparation_fact_ids']
                    or not role['assessment']['eligible_for_preparation']):
                raise Help('The search profile, master, document settings or intended career evidence changed. '
                           'Start again to authorize a new package.')
        if run['application_id']:
            application = role['application'] or {}
            expected = run.get('prepared_manifest_hash', authority['manifest_hash'])
            if application.get('manifest_hash') != expected or {d['role'] for d in document_binding(role)} != set(DOCS):
                raise Help('The selected application documents changed. Stop and start again with an intact version.')
        return role

    @staticmethod
    def facts_binding(state, ids):
        selected = set(ids)
        facts = [fact for fact in state['facts'] if fact['id'] in selected]
        return fingerprint(sorted(facts, key=lambda fact: fact['id']))

    def preparation_binding(self, state, role, profile):
        config = settings(self.w.path)
        master_skills = []
        if config['master_template']:
            master_skills = [fact for fact in matching.available(state['facts'])
                             if fact.get('category') in ('skill', 'skills')]
        return fingerprint([profile, master.status(self.w), master_skills, city_for(role['job'], config),
                            config['master_template'], config['resume_pages'], config['cover_letter_pages']])

    def change(self, identifier, **fields):
        with self.w.edit() as state:
            self.find_run(state, identifier).update(fields, updated_at=now())

    def work(self):
        while True:
            identifier = self.commands.get()
            try:
                if identifier is None:
                    return
                stop = self.active[identifier]
                if stop.is_set():
                    raise Interrupted()
                self.change(identifier, status='preparing', message='Preparing the selected role and its exact application documents.')
                run = self.find_run(self.w.read(), identifier)
                performed = False

                def call(namespace, name, arguments):
                    nonlocal performed
                    if (namespace not in (None, 'functions') or name != TOOL['name'] or arguments != {}
                            or performed or stop.is_set()):
                        return {'ok': False, 'message': 'This call is outside the selected-role application scope.'}
                    performed = True
                    self.apply_selected(identifier, stop)
                    return {'status': 'submitted', 'message': 'The service recorded the receipt for the selected role.'}

                state = self.w.read()
                role = self.live_role(state, run)
                # The service prepares and discloses exact documents. The model
                # gets the selected role and channel types without contact data.
                prompt = ('Start the authorized selected-role application. Call apply_selected_role with no arguments once. '
                          'The service owns the exact documents, destination and receipt. Selected role data: '
                          + json.dumps({'title': role['job']['title'], 'employer': role['job']['employer'],
                                        'channels': [d['channel'] for d in role['destinations']]}, ensure_ascii=False))
                self.runtime.run(prompt, call, [TOOL], stop=stop.is_set)
                if not performed:
                    raise Help('The connected agent finished without using its application tool. Resume to try again.')
            except (Interrupted, CodexInterrupted):
                self.note_failure(identifier, 'Stopped before external dispatch.' if not self.closing else 'Interrupted before external dispatch.',
                                  'stopped' if not self.closing else 'interrupted')
            except (Help, CodexError, ValueError) as exc:
                self.note_failure(identifier, str(exc), 'needs_help')
            except Exception:
                self.note_failure(identifier, 'The application operation could not finish. Check the local connection before resuming.',
                                  'needs_help')
            finally:
                with self.changed:
                    self.active.pop(identifier, None)
                    self.commands.task_done()
                    self.changed.notify_all()

    def note_failure(self, identifier, message, status):
        try:
            self.fail(identifier, message, status)
        except (OSError, ValueError, sqlite3.Error):
            # A later status read derives interruption/uncertainty from the last
            # durable checkpoint. Keep the worker available for other queued roles.
            pass

    def fail(self, identifier, message, status):
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            if run['status'] in {'submitted', 'record_pending', 'uncertain'}:
                return
            attempt = get_row(state, 'submission_attempts', run.get('attempt_id'))
            if attempt and (attempt.get('disclosed_at') or attempt['status'] == 'executing'):
                attempt.update(status='unknown', updated_at=now(), note='Verify the external outcome before any resend.')
                status, message = 'uncertain', 'External activity may have occurred. Check the channel before any further attempt.'
            else:
                self.release_unsent(state, run, message)
            run.update(status=status, message=message, updated_at=now())
            if status != 'needs_help':
                run.pop('question', None)
            if status in {'stopped', 'uncertain'}:
                self.revoke_permit(run)

    @staticmethod
    def release_unsent(state, run, reason):
        attempt = get_row(state, 'submission_attempts', run.get('attempt_id'))
        if attempt and attempt['status'] == 'reserved' and not attempt.get('disclosed_at'):
            attempt.update(status='not_sent', note=reason, updated_at=now())
            run.pop('attempt_id', None)

    def prepare(self, identifier):
        with self.w.lock:
            state = self.w.read()
            run = self.find_run(state, identifier)
            role = self.live_role(state, run)
            authority = run['authority']
            if not run['application_id']:
                profile = get_row(state, 'profiles', authority['profile_id'])
                facts = matching.available(state['facts'])
                app = self.service.prepare(role['job'], profile, state['identity'], facts, role['assessment'], authority['preparation_fact_ids'])
                with self.w.edit() as state:
                    run = self.find_run(state, identifier)
                    self.live_role(state, run)
                    permit = self.permit_key(run)
                    if permit is None:
                        raise Help('The selected-role authorization is no longer available.')
                    run.update(application_id=app['id'], prepared_manifest_hash=app['manifest_hash'], updated_at=now())
                    run['authority']['permit_scope_mac'] = self.permit_mac(run, permit)
        return self.find_run(self.w.read(), identifier)

    def apply_selected(self, identifier, stop):
        run = self.prepare(identifier)
        if stop.is_set():
            raise Interrupted()
        ready = self.channels()
        failures = []
        for target in run['authority']['destinations']:
            if stop.is_set():
                raise Interrupted()
            channel = target['channel']
            if channel in run['channels_checked']:
                continue
            if not ready[channel]['available']:
                failures.append(ready[channel]['reason'])
                continue
            if channel in ('email', 'telegram') and channel not in run['authority']['senders']:
                failures.append('Start again to authorize the newly connected ' + channel + ' sender.')
                continue
            attempt = self.reserve(identifier, target)
            try:
                receipt = self.send(identifier, attempt, stop)
            except Unavailable as exc:
                self.unavailable(identifier, attempt['id'], str(exc))
                failures.append(str(exc))
                continue
            self.receive(attempt, receipt)
            self.record(identifier)
            return
        raise Help(' '.join(dict.fromkeys(failures)) or 'No verified application channel is available for this role.')

    def reserve(self, identifier, target):
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            role = self.live_role(state, run)
            present = get_row(state, 'submission_attempts', run.get('attempt_id'))
            own = present if present and present['status'] == 'reserved' and not present.get('disclosed_at') else None
            link = companies.check_slot(state, run['job_id'], attempt_id=own['id'] if own else None)
            if own and own['binding']['destination'] != target:
                self.release_unsent(state, run, 'No application data was dispatched through this channel.')
                own = None
            aim = {'job_id': run['job_id'], 'application_id': run['application_id'], 'employer_id': link['employer_id'],
                   'vacancy_id': link['vacancy_id'], 'listing_sha256': role['listing_sha256'],
                   'manifest_hash': role['application']['manifest_hash'], 'destination': target, 'documents': document_binding(role)}
            attempt = own or {'id': uid(), 'created_at': now(), 'agent_run_id': identifier, 'status': 'reserved',
                              'channel': target['channel'], 'application_id': run['application_id'],
                              'employer_id': link['employer_id'], 'vacancy_id': link['vacancy_id'], 'binding': aim, 'dispatches': []}
            if aim != attempt['binding']:
                raise Help('The reserved application binding changed.')
            attempt.update(updated_at=now(), note='Reserved under the selected-role start authorization.')
            if not own:
                Delivery.save_attempt(state, attempt)
            run.update(status='applying', channel=target['channel'], attempt_id=attempt['id'], updated_at=now(),
                       message='Applying through the verified ' + target['channel'] + ' destination.')
            return attempt

    def dispatch(self, identifier, attempt_id, payload, stop):
        # Stop may win until dispatch intent is durable. The channel operation
        # itself stays outside the lock so Stop can interrupt subsequent work.
        with self.changed, self.w.edit() as state:
            run = self.find_run(state, identifier)
            attempt = get_row(state, 'submission_attempts', attempt_id)
            if (stop.is_set() or run['status'] != 'applying' or run.get('attempt_id') != attempt_id
                    or not attempt or attempt['status'] != 'reserved'):
                raise Interrupted()
            role = self.live_role(state, run)
            companies.check_slot(state, run['job_id'], attempt_id=attempt_id)
            if document_binding(role) != attempt['binding']['documents']:
                raise Help('The document version changed before dispatch.')
            for answer in payload.get('answers', []):
                allowed = any(row['field'] == answer['field'] and row['question'] == answer['question']
                              and row['value'] == answer['confirmed_value']
                              for row in role['answers'])
                if not allowed and contact_value(role['identity'], answer['question']) != answer['confirmed_value']:
                    raise Help('A website answer is no longer confirmed for this role.')
            payload = {**payload, 'at': now()}
            attempt['dispatches'].append(payload)
            attempt.update(status='executing', disclosed_at=attempt.get('disclosed_at') or payload['at'], updated_at=now())

    def send(self, identifier, attempt, stop):
        target = attempt['binding']['destination']
        channel, destination = target['channel'], target['value']
        state = self.w.read()
        run = self.find_run(state, identifier)
        role = self.live_role(state, run)
        documents = {}
        for document in attempt['binding']['documents']:
            path = inside(self.w.path, document['path'])
            data = path.read_bytes()
            if digest(data) != document['sha256']:
                raise Help('The exact application files changed before delivery.')
            documents[document['role']] = {**document, 'filename': path.name, 'data': data}

        def dispatch(payload):
            self.dispatch(identifier, attempt['id'], payload, stop)

        if channel == 'website':
            body = ' '.join([str(role['job'].get('description', '')), target.get('instructions', '')])
            cover_required = bool(re.search(r'(?:require[ds]?|include|provide|submit|attach|send)\s+(?:a |your )?cover letter|'
                                            r'cover letter\s+(?:is )?required', body, re.I))
            def answers():
                state = self.w.read()
                return self.live_role(state, self.find_run(state, identifier))['answers']

            receipt = self.website.submit(destination, documents, role['identity'], answers,
                                          before_dispatch=dispatch, after_step=lambda: self.step(attempt['id']),
                                          ask=lambda question: self.ask(identifier, question, stop), stop=stop.is_set,
                                          cover_required=cover_required)
            if (receipt.get('provider') != 'website' or receipt.get('url') != destination
                    or not receipt.get('confirmation') or not receipt.get('response_sha256')):
                raise Help('The website did not return verifiable confirmation for the authorized endpoint.')
            return receipt
        expected = run['authority']['senders'][channel]
        if self.sender(channel) != expected:
            raise Help('The connected sender changed. Stop and start again with the intended account.')
        title = ' '.join(role['job']['title'].split())[:260]
        subject = 'Application for ' + title
        message = f'Hello,\n\nPlease find my CV and cover letter for the {title} role attached.\n\nKind regards,\n{role["identity"].get("name", "")}'
        payload = {'kind': 'submit', 'subject': subject, 'message': message, 'sender': expected,
                   'recipient': destination, 'documents': [{k: doc[k] for k in ('role', 'filename', 'sha256')} for doc in documents.values()]}
        if channel == 'email':
            raw = application_message(attempt['id'], expected, destination, subject, message, list(documents.values()))
            receipt = self.mail.send(raw, before_send=lambda: dispatch({**payload, 'body_sha256': digest(raw)}))
            if receipt.get('provider') != 'gmail' or not receipt.get('message_id'):
                raise Help('Gmail did not return a verifiable message identifier.')
            return {**receipt, 'recipient': destination, 'sender': expected}
        receipt = self.telegram.send(destination, expected, message, list(documents.values()), before_send=lambda: dispatch(payload))
        if (receipt.get('provider') != 'telegram' or receipt.get('recipient') != destination
                or receipt.get('sender') != expected or not receipt.get('message_id')):
            raise Help('Telegram did not confirm the exact recipient, sender and message.')
        return receipt

    def step(self, attempt_id):
        with self.w.edit() as state:
            attempt = get_row(state, 'submission_attempts', attempt_id)
            if attempt and attempt['status'] == 'executing':
                attempt.update(status='reserved', updated_at=now())

    def ask(self, identifier, problem, stop):
        if re.search(r'\b(references?|referees?)\b', problem.prompt or '', re.I):
            policy = inside(self.w.path, 'master/references.json')
            if policy.is_file():
                raise Help('The role requests references. Use the saved reference policy and disclose the requested fields on the site.')
            raise Help('The role requests references. Provide only the required reference fields on the application site.')
        if re.search(r'\b(salary|compensation|remuneration|pay expectations?)\b', problem.prompt or '', re.I):
            problem = Help('The website needs your role-specific answer about compensation.', field=problem.field, prompt=problem.prompt)
        question = {'id': uid(), 'field': problem.field, 'prompt': problem.prompt}
        with self.changed:
            if stop.is_set():
                raise Interrupted()
            self.change(identifier, status='needs_help', message=str(problem), question=question)
            expires = datetime.now(timezone.utc) + timedelta(seconds=ANSWER_WAIT_SECONDS)
            while not stop.is_set():
                run = self.find_run(self.w.read(), identifier)
                if run['status'] == 'applying' and not run.get('question'):
                    return
                if datetime.now(timezone.utc) >= expires:
                    raise Help('The application session timed out while waiting for the answer.')
                self.changed.wait(timeout=5)
            raise Interrupted()

    def unavailable(self, identifier, attempt_id, reason):
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            attempt = get_row(state, 'submission_attempts', attempt_id)
            if attempt['status'] != 'reserved' or attempt.get('disclosed_at'):
                raise Help('The previous channel already received application data. Verify the outcome first.')
            attempt.update(status='not_sent', note=reason, updated_at=now())
            run['channels_checked'].append(attempt['channel'])
            run.pop('attempt_id', None)

    def receipt_path(self, attempt_id):
        if not isinstance(attempt_id, str) or not re.fullmatch(r'[a-f0-9]{32}', attempt_id):
            raise ValueError('Invalid connected application receipt ID')
        return inside(self.w.path, 'records/agent-receipts/' + attempt_id + '.json')

    def read_receipt(self, attempt):
        try:
            record = json.loads(self.receipt_path(attempt['id']).read_bytes())
        except FileNotFoundError:
            return None
        if (record['attempt_id'] != attempt['id'] or record['run_id'] != attempt['agent_run_id']
                or record['binding_sha256'] != fingerprint(attempt['binding'])
                or record['document_application_id'] not in (None, attempt['application_id'])):
            raise ValueError('A retained connection receipt has a different application binding')
        return record

    def receive(self, attempt, receipt, *, occurred_at=None, associate_document=True):
        # The exact reservation is already in memory. Journal the external
        # receipt before touching SQLite, which may be temporarily unavailable.
        attempt_id, identifier = attempt['id'], attempt['agent_run_id']
        with self.w.lock:
            journal = self.read_receipt(attempt)
            if not journal:
                journal = {'attempt_id': attempt_id, 'run_id': identifier,
                           'binding_sha256': fingerprint(attempt['binding']), 'occurred_at': occurred_at or now(), 'receipt': receipt,
                           'document_application_id': attempt['application_id'] if associate_document else None}
                atomic(self.receipt_path(attempt_id), encode(journal))
        self.store_receipt(identifier, attempt_id, journal)

    def store_receipt(self, identifier, attempt_id, journal):
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            attempt = get_row(state, 'submission_attempts', attempt_id)
            if (not attempt or not attempt.get('disclosed_at')
                    or attempt['status'] not in {'executing', 'reserved', 'unknown'}
                    or run.get('attempt_id') != attempt_id):
                raise ValueError('The receipt has no authorized dispatch to reconcile')
            attempt.update(status='confirmed', occurred_at=journal['occurred_at'], receipt=journal['receipt'],
                           document_application_id=journal['document_application_id'],
                           updated_at=now(), note='Verified outcome retained.')
            run.update(status='record_pending', updated_at=now(),
                       message='The channel confirmed the submission. Recording the exact application version.')
        self.revoke_permit(run)
        # If the live database committed but the Git snapshot failed to publish,
        # the portable journal is still needed by snapshot recovery.
        if self.w.database.status == 'current':
            self.receipt_path(attempt_id).unlink(missing_ok=True)

    def record(self, identifier):
        with self.w.edit() as state:
            run = self.find_run(state, identifier)
            attempt = get_row(state, 'submission_attempts', run.get('attempt_id'))
            if run['status'] == 'submitted':
                return
            if run['status'] != 'record_pending' or not attempt or attempt['status'] != 'confirmed':
                raise ValueError('There is no retained submission receipt to record')
            binding = attempt['binding']
            if not attempt.get('document_application_id'):
                run.update(status='submitted', application_id=None,
                           message='Submission recorded. The submitted document version is unknown.', updated_at=now())
                return
            version = get_row(state, 'applications', binding['application_id'])
            if not version or version.get('manifest_hash') != binding['manifest_hash'] or packages.changed(self.w.path, version):
                raise ValueError('Restore the intact submitted document version, then record the retained receipt.')
            if version['status'] != 'submitted':
                self.service.review(state, {'id': version['id'], 'status': 'submitted', 'occurred_at': attempt['occurred_at'],
                                            'comment': 'Connected application. See verified receipt ' + attempt['id'] + '.'})
            run.update(status='submitted', message='Submission recorded with the channel receipt.', updated_at=now())

    def resolve(self, args):
        identifier, outcome = args.get('id'), args.get('outcome')
        state = self.w.read()
        run = self.find_run(state, identifier)
        if identifier in self.active:
            raise ValueError('Wait for the external channel to finish before resolving its outcome')
        status = self.summary(state, run)['status']
        if outcome == 'record' and status in {'record_pending', 'submitted'}:
            if run['status'] != status:
                attempt = get_row(state, 'submission_attempts', run['attempt_id'])
                journal = self.read_receipt(attempt)
                if not journal:
                    raise ValueError('The recovery receipt is unavailable')
                self.store_receipt(identifier, attempt['id'], journal)
            self.record(identifier)
        elif status == 'uncertain' and outcome in {'confirmed', 'not_sent'} and args.get('confirmed') is True:
            evidence = args.get('evidence')
            if not isinstance(evidence, str) or not 10 <= len(evidence.strip()) <= 2000:
                raise ValueError('Describe the channel evidence you verified')
            receipt = {'provider': 'user-reconciliation', 'evidence': evidence.strip()}
            if outcome == 'confirmed':
                occurred = companies.valid_occurrence(args.get('occurred_at'), self.service.workspace_zone())
                attempt = get_row(state, 'submission_attempts', run['attempt_id'])
                associate = args.get('document_application_id') is not None
                if associate and (args['document_application_id'] != attempt['application_id'] or not cv_dispatched(attempt)):
                    raise ValueError('The intended document version is not supported by the dispatch evidence')
                self.receive(attempt, receipt, occurred_at=occurred, associate_document=associate)
                self.record(identifier)
            else:
                with self.w.edit() as state:
                    run = self.find_run(state, identifier)
                    attempt = get_row(state, 'submission_attempts', run['attempt_id'])
                    attempt.update(status='not_sent', receipt=receipt, updated_at=now(), note='User verified no submission.')
                    run.update(status='stopped', message='Verified that no submission occurred.', updated_at=now())
                    self.revoke_permit(run)
        else:
            raise ValueError('Choose a pending receipt or verify the uncertain submission outcome')
        return self.status(self.w.read(), {'id': identifier})
