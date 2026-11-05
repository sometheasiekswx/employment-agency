"""Local-only delivery: durable intents, exact approval, and no blind retries."""
from email.message import EmailMessage
from email import policy
from email.utils import parseaddr
from pathlib import Path
import json
import queue
import re
import threading

from . import packages, providers, matching, master
from .store import atomic, encode, digest, uid, now
from .workspaces import inside, settings
from .delivery_connections import Gmail, codex_select
from .linkedin_apply import LinkedIn, NeedsUser, linkedin_url
from .service import submitted_job_ids

ACTIVE = {'preparing', 'needs_user', 'awaiting_approval', 'executing', 'unknown'}


def fingerprint(value):
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def bounded(value, limit):
    if not isinstance(value, str) or len(value) > limit or '\x00' in value:
        raise ValueError('Invalid or oversized application field')
    return value.strip()


def address(value):
    value = bounded(value, 320)
    if '\r' in value or '\n' in value or parseaddr(value)[1] != value or not re.fullmatch(r'[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+', value):
        raise ValueError('Enter one valid email address')
    return value


class Delivery:
    def __init__(self, service, mail=None, browser_factory=None, selector=None):
        self.service = service
        self.w = service.w
        self.mail = mail or Gmail()
        self.browser_factory = browser_factory or LinkedIn
        self.selector = selector or codex_select
        self.lock = threading.RLock()
        self.commands = queue.Queue()
        self.thread = None
        self.browser = None
        self.browser_attempt = None
        self.stopping = False
        self.connection = {"status": "idle"}
        # Restoring an export or restarting cannot replay an external action.
        for record in self.records():
            if record['status'] in ('preparing', 'executing'):
                self.update(record, status='unknown', note='Interrupted. Verify the external outcome before resolving this attempt.')
            elif record['status'] in ('awaiting_approval', 'needs_user') and record['channel'] == 'linkedin':
                self.update(record, status='needs_user', note='Browser session closed. Resume to rebuild and review the form.')

    def records(self):
        folder = inside(self.w.path, 'records/submissions')
        result = []
        if folder.exists():
            for path in folder.glob('*.json'):
                if not re.fullmatch(r'[a-f0-9]{32}\.json', path.name):
                    continue
                result.append(json.loads(inside(self.w.path, 'records/submissions/' + path.name).read_text(encoding='utf-8')))
        return sorted(result, key=lambda r: r['created_at'])

    def get(self, id):
        if not isinstance(id, str) or not re.fullmatch('[a-f0-9]{32}', id):
            raise ValueError('Invalid attempt identifier')
        try:
            return json.loads(inside(self.w.path, 'records/submissions/' + id + '.json').read_text(encoding='utf-8'))
        except FileNotFoundError as exc:
            raise ValueError('Application attempt not found') from exc

    def update(self, record, **changes):
        record.update(changes)
        record['updated_at'] = now()
        atomic(inside(self.w.path, 'records/submissions/' + record['id'] + '.json'), encode(record))
        return record

    @property
    def busy(self):
        return any(r['status'] in ACTIVE - {'unknown'} for r in self.records()) or bool(self.thread and self.commands.unfinished_tasks)

    def check_local(self):
        if settings(self.w.path).get('demo'):
            raise ValueError('External applications are disabled in demo workspaces')

    def document(self, app_id):
        state = self.w.read()
        app = next((a for a in state['applications'] if a['id'] == app_id), None)
        if not app or not app.get('folder') or app['status'] == 'submitted':
            raise ValueError('Choose an unsubmitted job-specific application version')
        job = next(j for j in state['jobs'] if j['id'] == app['job_id'])
        if job.get('prior_application') == 'submitted' or job['id'] in submitted_job_ids(state):
            raise ValueError('This job is already recorded as submitted')
        if packages.changed(self.w.path, app):
            raise ValueError('Documents changed. Validate a new draft before applying')
        version = json.loads(inside(self.w.path, app['folder'] + '/version.json').read_text(encoding='utf-8'))
        if version['job']['id'] != job['id'] or any(version['job'].get(k) != job.get(k) for k in ('title', 'employer', 'location', 'description', 'requirements', 'url')):
            raise ValueError('The résumé belongs to a different listing')
        evidence_path = packages.path_for(self.w.path, app, 'evidence.json')
        evidence = json.loads(evidence_path.read_text(encoding='utf-8'))
        current = {f['id']: f for f in state['facts']}
        for fact in evidence.get('facts', []):
            live = current.get(fact['id'], {})
            if not live.get('confirmed') or live.get('retired') or live.get('conflict') or any(live.get(k) != fact.get(k) for k in ('text', 'association', 'dates')):
                raise ValueError('Career evidence changed; prepare and review a new tailored version')
        path = packages.path_for(self.w.path, app, 'resume.pdf')
        return app, job, state['identity'], path

    def check_binding(self, record):
        if not record['binding'].get('cover_letter'):
            raise ValueError('Prepare a new attempt with this listing’s custom résumé and cover letter')
        app, job, identity, resume = self.document(record['application_id'])
        binding = {'job_id': job['id'], 'application_id': app['id'], 'folder': app['folder'],
                   'resume': resume.relative_to(self.w.path).as_posix(), 'sha256': digest(resume.read_bytes()), 'job_sha256': fingerprint(job)}
        if record['binding'].get('cover_letter'):
            cover = packages.path_for(self.w.path, app, 'cover-letter.pdf')
            binding['cover_letter'] = {'path': cover.relative_to(self.w.path).as_posix(), 'sha256': digest(cover.read_bytes())}
        if binding != record['binding']:
            raise ValueError('The approved résumé/version changed. Cancel and prepare a new attempt')
        return resume

    def status(self):
        try:
            sender = self.mail.sender()
            gmail = {'connected': True, 'email': sender}
        except Exception:
            gmail = {'connected': False}
        import shutil
        return {'connection': self.connection, 'gmail': gmail, 'codex_installed': bool(shutil.which('codex')), 'attempts': self.records()}

    def action(self, operation, args):
        self.check_local()
        with self.lock:
            if operation in ('apply-connect-gmail', 'apply-disconnect-gmail'):
                if self.busy:
                    raise ValueError('Finish or cancel the active application/connection first')
                if operation == 'apply-disconnect-gmail':
                    return self.mail.disconnect()
                self.connection = {'status': 'connecting', 'note': 'Complete Google sign-in in your system browser'}
                self.enqueue('connect', args.get('client'))
                return self.status()
            if operation == 'apply-status':
                return self.status()
            if operation == 'apply-get':
                return self.get(args['id'])
            if operation == 'apply-tailor':
                if self.busy:
                    raise ValueError('Finish or cancel the active application first')
                state = self.w.read()
                app, job, _, _ = self.document(args['application_id'])
                profile = next((p for p in state['profiles'] if p['id'] == args.get('profile_id')), None)
                if not profile or not matching.match(job, profile, state['facts'])['eligible_for_preparation']:
                    raise ValueError('Choose an eligible search profile before using Codex')
                if master.status(self.w).get('changed'):
                    raise ValueError('Review master changes before using Codex')
                providers.require_consent(state, 'agent')
                handoff = self.service.action('handoff', {'job_id': job['id']})
                selection = self.selector(handoff)
                # The existing selection validator rejects fabricated/unconfirmed IDs.
                return self.service.action('agent-package', {'job_id': job['id'], 'profile_id': args['profile_id'], 'selection': selection})
            if operation == 'apply-start':
                return self.start(args)
            record = self.get(args['id'])
            if operation == 'apply-cancel':
                if record['status'] not in ('preparing', 'awaiting_approval', 'needs_user', 'failed'):
                    raise ValueError('Wait for the current operation; uncertain or completed sends cannot be cancelled')
                self.update(record, status='cancelled', note='Cancelled before submission')
                self.enqueue('close', record['id'])
            elif operation == 'apply-resolve':
                if record['status'] != 'unknown' or args.get('outcome') not in ('confirmed', 'not_sent'):
                    raise ValueError('Only an uncertain outcome can be reconciled')
                evidence = bounded(args.get('evidence', ''), 2000)
                if len(evidence) < 10:
                    raise ValueError('Describe the Sent-folder or site evidence you checked')
                self.update(record, status='confirmed' if args['outcome'] == 'confirmed' else 'not_sent',
                            receipt={'provider': 'user-reconciliation', 'evidence': evidence}, note='Outcome resolved by user; no automatic resend')
                if args['outcome'] == 'confirmed':
                    self.record_submission(record)
                self.enqueue('close', record['id'])
            elif operation == 'apply-resume':
                if record['channel'] != 'linkedin' or record['status'] != 'needs_user':
                    raise ValueError('This attempt is not waiting for browser assistance')
                self.check_binding(record)
                self.update(record, status='preparing', note='Inspecting the visible browser; no submission yet')
                self.enqueue('prepare', record['id'])
            elif operation == 'apply-approve':
                if record['status'] != 'awaiting_approval' or args.get('approved') is not True or args.get('fingerprint') != record.get('fingerprint'):
                    raise ValueError('Review the current complete application before approving')
                self.check_binding(record)
                self.update(record, status='executing', approved_at=now(), note='Approved action executing; do not retry')
                self.enqueue('submit', record['id'])
            else:
                raise ValueError('Unknown application operation')
            return self.get(record['id'])

    def start(self, args):
        if args.get('disclosure_confirmed') is not True:
            raise ValueError('Confirm disclosure of these documents/contact details to the selected destination')
        app, job, identity, resume = self.document(args['application_id'])
        for r in self.records():
            if r['binding']['job_id'] == job['id'] and r['status'] in ACTIVE | {'confirmed'}:
                raise ValueError('An active, uncertain or confirmed attempt already exists for this job')
        if self.busy:
            raise ValueError('Finish or cancel the active application first')
        channel = args.get('channel')
        if channel not in ('gmail', 'linkedin'):
            raise ValueError('Choose Gmail or LinkedIn')
        binding = {'job_id': job['id'], 'application_id': app['id'], 'folder': app['folder'],
                   'resume': resume.relative_to(self.w.path).as_posix(), 'sha256': digest(resume.read_bytes()), 'job_sha256': fingerprint(job)}
        cover = packages.path_for(self.w.path, app, 'cover-letter.pdf')
        binding['cover_letter'] = {'path': cover.relative_to(self.w.path).as_posix(), 'sha256': digest(cover.read_bytes())}
        payload = {'job': {'id': job['id'], 'title': job['title'], 'employer': job['employer']},
                   'contact': {'Email address': identity.get('email', ''), 'Mobile phone number': identity.get('phone', '')}}
        if channel == 'gmail':
            sender = address(self.mail.sender())
            payload.update({'from': sender, 'to': address(args.get('to', job.get('email', ''))),
                            'subject': bounded(args.get('subject', ''), 500), 'body': bounded(args.get('body', ''), 20000)})
            if not payload['subject'] or '\n' in payload['subject'] or '\r' in payload['subject'] or not payload['body']:
                raise ValueError('Enter a subject and application message')
        else:
            from .workspaces import config_home
            if config_home().resolve().is_relative_to(self.w.path):
                raise ValueError('Keep machine configuration/browser sessions outside the career workspace')
            payload['url'] = linkedin_url(job.get('url', ''))
        record = {'id': uid(), 'created_at': now(), 'application_id': app['id'], 'channel': channel,
                  'binding': binding, 'payload': payload, 'status': 'preparing', 'note': 'Preparing; no application sent'}
        self.update(record)
        self.enqueue('prepare', record['id'])
        return record

    def enqueue(self, command, id):
        if self.stopping:
            raise ValueError('Application service is stopping')
        self.commands.put((command, id))
        if not self.thread or not self.thread.is_alive():
            self.thread = threading.Thread(target=self.work, daemon=True, name='application-delivery')
            self.thread.start()

    def staged(self, record, cover_letter=False):
        resume = self.check_binding(record)
        expected_hash = record['binding']['sha256']
        if cover_letter:
            cover = record['binding']['cover_letter']
            resume = inside(self.w.path, cover['path'])
            expected_hash = cover['sha256']
        target = inside(self.w.path, '.runtime/apply/' + record['id'] + '/' + resume.name)
        data = resume.read_bytes()
        if digest(data) != expected_hash:
            raise NeedsUser('The résumé changed while preparing its upload; review a new version')
        if target.exists():
            if digest(target.read_bytes()) != expected_hash:
                raise NeedsUser('The staged résumé changed; cancel and prepare a new attempt')
            # Chrome retains a File reference. Replacing this inode after review
            # makes the browser's selected file unreadable even for identical bytes.
        else:
            atomic(target, data)
        return target

    def work(self):
        while True:
            command, id = self.commands.get()
            try:
                if command == 'stop':
                    return
                if command == 'connect':
                    try:
                        self.mail.connect_config(id)
                        self.connection = {'status': 'connected', 'note': 'Gmail connected securely'}
                    except Exception:
                        self.connection = {'status': 'failed', 'note': 'Gmail connection failed or timed out. Check your Google Desktop client and optional dependencies.'}
                    continue
                if command == 'close':
                    if self.browser and self.browser_attempt == id:
                        self.browser.close(); self.browser = None
                        self.browser_attempt = None
                    continue
                record = self.get(id)
                if record['status'] not in ('preparing', 'executing'):
                    continue
                try:
                    resume = self.staged(record)
                except ValueError as exc:
                    raise NeedsUser(str(exc)) from exc
                if command == 'prepare':
                    if record['channel'] == 'linkedin':
                        if self.browser and self.browser_attempt != id:
                            self.browser.close(); self.browser = None
                            self.browser_attempt = None
                        if not self.browser:
                            self.browser = self.browser_factory()
                            self.browser_attempt = id
                            self.browser.open(record['payload']['url'])
                        self.browser.cancelled = lambda: self.get(id)['status'] == 'cancelled'
                        cover = self.staged(record, cover_letter=True)
                        site = self.browser.prepare(record['payload'], resume, cover)
                        if site.get('upload_sha256') != record['binding']['sha256']:
                            raise NeedsUser('Browser upload does not match the approved custom résumé')
                        if site.get('cover_letter_sha256') != record['binding']['cover_letter']['sha256']:
                            raise NeedsUser('Browser upload does not match the approved custom cover letter')
                        record['payload']['site_review'] = site
                    with self.lock:
                        if self.get(id)['status'] == 'cancelled':
                            continue
                        self.update(record, status='awaiting_approval', fingerprint=fingerprint({'binding': record['binding'], 'payload': record['payload']}),
                                    note='Review the exact résumé, destination and all answers; nothing submitted yet')
                elif command == 'submit':
                    if fingerprint({'binding': record['binding'], 'payload': record['payload']}) != record['fingerprint']:
                        raise NeedsUser('The approval payload changed; prepare and review again')
                    if record['channel'] == 'gmail':
                        if self.mail.sender() != record['payload']['from']:
                            raise NeedsUser('Connected Gmail account changed; cancel and prepare again')
                        message = EmailMessage(policy=policy.SMTP)
                        for key in ('From', 'To', 'Subject'):
                            message[key] = record['payload'][key.lower()]
                        message['Message-ID'] = '<' + record['id'] + '@employment-agency.local>'
                        message.set_content(record['payload']['body'])
                        attachment = resume.read_bytes()
                        if digest(attachment) != record['binding']['sha256']:
                            raise NeedsUser('The staged résumé changed; review a new attempt')
                        message.add_attachment(attachment, maintype='application', subtype='pdf', filename=resume.name)
                        if record['binding'].get('cover_letter'):
                            cover = record['binding']['cover_letter']
                            data = inside(self.w.path, cover['path']).read_bytes()
                            if digest(data) != cover['sha256']:
                                raise NeedsUser('The cover letter changed; prepare and review a new attempt')
                            message.add_attachment(data, maintype='application', subtype='pdf', filename=Path(cover['path']).name)
                        receipt = self.mail.send(message.as_bytes())
                    else:
                        if not self.browser or self.browser_attempt != id:
                            raise NeedsUser('Browser closed. Resume and review before submitting')
                        receipt = self.browser.submit(record['payload']['site_review'], resume)
                    self.update(record, status='confirmed', receipt=receipt, note='Submission confirmation recorded')
                    self.record_submission(record)
                    if self.browser and self.browser_attempt == id:
                        self.browser.close(); self.browser = None
                        self.browser_attempt = None
            except NeedsUser as exc:
                current = self.get(id)
                if current['status'] != 'cancelled':
                    self.update(current, status='needs_user', note=str(exc))
            except Exception:
                record = self.get(id)
                if record['status'] == 'cancelled':
                    continue
                self.update(record, status='unknown' if command == 'submit' else 'failed',
                    note='Outcome uncertain. Check Gmail Sent or the job site before resolving; never blindly retry.' if command == 'submit'
                         else 'Preparation failed. Check connection setup or the browser, then cancel and prepare again. No submit action was requested.')
            finally:
                self.commands.task_done()
                if command == 'stop' and self.browser:
                    self.browser.close(); self.browser = None

    def record_submission(self, record):
        try:
            self.service.action('review', {'id': record['application_id'], 'status': 'submitted',
                                'comment': 'Apply For Me: confirmed attempt ' + record['id'] + ' (see private receipt)'})
        except Exception:
            # Remote delivery remains confirmed even when local review recording fails.
            self.update(record, note='External confirmation saved; document review status needs attention')

    def close(self):
        if self.thread and self.thread.is_alive():
            self.stopping = True
            self.commands.put(('stop', ''))
            self.thread.join(timeout=50)
            if self.thread.is_alive():
                raise ValueError('Application action is still finishing; wait before closing its workspace')
