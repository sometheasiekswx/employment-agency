"""Shared UI/CLI operations. Mutations are validated and runs are resumable."""

import base64
import re
import threading
import shutil
import math
import tempfile
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from .store import now, uid, digest, atomic, encode
from . import companies, imports, sources, matching, documents, providers, packages, master, summaries, editor, run_progress
from .workspaces import settings, configure, inside


def text(v, limit=2000):
    if not isinstance(v, str) or len(v) > limit or "\x00" in v:
        raise ValueError("Invalid or oversized text")
    return v.strip()


def strings(v):
    if not isinstance(v, list) or len(v) > 100:
        raise ValueError("Expected a list of at most 100 values")
    return [text(x, 500) for x in v if text(x, 500)]


def number(v):
    n = float(v)
    if not math.isfinite(n) or n < 0:
        raise ValueError("Expected a finite positive amount")
    return n


def find(items, id):
    return next((x for x in items if x["id"] == id), None) or fail("Record not found")


def fail(message):
    raise ValueError(message)


def queue_page_args(args):
    limit, offset = args.get('limit', 50), args.get('offset', 0)
    if type(limit) is not int or type(offset) is not int or not 1 <= limit <= 200 or not 0 <= offset < 2**63:
        raise ValueError('Invalid application queue page')
    return limit, offset


def submitted_job_ids(state):
    """Preserved submitted versions outrank editable/imported job metadata."""
    versions = {app['job_id'] for app in state['applications']
                if app['status'] == 'submitted' and not corrected_submission(app, state)}
    receipts = {record['binding']['job_id'] for record in state.get('submission_attempts', [])
                if record['status'] == 'confirmed'}
    return versions | receipts


def corrected_submission(app, state):
    """Only a linked, audited recovery changes the effective manual decision."""
    correction = app.get('submission_correction')
    if not isinstance(correction, dict):
        return False
    recovery = next((item for item in state['applications']
                     if item['id'] == correction.get('recovery_application_id')), None)
    lineage = recovery.get('submission_recovery') if recovery else None
    return bool(recovery and isinstance(lineage, dict) and lineage.get('original_id') == app['id']
                and recovery.get('manifest_hash') == app.get('manifest_hash')
                and recovery.get('folder') == app.get('folder'))


def application_role(app):
    return app.get('job_id') or app['id']


def legacy_rejections(state):
    """Match the application queue's current version before folding old rejections."""
    current = {}
    for app in state['applications']:
        if app['status'] == 'submitted' and corrected_submission(app, state):
            continue
        try:
            created = datetime.fromisoformat(app.get('created_at', '').replace('Z', '+00:00'))
            stamp = (created if created.tzinfo else created.replace(tzinfo=timezone.utc)).timestamp()
        except (AttributeError, ValueError, OverflowError, OSError):
            stamp = -math.inf
        key = (app['status'] == 'submitted', not app.get('archived'), stamp)
        role = application_role(app)
        if role not in current or key >= current[role][0]:
            current[role] = (key, app)
    return {role: app for role, (_, app) in current.items() if app['status'] == 'rejected'}


def include_legacy_removal(removals, app):
    if not app:
        return
    if removals and not removals[-1].get('restored_at'):
        removals[-1]['legacy_application_id'] = app['id']
        return
    decision = next((entry for entry in reversed(app.get('comments', []))
                     if entry.get('status') == 'rejected' and entry.get('kind') != 'comment'), {})
    at = decision.get('at') or app.get('created_at') or '1970-01-01T00:00:00Z'
    event_id = digest(f"legacy-rejection:{app['id']}:{at}".encode())[:32]
    if not any(event['id'] == event_id for event in removals):
        removals.append({'id': event_id, 'at': at, 'reason': '',
                         'legacy_application_id': app['id']})


def submission_token_owner(state, job_id, token):
    if not isinstance(token, str) or not token:
        return None
    owners = [app for app in state['applications']
              if app['job_id'] == job_id and app['status'] == 'submitted'
              and isinstance(app.get('submission_record'), dict)
              and app['submission_record'].get('token') == token]
    return owners[0] if len(owners) == 1 else None


def submission_chain_root(state, job):
    """A job token can restore only the prior proven by its unbroken owned chain."""
    token = job.get('submission_record_token')
    visited = set()
    while isinstance(token, str) and token and token not in visited:
        visited.add(token)
        owner = submission_token_owner(state, job['id'], token)
        if not owner:
            return None
        record = owner['submission_record']
        if 'prior_application' not in record:
            return None
        if 'prior_token' not in record:
            return record
        if record['prior_application'] != 'submitted':
            return None
        token = record['prior_token']
    return None


def submission_records(root):
    """Read receipt authority without starting or reconciling a delivery worker."""
    records = []
    try:
        # glob can suppress directory read errors, which would hide receipt authority.
        folder = inside(root, 'records/submissions')
        with os.scandir(folder) as entries:
            paths = [Path(entry.path) for entry in entries if entry.name.endswith('.json')]
    except FileNotFoundError:
        return []
    except OSError as exc:
        raise ValueError('Submission evidence is unreadable; review it before correcting a record') from exc
    for path in paths:
        if not re.fullmatch(r'[a-f0-9]{32}\.json', path.name):
            raise ValueError('Submission evidence is invalid; review it before correcting a record')
        try:
            record = json.loads(inside(root, 'records/submissions/' + path.name).read_text(encoding='utf-8'))
            binding = record['binding']
            if (not isinstance(record, dict) or not isinstance(binding, dict)
                    or record.get('id') != path.stem
                    or not isinstance(binding.get('job_id'), str) or not binding['job_id']
                    or not isinstance(record.get('application_id'), str)
                    or binding.get('application_id') != record['application_id']
                    or record.get('status') not in {'preparing', 'needs_user', 'awaiting_approval',
                                                   'executing', 'unknown', 'confirmed', 'cancelled',
                                                   'failed', 'not_sent'}):
                raise ValueError('Malformed submission receipt')
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ValueError('Submission evidence is invalid; review it before correcting a record') from exc
        records.append(record)
    return records


def check_submission_correction(records, job_id):
    if any(record['binding']['job_id'] == job_id and record['status'] in
           {'preparing', 'needs_user', 'awaiting_approval', 'reserved', 'executing', 'unknown', 'confirmed', 'handed_off'}
           for record in records):
        raise ValueError('An active, uncertain or confirmed delivery cannot be corrected as an unsent manual record')


def conflicts(s):
    groups = {}
    for f in s["facts"]:
        if f.get("claim_key") and not f.get("retired"):
            groups.setdefault(f["claim_key"].casefold(), []).append(f)
        f["conflict"] = False
    for group in groups.values():
        if (
            len(
                {
                    (f["text"], f.get("association", ""), f.get("dates", ""))
                    for f in group
                }
            )
            > 1
        ):
            for f in group:
                f["conflict"] = True


class Service:
    def __init__(self, workspace):
        self.w = workspace
        self.worker = None
        self.worker_lock = threading.Lock()
        self.delivery = None
        self.discovery = None
        self.agent_execution = None

    def state(self):
        with self.w.lock:
            state = self.w.read()
            snapshot = self.w.database.summary() if self.w.database else None
            queue = self.w.database.queue_page(historical=True)['rows'] if self.w.database else None
        from .application_context import role_blocker
        from .application_queue import pending_choices

        choices = pending_choices(state)
        slots = companies.ApplicationSlots(state) if snapshot else None
        state.pop('workspace_id', None)
        state.pop('application_answers', None)
        state.pop('agent_runs', None)
        state.pop('application_destinations', None)
        submitted = submitted_job_ids(state)
        submitted_dates = companies.submission_dates(state) if snapshot else {}
        rejected = legacy_rejections(state)
        skills = matching.skills_by_key(matching.available(state['facts']))
        unlisted = state.get('unlisted_removals', {})
        receipt_error, receipts = '', []
        if submitted:
            try:
                receipts = self.delivery_records(state)
            except ValueError as exc:
                receipt_error = str(exc)
        for job in state['jobs']:
            job['saved'] = job['id'] in choices
            if job['id'] in submitted or job['id'] in submitted_dates:
                job['prior_application'] = 'submitted'
            if job['id'] in rejected:
                include_legacy_removal(job.setdefault('removals', []), rejected.pop(job['id']))
            skill_evidence = matching.skill_evidence(job.get('requirements'), skills)
            if skill_evidence:
                job['matched_skill_evidence'] = skill_evidence
            else:
                job.pop('matched_skill_evidence', None)
        for role, app in rejected.items():
            include_legacy_removal(unlisted.setdefault(role, []), app)
        if unlisted:
            state['unlisted_removals'] = unlisted
        state['_workspace'] = {'path': str(self.w.path), **settings(self.w.path)}
        if snapshot:
            from . import company_logos

            zone = self.workspace_zone()
            employers = state.get('employers', [])
            employers_by_id = {row['id']: row for row in employers}
            employer_name_ids = companies.employer_name_ids(employers)
            employer_links = slots.links
            logos = company_logos.logo_urls(self.w.path, state)
            state['_workspace']['snapshot'] = snapshot
            state['_workspace']['workspace_id'] = self.w.workspace_id
            state['_workspace']['agent_queue'] = True
            state['_workspace']['company_cooldown_months'] = state.get(
                'company_cooldown_months', companies.DEFAULT_COOLDOWN_MONTHS)
            state['application_queue'] = queue
            state.pop('submission_attempts', None)
            for job in state['jobs']:
                link = employer_links.get(job['id'])
                employer = employers_by_id.get(link['employer_id']) if link else None
                evidence = job.get('employer_evidence', {})
                if 'logo' in evidence:
                    job['employer_evidence'] = {key: value for key, value in evidence.items() if key != 'logo'}
                if (alias_proof := companies.alias_confirmation(job).get('published_alias_proof')):
                    job['published_alias_proof'] = alias_proof
                job['hiring_employer_verified'] = bool(employer and not companies.employer_evidence_conflict(job, employer))
                employer_id = companies.discovery_employer(job, link, employer_name_ids)
                if employer_id in employers_by_id:
                    status = slots.status(employer_id)
                    job['company'] = {
                        'id': employer_id, 'name': employers_by_id[employer_id]['name'],
                        'vacancy_id': link['vacancy_id'] if link else None,
                        'submitted_vacancy': bool(link and link['vacancy_id'] in status.get('submitted_vacancies', [])),
                        **{key: status.get(key) for key in ('remaining', 'cooling', 'cooldown_until',
                                                           'cooldown_time_assumed', 'overflow', 'review_needed')},
                    }
                    if job['hiring_employer_verified'] and employer_id in logos:
                        job['company']['logo_url'] = logos[employer_id]
                stage, _ = slots.queue.get(job['id'], (None, False))
                if blocker := role_blocker(state, job, stage=stage) or slots.blocker(job['id']):
                    job['application_blocker'] = {'code': blocker[0], 'message': blocker[1]}
                if blocker := slots.blocker(job['id'], for_pending=True):
                    job['pending_blocker'] = {'code': blocker[0], 'message': blocker[1]}
                if job['id'] in submitted_dates:
                    submitted_on = link.get('submitted_on') if link else None
                    job['submission_time'] = companies.submission_time(
                        [submitted_on] if submitted_on else submitted_dates[job['id']], zone,
                    )
        state['_master'] = master.status(self.w)
        jobs = {job['id']: job for job in state['jobs']}
        for app in state['applications']:
            job = jobs.get(app['job_id'], {})
            if snapshot and app['status'] == 'submitted':
                link = employer_links.get(app['job_id'])
                actual = (link or {}).get('submitted_on') or companies.application_occurrence(app)
                app['submission_time'] = companies.submission_time([actual], zone)
            app['fit_summary'] = summaries.summarize(job, state['facts'])
            assessment = matching.match(job, {}, state['facts'])
            app['warnings'] = assessment['hard_conflicts'] + assessment['unknowns']
            if app.get('folder'):
                app['file_changes'] = packages.changed(self.w.path, app)
            if app['status'] == 'submitted' and not corrected_submission(app, state):
                if not app.get('folder') or not app.get('manifest_hash'):
                    app['submission_correction_blocked'] = 'This historical record has no verified canonical version to recover.'
                elif app.get('file_changes'):
                    app['submission_correction_blocked'] = 'Validate the changed files before correcting this record.'
                elif receipt_error:
                    app['submission_correction_blocked'] = receipt_error
                else:
                    try:
                        check_submission_correction(receipts, app['job_id'])
                    except ValueError as exc:
                        app['submission_correction_blocked'] = str(exc)
        return state

    def action(self, action, a):
        if not isinstance(a, dict):
            raise ValueError("Expected JSON object")
        if action in ('agent-capabilities', 'agent-application-start', 'agent-application-status',
                      'agent-application-answer', 'agent-application-resume', 'agent-application-stop',
                      'agent-application-resolve'):
            if not self.w.database:
                if action == 'agent-capabilities':
                    return {'available': False, 'channels': {}, 'reason': 'Connected applications require the local SQLite workspace'}
                raise ValueError('Connected applications require the local SQLite workspace')
            with self.worker_lock:
                if action in ('agent-application-start', 'agent-application-resume') and self.delivery and self.delivery.busy:
                    raise ValueError('Wait for the active delivery before starting a connected application')
                if self.agent_execution is None:
                    from .agent_execution import AgentExecution
                    self.agent_execution = AgentExecution(self)
            return self.agent_execution.action(action, a)
        if action in ('application-context', 'application-handoff', 'research-handoff', 'application-answer',
                      'application-destination', 'agent-queue', 'agent-queue-mark', 'self-application-start'):
            if not self.w.database:
                raise ValueError('This operation requires a local SQLite workspace')
            from . import application_context, application_queue, company_handoff

            if action == 'application-context':
                return application_context.read(self, a)
            if action == 'application-handoff':
                return application_context.handoff(self, a)
            if action == 'research-handoff':
                return application_context.research_handoff(self, a)
            if action == 'application-answer':
                return application_context.record(self, a, application_context.save_answer)
            if action == 'application-destination':
                return application_context.record(self, a, application_context.save_destination)
            if action == 'self-application-start':
                return company_handoff.start(self, a)
            if action == 'agent-queue':
                limit, offset = queue_page_args(a)
                with self.w.lock:
                    return self.w.database.agent_queue_page(limit=limit, offset=offset)
            with self.w.edit() as state:
                return application_queue.set_pending(state, a.get('job_id'), a.get('marked'),
                                                     legacy_agent=True, enforce_slots=True)
        if action in ("discovery-start", "discovery-status", "discovery-stop"):
            from .discovery import Discovery

            with self.worker_lock:
                if self.discovery is None:
                    self.discovery = Discovery(self)
                return self.discovery.action(action, a)
        if action.startswith('apply-'):
            if self.worker and self.worker.is_alive():
                raise ValueError('Wait for the preparation run before applying')
            with self.worker_lock:
                if action in ('apply-start', 'apply-approve', 'apply-resume') and self.agent_execution and self.agent_execution.busy:
                    raise ValueError('Wait for the connected application before continuing this delivery')
                if self.delivery is None:
                    from .application_delivery import Delivery
                    self.delivery = Delivery(self)
            return self.delivery.action(action, a)
        if action.startswith('company-') or action == 'snapshot-status':
            if not self.w.database:
                raise ValueError('This operation requires a local SQLite workspace')
            return self.company_action(action, a)
        if action == 'application-queue':
            if not self.w.database:
                raise ValueError('Paginated application queues require a SQLite workspace')
            stage = a.get('stage')
            if stage not in (None, 'active', 'submitted', 'saved', 'removed'):
                raise ValueError('Choose an application queue')
            limit, offset = queue_page_args(a)
            with self.w.lock:
                return self.w.database.queue_page(stage=stage, historical=a.get('history') is True,
                                                  limit=limit, offset=offset)
        if action == 'history':
            from .history import versions
            result = versions(self.w.path, role=a.get('role'), employer=a.get('employer'))
            if 'limit' in a or 'offset' in a:
                limit, offset = a.get('limit', 50), a.get('offset', 0)
                if type(limit) is not int or type(offset) is not int or not 1 <= limit <= 200 or offset < 0:
                    raise ValueError('Invalid application history page')
                return {'rows': result[offset:offset + limit],
                        'next_offset': offset + limit if offset + limit < len(result) else None}
            return result
        if action == 'document-editor':
            return editor.load(self.w, a)
        if action in ('preview-document', 'save-document'):
            return editor.edit(self, a, save=action == 'save-document')
        if action == 'workspace-settings':
            previous_zone = settings(self.w.path)['timezone']
            result = configure(self.w.path, a)
            if self.w.database and result['timezone'] != previous_zone:
                # The assumed local time of a date-only submission follows the workspace zone.
                with self.w.edit():
                    pass
            return result
        if action == 'master-propose':
            return master.propose(self.w)
        if action == 'master-accept':
            if a.get('confirmed') is not True:
                raise ValueError('Confirm the displayed master changes first')
            result = master.accept(self.w, a['sha256'], a.get('selected_candidates', ()))
            with self.w.edit() as state:
                conflicts(state)
            return result
        if action == 'history-adopt':
            from .application_context import without_branding

            with self.w.lock:
                entry = packages.catalogue(self.w.path).get(a['id'])
                if not entry:
                    raise ValueError('Historical version not found')
                folder, _ = entry
                index = json.loads(inside(self.w.path, '.recovery/index.json').read_text())
                baseline_hash = index.get(folder)
                if not baseline_hash:
                    raise ValueError('No verified recovery copy exists for this historical version')
                baseline = json.loads(inside(self.w.path, '.recovery/versions/' + baseline_hash + '.json').read_text())
                original = {'folder': folder, 'manifest_hash': baseline_hash, 'documents': packages.document_map(baseline)}
                state = self.w.read()
                raw_job = baseline['job']
                job = next((j for j in state['jobs'] if j['id'] == raw_job.get('id') or (j.get('url') and j.get('url') == raw_job.get('url'))), None)
                if not job:
                    job = {**without_branding(raw_job), 'id': digest(encode(raw_job))[:24],
                           'availability': 'unknown', 'eligibility': 'unknown',
                           'requirements': raw_job.get('requirements', []), 'saved': False}
                    job.pop('company', None)
                new = {'id': uid(), 'job_id': job['id'], 'title': job['title'], 'employer': job['employer'],
                       'status': 'draft', 'created_at': now(), 'comments': [], 'fact_ids': [], 'derived_from_folder': folder}
                with self.w.edit() as state:
                    was_pending = self.pending_before_change(state, job['id'])
                    if not any(j['id'] == job['id'] for j in state['jobs']):
                        state['jobs'].append(job)
                    self.register_draft(state, new, was_pending)
                    new.update(packages.adopt_edits(self.w.path, original, without_branding(job), state['identity']))
                return new
        if action == 'adopt-edits':
            from .application_context import without_branding

            with self.w.edit() as state:
                original = find(state['applications'], a['id'])
                job = find(state['jobs'], original['job_id'])
                new = {**original, 'id': uid(), 'created_at': now(), 'status': 'draft',
                       'comments': [], 'derived_from': original['id']}
                for key in ('reviewed_at', 'submitted_at', 'file_changes', 'archived',
                            'submission_record', 'submission_correction'):
                    new.pop(key, None)
                self.register_draft(state, new, self.pending_before_change(state, job['id']))
                new.update(packages.adopt_edits(self.w.path, original, without_branding(job), state['identity']))
                return new
        if action == "identity":
            identity = {
                k: text(a.get(k, ""), 500)
                for k in ("name", "email", "phone", "location", "languages")
            }
            if any("\n" in v or "\r" in v for v in identity.values()):
                raise ValueError("Identity fields must be single lines")
            with self.w.edit() as s:
                s["identity"] = identity
            return identity
        if action == "import":
            name = Path(text(a["name"], 200)).name
            data = base64.b64decode(a["data"], validate=True)
            body = imports.extract(name, data)
            id = uid()
            atomic(inside(self.w.path, 'imports/' + id + '.txt'), body.encode())
            atomic(inside(self.w.path, 'imports/' + id + '/' + name), data)
            if a.get('use_as_master'):
                master_path = 'master/main.' + name.rsplit('.', 1)[-1].lower()
                old = inside(self.w.path, master_path)
                if old.exists():
                    atomic(inside(self.w.path, '.recovery/masters/' + digest(old.read_bytes())), old.read_bytes())
                atomic(old, data)
                configure(self.w.path, {'master': master_path})
            lines = [x.strip(" \t•-") for x in body.splitlines() if x.strip()]
            with self.w.edit() as s:
                for line in ([] if a.get("use_as_master") else lines[:500]):
                    s["facts"].append(
                        {
                            "id": uid(),
                            "text": line[:2000],
                            "category": "experience",
                            "association": "",
                            "dates": "",
                            "claim_key": "",
                            "confirmed": False,
                            "retired": False,
                            "conflict": False,
                            "source": {
                                "name": name,
                                "sha256": digest(data),
                                "import": id,
                            },
                            "updated_at": now(),
                        }
                    )
                s["events"].append(
                    {
                        "at": now(),
                        "type": "import",
                        "count": min(len(lines), 500),
                        "truncated": len(lines) > 500,
                    }
                )
            return {"candidates": min(len(lines), 500), "truncated": len(lines) > 500}
        if action == "requirement-evidence":
            return self.record_requirement_evidence(a)
        if action in ("fact", "confirm", "retire", "restore-fact"):
            with self.w.edit() as s:
                if action == "fact":
                    old = find(s["facts"], a["id"]) if a.get("id") else None
                    f = {
                        k: text(a.get(k, ""))
                        for k in (
                            "text",
                            "category",
                            "association",
                            "dates",
                            "claim_key",
                        )
                    }
                    if not f["text"]:
                        raise ValueError("Fact text required")
                    f.update(
                        {
                            "id": old["id"] if old else uid(),
                            "confirmed": False,
                            "retired": False,
                            "updated_at": now(),
                            "source": old["source"]
                            if old
                            else {"name": "User supplied note", "at": now()},
                        }
                    )
                    if old:
                        if old["text"] != f["text"]:
                            self.unlink_requirement_fact(s, old["id"])
                        s["facts"].remove(old)
                    s["facts"].append(f)
                else:
                    f = find(s["facts"], a["id"])
                    if action == "confirm":
                        conflicts(s)
                        if f["conflict"] or f.get("retired"):
                            raise ValueError(
                                "Resolve conflicting or retired fact first"
                            )
                        f["confirmed"] = True
                    elif action == 'retire':
                        if not f.get('retired'):
                            s['events'].append({'at': now(), 'type': 'fact_retired', 'fact_id': f['id'],
                                                'previous_confirmed': bool(f.get('confirmed'))})
                        f["retired"] = True
                        f["confirmed"] = False
                    elif f.get('retired'):
                        f['retired'] = False
                        f['confirmed'] = False
                        f['updated_at'] = now()
                        s['events'].append({'at': f['updated_at'], 'type': 'fact_restored', 'fact_id': f['id']})
                conflicts(s)
            return f
        if action == "profile":
            p = {
                k: strings(a.get(k, []))
                for k in (
                    "roles",
                    "locations",
                    "seniority",
                    "arrangements",
                    "hard",
                    "exclude",
                    "work_rights",
                )
            }
            p.update(
                {
                    k: bool(a.get(k, False))
                    for k in ("include_stretch", "include_unknown", "needs_sponsorship")
                }
            )
            p.update(
                {
                    "id": a.get("id") or uid(),
                    "name": text(a.get("name", "Search"), 100),
                    "minimum": number(a.get("minimum", 0)),
                    "currency": text(a.get("currency", "USD"), 10),
                    "period": text(a.get("period", "month"), 20),
                    "template": a.get("template", "navy"),
                }
            )
            if p["template"] not in ("navy", "plain"):
                raise ValueError("Unknown template")
            with self.w.edit() as s:
                if a.get("id"):
                    s["profiles"].remove(find(s["profiles"], a["id"]))
                s["profiles"].append(p)
            return p
        if action == "job":
            return self.add_job(a)
        if action in ('remove-job', 'restore-job', 'job-removal-reason'):
            return self.job_removal(action, a)
        if action == "save-job":
            from .application_queue import set_pending

            with self.w.edit() as state:
                choice = set_pending(state, a.get("id"), a.get("saved"), enforce_slots=bool(self.w.database))
            return {"id": choice["id"], "saved": choice["marked"]}
        if action == "url":
            url = text(a['url'], 2000)
            if self.w.database:
                state = self.w.read()
                if any(job.get('url') == url and companies.discovery_status(state, job)['cooling']
                       for job in state['jobs']):
                    raise ValueError('Company is paused. The existing listing is still available in the workspace.')
            fetched = sources.url_job(url)
            if self.w.database:
                from . import company_logos

                with self.w.edit() as state:
                    listing = self.add_job(fetched, match_url=True, state=state, discovered=True)
                    companies.link_verified_listing(state, listing, self.workspace_zone())
                company_logos.enrich_discovered(self.w, [listing['id']])
                return listing
            return self.add_job(fetched, match_url=True)
        if action == "source":
            from .job_feeds import validate_selector

            kind = a["kind"]
            board = text(a["board"], 100)
            validate_selector(kind, board)
            src = {
                "id": uid(),
                "kind": kind,
                "board": board,
                "status": "not checked",
                "checked_at": None,
            }
            with self.w.edit() as s:
                s["sources"].append(src)
            return src
        if action == "discover":
            return self.refresh(a["id"])
        if action == "rank":
            # Matching needs records, not document integrity or delivery checks.
            s = self.w.read()
            submitted = submitted_job_ids(s)
            linked_employers = {}
            if self.w.database:
                submitted.update(companies.submission_dates(s))
                employers = {row['id']: row for row in s.get('employers', [])}
                linked_employers = {row['id']: employers.get(row['employer_id']) for row in s.get('employer_links', [])}
            for job in s['jobs']:
                if job['id'] in submitted:
                    job['prior_application'] = 'submitted'
                if self.w.database:
                    employer = linked_employers.get(job['id'])
                    job['hiring_employer_verified'] = bool(employer and not companies.employer_evidence_conflict(job, employer))
            rows = matching.ranked(
                self.discoverable_jobs(s), find(s["profiles"], a["profile_id"]), s["facts"]
            )
            if self.w.database:
                from . import company_logos

                company_logos.decorate_jobs(self.w.path, s, (row['job'] for row in rows))
            return rows
        if action == "consent":
            provider = a["provider"]
            if provider not in ("agent", "openai"):
                raise ValueError("Unknown provider")
            with self.w.edit() as s:
                if not a.get("grant"):
                    s["consents"].pop(provider, None)
                else:
                    if a.get("purpose") != providers.PURPOSE or sorted(
                        a.get("categories", [])
                    ) != sorted(providers.CATEGORIES):
                        raise ValueError(
                            "Confirm purpose and both disclosure categories"
                        )
                    s["consents"][provider] = {
                        "purpose": providers.PURPOSE,
                        "categories": providers.CATEGORIES,
                        "at": now(),
                    }
            return {"granted": bool(a.get("grant"))}
        if action == "handoff":
            s = self.state()
            providers.require_consent(s, "agent")
            j = find(s["jobs"], a["job_id"])
            return providers.handoff(j, matching.available(s["facts"]))
        if action == "local-package":
            s = self.state()
            profile = find(s["profiles"], a["profile_id"])
            job = find(s["jobs"], a["job_id"])
            facts = matching.available(s["facts"])
            result = matching.match(job, profile, facts)
            if not result["eligible_for_preparation"]:
                raise ValueError("Resolve matching constraints before preparing")
            return self.prepare(
                job, profile, s["identity"], facts, result, result["fact_ids"][:10]
            )
        if action == "agent-package":
            s = self.state()
            p = find(s["profiles"], a["profile_id"])
            j = find(s["jobs"], a["job_id"])
            facts = matching.available(s["facts"])
            ids = providers.selection(a["selection"], facts)
            m = matching.match(j, p, facts)
            if not m["eligible_for_preparation"]:
                raise ValueError(
                    "Job is excluded or requires explicit stretch/unknown inclusion"
                )
            return self.prepare(j, p, s["identity"], facts, m, ids)
        if action == "run":
            return self.start(a)
        if action == "resume":
            with self.w.edit() as s:
                r = find(s["runs"], a["id"])
                if r["status"] not in ("paused", "cancelled", "failed"):
                    raise ValueError("Run is not resumable")
                r["status"] = "paused"
                r["cancel"] = False
            self.launch(a["id"])
            return {"id": a["id"]}
        if action == "cancel":
            with self.w.edit() as s:
                find(s["runs"], a["id"])["cancel"] = True
            return {"requested": True}
        if action == 'correct-submission':
            if a.get('confirmed') is not True:
                raise ValueError('Confirm that this manual submission was recorded by mistake')
            reason = text(a.get('reason', ''), 4000)
            if not reason:
                raise ValueError('Explain why the manual submission record is incorrect')
            with self.w.edit() as s:
                app = find(s['applications'], a['id'])
                if app['status'] != 'submitted':
                    raise ValueError('Choose a submitted manual record to correct')
                if not app.get('manifest_hash') or a.get('base') != app['manifest_hash']:
                    raise ValueError('The application version changed; refresh before correcting its record')
                if app.get('submission_correction'):
                    if not corrected_submission(app, s):
                        raise ValueError('The original correction needs review; no new record was created')
                    return find(s['applications'], app['submission_correction']['recovery_application_id'])
                if not app.get('folder') or packages.changed(self.w.path, app):
                    raise ValueError('Files changed; validate the preserved version before correcting its record')
                check_submission_correction(self.delivery_records(s), app['job_id'])
                stamp, recovery_id = now(), uid()
                recovered = {**app, 'id': recovery_id, 'created_at': stamp, 'status': 'draft',
                             'comments': [], 'derived_from': app['id'],
                             'submission_recovery': {'original_id': app['id'], 'at': stamp, 'reason': reason,
                                                     'recorded_at': app.get('submitted_at', '')}}
                for key in ('reviewed_at', 'submitted_at', 'file_changes', 'archived',
                            'submission_record', 'submission_correction'):
                    recovered.pop(key, None)
                app['submission_correction'] = {'at': stamp, 'reason': reason,
                                                'recovery_application_id': recovery_id}
                app['comments'].append({'at': stamp, 'kind': 'submission-correction', 'status': 'submitted',
                                        'text': reason, 'recovery_application_id': recovery_id})
                s['events'].append({'at': stamp, 'type': 'submission_corrected', 'application_id': app['id'],
                                    'recovery_application_id': recovery_id, 'reason': reason})
                s['applications'].append(recovered)
                job = find(s['jobs'], app['job_id'])
                if app['job_id'] not in submitted_job_ids(s):
                    root = submission_chain_root(s, job)
                    if root:
                        job['prior_application'] = root['prior_application']
                        job.pop('submission_record_token', None)
            return recovered
        if action == "review":
            with self.w.edit() as state:
                return self.review(state, a)
        if action == "export":
            dest = self.w.path / ".runtime/exports" / (uid() + ".zip")
            self.w.export(dest)
            return {"file": dest.name}
        raise ValueError("Unknown operation")

    def pending_before_change(self, state, job_id):
        from .application_queue import pending_choices

        return bool(self.w.database and job_id in pending_choices(state)
                    and job_id in companies.ApplicationSlots(state).pending)

    def register_draft(self, state, draft, was_pending):
        from .application_queue import check_restored_choice

        state['applications'].append(draft)
        if self.w.database:
            check_restored_choice(state, draft['job_id'], was_pending)

    def review(self, s, a):
        app = find(s["applications"], a["id"])
        if 'status' not in a:
            comment = text(a.get('comment', ''), 4000)
            if not comment.strip():
                raise ValueError('Enter a comment to save')
            app['comments'].append({'at': now(), 'text': comment, 'status': app['status'], 'kind': 'comment'})
            return app
        status = a.get("status", app["status"])
        if status not in ("draft", "reviewed", "rejected", "submitted"):
            raise ValueError("Unknown review status")
        if app.get('submission_correction'):
            raise ValueError('This manual submission was corrected; review the recovered draft instead')
        if app["status"] == "submitted" and status != "submitted":
            raise ValueError("Submitted snapshot is immutable")
        job_id = application_role(app)
        check_restore = self.w.database and status in ('draft', 'reviewed') and status != app["status"]
        was_pending = self.pending_before_change(s, job_id) if check_restore else False
        intact = not packages.changed(self.w.path, app) if app.get('folder') else documents.intact(self.w.path / 'packages' / app['id'])
        if status in ('reviewed', 'submitted') and not intact:
            raise ValueError("Files changed; cannot approve")
        stamp = now()
        if status in ('reviewed', 'submitted') and not app.get('reviewed_at'):
            app['reviewed_at'] = next((c['at'] for c in app.get('comments', []) if c.get('kind') != 'comment' and c.get('status') in ('reviewed', 'submitted')), stamp)
        if status == 'submitted' and not app.get('submitted_at'):
            app['submitted_at'] = next((c['at'] for c in app.get('comments', []) if c.get('kind') != 'comment' and c.get('status') == 'submitted'), stamp)
        if status == 'submitted':
            if a.get('occurred_at') and app['status'] != 'submitted':
                app['occurred_at'] = companies.valid_occurrence(a['occurred_at'], self.workspace_zone())
            job = find(s['jobs'], app['job_id'])
            if app['status'] != 'submitted':
                prior = 'submitted' if job['id'] in submitted_job_ids(s) else job.get('prior_application', 'none')
                prior_token = job.get('submission_record_token')
                app['submission_record'] = {'at': stamp, 'previous_status': app['status'],
                                            'prior_application': prior,
                                            'token': uid()}
                if prior == 'submitted' and submission_token_owner(s, job['id'], prior_token):
                    app['submission_record']['prior_token'] = prior_token
                job['submission_record_token'] = app['submission_record']['token']
            job['prior_application'] = 'submitted'
        app["status"] = status
        app["comments"].append(
            {
                "at": now(),
                "text": text(a.get("comment", ""), 4000),
                "status": status,
            }
        )
        if check_restore:
            from .application_queue import check_restored_choice

            check_restored_choice(s, job_id, was_pending)
        return app

    def workspace_zone(self):
        from .workspaces import time_zone
        return time_zone(settings(self.w.path)['timezone'])

    def delivery_records(self, state):
        return state.get('submission_attempts', []) if self.w.database else submission_records(self.w.path)

    @staticmethod
    def discoverable_jobs(state):
        name_ids = companies.employer_name_ids(state.get('employers', []))
        links = {row['id']: row for row in state.get('employer_links', [])}
        cooling = {row['id'] for row in state.get('company_rounds', []) if companies.allowance(row)['cooling']}
        return [job for job in state['jobs']
                if companies.discovery_employer(job, links.get(job['id']), name_ids) not in cooling]

    def company_action(self, action, args):
        if action == 'company-avoid':
            if args:
                raise ValueError('company-avoid takes no arguments')
            with self.w.lock:
                return {'workspace': str(self.w.path), 'companies': self.w.database.employers_to_avoid()}
        if action in ('company-logo-inventory', 'company-logo-backfill'):
            from . import company_logos

            operation = company_logos.inventory if action == 'company-logo-inventory' else company_logos.backfill
            return operation(self.w, args)
        if action == 'company-research':
            ids = args.get('job_ids')
            if not isinstance(ids, list) or any(not isinstance(job_id, str) for job_id in ids):
                raise ValueError('Provide the checked workspace job IDs')
            state = self.w.read()
            if not set(ids) <= {job['id'] for job in state['jobs']}:
                raise ValueError('The research includes an unknown workspace job ID')
            result = companies.research(state, find(state['profiles'], args['profile_id']), ids)
            return {'workspace': str(self.w.path), **result}
        if action == 'snapshot-status':
            with self.w.lock:
                self.w.database.publish(verify=True)
                return self.w.database.summary()
        if action == 'company-roles':
            result = companies.company_roles(self.w.read(), args['job_id'], args.get('profile_id'))
            if args.get('refresh') is True and not result['status']['cooling']:
                for source in result['sources']:
                    self.refresh(source['id'])
                result = companies.company_roles(self.w.read(), args['job_id'], args.get('profile_id'))
            return result
        if action in ('company-research-check', 'company-research-source'):
            name = text(args.get('name', ''), 300).strip()
            if not name:
                raise ValueError('Provide the hiring employer name')
            if action == 'company-research-source':
                from .application_context import https_address
                evidence_url = args.get('evidence_url')
                if evidence_url is not None and not https_address(evidence_url):
                    raise ValueError('Provide the official careers page that links this board')
                return self.refresh(args['source_id'], research_name=name, research_evidence=evidence_url)
            return {'workspace': str(self.w.path), **companies.research_employer(self.w.read(), name)}
        if action == 'company-selection':
            from .application_context import selected_jobs

            state = self.w.read()
            result = companies.company_roles(state, args['job_id'], args.get('profile_id'))
            requested = args.get('job_ids')
            if not isinstance(requested, list) or not 1 <= len(requested) <= companies.ROUND_CAPACITY:
                raise ValueError('Choose one or two roles within the available application slots')
            selected_jobs(state, args)
            slots = companies.ApplicationSlots(state)
            if problems := slots.selection_blockers(requested):
                job_id, blocker = next(iter(problems.items()))
                raise companies.CompanyBlocked(*blocker, job_id=job_id)
            eligible = {row['job']['id'] for row in result['roles']}
            if not set(requested) <= eligible:
                raise ValueError('Choose an available role from this company shortlist')
            return {'job_ids': requested}
        if action.startswith('company-submission-'):
            from .company_handoff import handoff
            return handoff(self, action, args)
        zone = self.workspace_zone()
        if action == 'company-resolve':
            from . import company_logos

            with self.w.edit() as state:
                link = companies.confirm_researched_listing(state, args, zone)
            company_logos.enrich_discovered(self.w, [link['id']])
            return link
        with self.w.edit() as state:
            if action == 'company-cooldown-settings':
                months = args.get('months')
                if type(months) is not int or not 1 <= months <= 24:
                    raise ValueError('Enter a cooldown of 1 to 24 whole months')
                state['company_cooldown_months'] = months
                return {'months': months}
            if action == 'company-map':
                return companies.map_job(state, args, zone)
            if action == 'company-history-link':
                record = next((row for row in state.get('historical_decisions', [])
                               if companies.history_id(row) == args.get('history_id')), None)
                link = companies.employer_link(state, args['job_id'])
                if not record or not link or args.get('confirmed') is not True:
                    raise ValueError('Confirm the existing historical submission and its listing')
                links = state.setdefault('company_history_links', [])
                existing = companies.by_id(links, args['history_id'])
                if existing:
                    raise ValueError('This historical submission is already linked')
                entry = {'id': args['history_id'], 'job_id': args['job_id'],
                         'occurred_at': companies.valid_occurrence(args.get('occurred_at'), zone)}
                links.append(entry)
                return entry
            if action == 'company-pause':
                link = companies.employer_link(state, args['job_id'])
                status = companies.company_status(state, link['employer_id']) if link else {}
                if not link or status['review_needed'] or status['remaining'] != 1 or len(status.get('used', [])) != 1:
                    raise ValueError('A company can be paused after one confirmed submission')
                pause = {'id': uid(), 'employer_id': link['employer_id'], 'at': companies.clock().isoformat()}
                state.setdefault('company_pauses', []).append(pause)
                return pause
        raise ValueError('Unknown company operation')

    @staticmethod
    def unlink_requirement_fact(state, fact_id):
        """A changed assertion needs its own assessment against the original requirement."""
        for job in state["jobs"]:
            records = job.get("requirement_evidence")
            if not isinstance(records, dict):
                continue
            for record in records.values():
                ids = record.get("fact_ids") if isinstance(record, dict) else None
                if isinstance(ids, list) and fact_id in ids:
                    record["fact_ids"] = [
                        linked_id for linked_id in ids if linked_id != fact_id
                    ]

    def record_requirement_evidence(self, args):
        job_id = text(args.get("job_id", ""), 100)
        requirement = args.get("requirement", "")
        if not job_id or not text(requirement, 500):
            raise ValueError("Job and requirement are required")
        details = text(args.get("details", ""))
        save_skill = args.get("save_skill", False)
        if not isinstance(save_skill, bool):
            raise ValueError("save_skill must be a boolean")
        if save_skill and details:
            raise ValueError("Confirm the skill or save a written example")
        with self.w.edit() as state:
            job = find(state["jobs"], job_id)
            requirements = job.get("requirements")
            if not isinstance(requirements, list) or requirement not in requirements:
                raise ValueError("Choose a requirement from the current listing")
            records = job.setdefault("requirement_evidence", {})
            if not isinstance(records, dict):
                raise ValueError("Saved requirement evidence is invalid")
            record = records.setdefault(requirement, {})
            if not isinstance(record, dict):
                raise ValueError("Saved requirement evidence is invalid")
            ids = record.get("fact_ids", [])
            if not isinstance(ids, list) or any(
                not isinstance(fact_id, str) for fact_id in ids
            ):
                raise ValueError("Saved requirement evidence is invalid")
            if not details and not save_skill:
                record["confirmed"] = True
                return record
            confirmed = matching.available(state["facts"])
            if save_skill:
                skills = matching.skills_by_key(confirmed)
                matches = skills.get(matching.skill_key(requirement), [])
                fact = next(
                    (candidate for candidate in matches if candidate["id"] in ids),
                    matches[0] if matches else None,
                )
                record.pop("confirmed", None)
            else:
                fact = next(
                    (
                        candidate for candidate in confirmed
                        if candidate["id"] in ids and candidate["text"] == details
                    ),
                    None,
                )
            if fact is None:
                timestamp = now()
                fact = {
                    "id": uid(),
                    "text": requirement if save_skill else details,
                    "category": "skill" if save_skill else "experience",
                    "association": "",
                    "dates": "",
                    "claim_key": "",
                    "confirmed": True,
                    "retired": False,
                    "conflict": False,
                    "updated_at": timestamp,
                    "source": {
                        "name": matching.USER_CONFIRMED_SKILL_SOURCE if save_skill else "User supplied note",
                        "at": timestamp,
                    },
                }
                state["facts"].append(fact)
            if fact["id"] not in ids:
                record["fact_ids"] = [*ids, fact["id"]]
            return record

    def job_removal(self, action, a):
        job_id, removal_id = a.get('id'), a.get('removal_id')
        if not isinstance(job_id, str) or not re.fullmatch(r'[a-f0-9]{24,32}', job_id):
            raise ValueError('Invalid job ID')
        if not isinstance(removal_id, str) or not re.fullmatch(r'[a-f0-9]{32}', removal_id):
            raise ValueError('Invalid removal ID')
        comment = text(a.get('comment'), 4000) if action == 'job-removal-reason' else None
        with self.w.edit() as s:
            job = next((item for item in s['jobs'] if item['id'] == job_id), None)
            if job is not None:
                removals = job.setdefault('removals', [])
            elif any(application_role(app) == job_id for app in s['applications']):
                removals = s.setdefault('unlisted_removals', {}).setdefault(job_id, [])
            else:
                raise ValueError('Record not found')
            legacy = legacy_rejections(s).get(job_id)
            include_legacy_removal(removals, legacy)
            event = next((item for item in removals if item['id'] == removal_id), None)
            latest = removals[-1] if removals else None
            active = latest if latest and not latest.get('restored_at') else None
            if action == 'remove-job':
                # A delayed retry must not reapply an event that was restored.
                if event is None:
                    if active:
                        raise ValueError('Job is already removed; reload before removing again')
                    removals.append({'id': removal_id, 'at': now(), 'reason': ''})
            elif event is None:
                raise ValueError('Removal event not found')
            elif action == 'restore-job':
                # Undo belongs to one event, never to a subsequent removal.
                if event is active:
                    was_pending = self.pending_before_change(s, job_id)
                    event['restored_at'] = now()
                    if legacy and event.get('legacy_application_id') == legacy['id']:
                        legacy['status'] = 'draft'
                        legacy.pop('archived', None)
                        comments = legacy.setdefault('comments', [])
                        if not any(entry.get('status') == 'rejected' and entry.get('kind') != 'comment'
                                   for entry in comments):
                            comments.append({'at': '', 'status': 'rejected',
                                             'text': 'Earlier rejection recorded for this application.'})
                        comments.append({
                            'at': event['restored_at'], 'status': 'draft',
                            'text': 'Restored from Removed.',
                        })
                    if self.w.database:
                        from .application_queue import check_restored_choice

                        check_restored_choice(s, job_id, was_pending)
            elif event['reason'] != comment:
                event.update({'reason': comment, 'reason_updated_at': now()})
        return {'id': job_id, 'removals': removals}

    def add_job(self, a, *, match_url=False, state=None, source_requisition=None, discovered=False):
        if state is None:
            with self.w.edit() as state:
                return self.add_job(a, match_url=match_url, state=state)
        j = {
            k: text(a.get(k, ""), 40000 if k == "description" else 1000)
            for k in (
                "title",
                "employer",
                "location",
                "description",
                "url",
                "email",
                "closes",
                "posted_at",
                "reposted_at",
                "seniority",
                "work_arrangement",
                "sponsorship",
            )
        }
        if not j["title"] or not j["description"]:
            raise ValueError("Title and job description required")
        if any("\r" in j[k] or "\n" in j[k] for k in ("title", "employer", "email")):
            raise ValueError("Headers must be single lines")
        if j["url"] and not j["url"].startswith("https://"):
            raise ValueError("Job URL must use HTTPS")
        if "careers_url" in a:
            careers_url = text(a["careers_url"], 2000)
            if careers_url:
                try:
                    destination = urlsplit(careers_url)
                    valid = (
                        destination.scheme == "https"
                        and bool(destination.hostname)
                        and destination.username is None
                        and destination.password is None
                        and destination.port != 0
                        and "\\" not in careers_url
                        and not any(character.isspace() for character in careers_url)
                    )
                except ValueError:
                    valid = False
                if not valid:
                    raise ValueError("Company careers URL must be an HTTPS address without credentials")
            j["careers_url"] = careers_url
        j["requirements"] = strings(a.get("requirements", []))
        j["eligibility"] = a.get("eligibility", "unknown")
        if j["eligibility"] not in ("unknown", "confirmed", "conflict"):
            raise ValueError("Invalid eligibility")
        salary = a.get("salary", {})
        j["salary"] = {
            k: text(salary.get(k, ""), 100) for k in ("currency", "period", "basis")
        }
        j["salary"].update({k: number(salary.get(k, 0)) for k in ("min", "max")})
        expectation = a.get("expectation", {})
        j["expectation"] = {
            k: text(expectation.get(k, ""), 2000)
            for k in ("target", "basis", "source", "confidence")
        }
        j.update(
            {
                "id": a.get("id")
                or (digest(j["url"].encode())[:24] if j["url"] else uid()),
                "availability": a.get("availability", "unverified"),
                "source": text(a.get("source", "manual"), 500),
                "checked_at": a.get("checked_at") or now(),
                "prior_application": a.get("prior_application", "none"),
            }
        )
        if a.get("id") and not re.fullmatch(r"[a-f0-9]{24,32}", a["id"]):
            raise ValueError("Invalid job ID")
        existing = next((x for x in state["jobs"] if x["id"] == j["id"]), None)
        if source_requisition:
            verified = next((item for item in state['jobs']
                             if item.get('source_requisition') == source_requisition
                             and item.get('source') == j['source']), None)
            if verified:
                conflict = next((item for item in state['jobs']
                                 if item['id'] != verified['id'] and item.get('url') == j['url']), None)
                if conflict:
                    raise ValueError('The verified posting URL is already assigned to another listing')
                existing = verified
                j['id'] = existing['id']
        if j['url'] and (match_url or not a.get('id')) and not (
            source_requisition and existing and existing.get('source_requisition') == source_requisition
        ):
            # Imports retain a unique existing listing's identity, including
            # migrated IDs. Explicit manual IDs still select one record.
            candidates = [x for x in state['jobs'] if x.get('url') == j['url']]
            if len(candidates) > 1:
                raise ValueError('Multiple jobs share this URL; choose an explicit job ID')
            if candidates:
                existing = candidates[0]
                j['id'] = existing['id']
            elif existing:
                raise ValueError('Job ID conflicts with another URL; choose an explicit job ID')
        # Preserve the user's pending choice independently of listing updates.
        j["saved"] = existing.get("saved", False) is True if existing else False
        if existing:
            if 'removals' in existing:
                j['removals'] = existing['removals']
            if 'requirement_evidence' in existing:
                j['requirement_evidence'] = existing['requirement_evidence']
            if 'careers_url' in existing:
                j.setdefault('careers_url', existing['careers_url'])
            if 'employer_evidence' in existing and existing.get('url') == j['url'] and existing['employer'] == j['employer']:
                j['employer_evidence'] = existing['employer_evidence']
            for key in ('prior_application', 'source', 'checked_at'):
                if key not in a:
                    j[key] = existing.get(key, j[key])
            if 'prior_application' not in a and existing.get('submission_record_token'):
                j['submission_record_token'] = existing['submission_record_token']
            if existing.get('source_requisition'):
                j['source_requisition'] = existing['source_requisition']
            if existing.get('prior_submitted_on') and j['prior_application'] == 'submitted':
                j['prior_submitted_on'] = existing['prior_submitted_on']
            if discovered:
                for field in ('requirements', 'eligibility', 'sponsorship', 'email', 'expectation', 'salary', 'reposted_at'):
                    if field in existing:
                        j[field] = existing[field]
                for field in ('posted_at', 'closes', 'seniority', 'work_arrangement'):
                    if j[field] in ("", "unknown") and existing.get(field):
                        j[field] = existing[field]
                if not source_requisition and existing.get('source_requisition'):
                    j['source'] = existing['source']
        unlisted = state.get('unlisted_removals')
        if unlisted and j['id'] in unlisted:
            j.setdefault('removals', unlisted.pop(j['id']))
        if j['id'] in submitted_job_ids(state):
            j['prior_application'] = 'submitted'
        if self.w.database and a.get('prior_submitted_on') and j['prior_application'] == 'submitted':
            j['prior_submitted_on'] = companies.valid_occurrence(a['prior_submitted_on'], self.workspace_zone())
        if source_requisition:
            j['source_requisition'] = source_requisition
        vacancy_requisition = a.get('vacancy_requisition') if source_requisition else None
        if not vacancy_requisition and existing:
            vacancy_requisition = existing.get('vacancy_requisition')
        if vacancy_requisition:
            j['vacancy_requisition'] = text(vacancy_requisition, 200)
        if discovered and a.get('employer_evidence'):
            j['employer_evidence'] = a['employer_evidence']
        if existing:
            was_pending = self.pending_before_change(state, j['id'])
            state['jobs'][state['jobs'].index(existing)] = j
            if self.w.database:
                from .application_queue import check_restored_choice

                check_restored_choice(state, j['id'], was_pending)
        else:
            state['jobs'].append(j)
        return j

    def refresh(self, id, *, research_name=None, research_evidence=None):
        current = self.w.read()
        src = find(current['sources'], id)
        if companies.source_cooldown(current, id):
            return {'count': 0, 'skipped': 'Company is paused'}
        research_request = research_name is not None
        saved_name = companies.source_research_name(current, src)
        if saved_name and research_request and companies.name_key(saved_name) != companies.name_key(research_name):
            saved_id = companies.research_employer(current, saved_name).get('id')
            requested_id = companies.research_employer(current, research_name).get('id')
            if not saved_id or saved_id != requested_id:
                raise ValueError('Use the verified hiring employer previously recorded for this board')
        if research_request or not companies.source_employer(current, id):
            research_name = research_name or saved_name
        if research_name:
            company = companies.research_employer(current, research_name)
            owner_id = companies.source_employer(current, id)
            if owner_id and owner_id != company.get('id'):
                raise ValueError('The board belongs to a different hiring employer')
            if not company['research_eligible']:
                return {'count': 0, 'skipped': 'Company is paused or its history needs review'}
        try:
            if src['kind'] in ("greenhouse", "lever"):
                jobs = sources.discover(src['kind'], src['board'])
                full_snapshot = True
            else:
                from time import monotonic
                from .discovery_fetch import Fetch

                fetch = Fetch(threading.Event(), monotonic() + 15)
                jobs = fetch.feed(src['kind'], src['board'])
                full_snapshot = src['kind'] in ("ashby", "workable")
                if src['kind'] == "smartrecruiters":
                    jobs = [fetch.enrich(job) for job in jobs[:12]]
            imported, _, skipped = self.import_discovery(
                jobs, source_id=id, full_snapshot=full_snapshot, research_name=research_name,
                expected_research_name=saved_name, save_research_name=research_request and not saved_name,
                research_evidence=research_evidence,
            )
            if skipped:
                return {'count': 0, 'skipped': skipped}
            result = {"count": len(imported)}
            if research_request:
                result["job_ids"] = imported
            return result
        except Exception as e:
            self.degrade_source(id, "failed", type(e).__name__ + "; retry or import manually")
            return {
                "error": "Source retrieval failed; previous results retained with their original timestamps"
            }

    def degrade_source(self, source_id, status, reason):
        with self.w.edit() as state:
            find(state["sources"], source_id).update(status=status, attempted_at=now(), error=reason)

    def import_discovery(self, jobs, *, source_id=None, full_snapshot=False, status="retrieved",
                         observed_jobs=None, deadline=None, research_name=None,
                         expected_research_name=None, save_research_name=False, research_evidence=None):
        if not source_id and not jobs:
            return [], set(), None
        with self.w.edit() as state:
            if deadline is not None:
                sources.remaining(deadline)
            source = find(state["sources"], source_id) if source_id else None
            if source and companies.source_cooldown(state, source_id):
                return [], set(), "Company is paused"
            owner_id = companies.source_employer(state, source_id) if source else None
            owner = companies.by_id(state.get("employers", []), owner_id)
            employer_name = owner["name"] if owner else None
            if source:
                saved_name = companies.source_research_name(state, source)
                if research_name and saved_name != expected_research_name:
                    return [], set(), "The board’s research employer changed. Check it again."
                name = research_name or (saved_name if not owner_id else None)
                if name:
                    company = companies.research_employer(state, name)
                    if not company["research_eligible"] or (owner_id and owner_id != company.get("id")):
                        return [], set(), "Company availability or source ownership changed"
                    owner_id, employer_name = company.get("id"), company["name"]
                if research_evidence:
                    owner = companies.associate_board(state, source, owner_id, employer_name,
                                                      evidence_url=research_evidence)
                    owner_id = owner['id']
            previous_ids = {job["id"] for job in state["jobs"]}
            verified_owners = {link["id"]: link["employer_id"] for link in state.get("employer_links", [])}
            observed = jobs if observed_jobs is None else observed_jobs
            observed_urls = {job.get("url") for job in observed}
            observed_keys = {job["source_requisition"] for job in observed if job.get("source_requisition")}
            seen = set()
            imported = []
            source_key = f'{source["kind"]}:{source["board"]}' if source else None
            board_names = (companies.accepted_board_names(source, owner or {
                'name': employer_name, 'aliases': [],
            }) if source and employer_name else set())
            for job in jobs:
                key = job.get("source_requisition") or job["url"]
                if key in seen:
                    continue
                board_match = (source_key and job.get('source') == source_key
                               and companies.name_key(job.get('employer', '')) in board_names)
                if board_match:
                    job = {**job, "employer": employer_name}
                elif companies.discovery_status(state, job)["cooling"]:
                    continue
                seen.add(key)
                listing = self.add_job(
                    job, match_url=True, state=state, source_requisition=job.get("source_requisition"),
                    discovered=True,
                )
                verified_owner = verified_owners.get(listing["id"])
                if board_match and verified_owner and verified_owner != owner_id:
                    raise ValueError("The board posting is already linked to a different hiring employer")
                if confirmed := companies.by_id(state.get("employers", []), verified_owner):
                    listing["employer"] = confirmed["name"]
                if self.w.database:
                    companies.link_verified_listing(state, listing, self.workspace_zone())
                imported.append(listing)
            ids = {job["id"] for job in imported}
            if source:
                if self.w.database:
                    companies.link_source_jobs(state, source, imported, self.workspace_zone())
                if full_snapshot:
                    for old in state["jobs"]:
                        if (old["source"] == source_key and old["id"] not in ids
                                and old.get("url") not in observed_urls
                                and old.get("source_requisition") not in observed_keys):
                            old["availability"] = "closed"
                checked_at = now()
                if save_research_name:
                    source["research_name"] = employer_name
                source.update(status=status, attempted_at=checked_at, count=len(observed), error=None)
                if status == "retrieved":
                    source["checked_at"] = checked_at
            if deadline is not None:
                sources.remaining(deadline)
            result = list(dict.fromkeys(job["id"] for job in imported)), ids - previous_ids, None
        if self.w.database:
            from . import company_logos

            company_logos.enrich_discovered(self.w, result[0], deadline=deadline)
        return result

    def start(self, a):
        with self.worker_lock:
            if self.worker and self.worker.is_alive():
                raise ValueError("Another run is active")
        s = self.state()
        p = find(s["profiles"], a["profile_id"])
        count = int(a.get("count", 5))
        if not 1 <= count <= 20:
            raise ValueError("Batch limit is 1–20")
        mode = a.get("mode", "local")
        if mode not in ("local", "openai"):
            raise ValueError(
                "Run mode must be local or openai; agents use the handoff contract"
            )
        config = {
            k: a.get(k, "")
            for k in ("model", "input_per_million", "output_per_million")
        }
        budget = number(a.get("budget", 0))
        if mode == "openai":
            providers.require_consent(s, "openai")
            if not a.get("approve_budget") or not budget:
                raise ValueError("Approve a positive run budget first")
            providers.reserve(providers.request_body({}, [], config), config)
        r = {
            "id": uid(),
            "profile": p,
            "count": count,
            "mode": mode,
            "config": config,
            "budget": budget,
            "reserved": 0,
            "status": "paused",
            "cancel": False,
            "done": [],
            "packages": [],
            "errors": [],
            "created_at": now(),
            "queue": None,
            "discover": bool(a.get("discover", True)),
        }
        self.w.snapshot()
        with self.w.edit() as state:
            state["runs"].append(r)
        self.launch(r["id"])
        return r

    def launch(self, id):
        with self.worker_lock:
            if self.worker and self.worker.is_alive():
                raise ValueError("Another run is active")
            self.worker = threading.Thread(target=self.run, args=(id,), daemon=True)
            self.worker.start()

    def update_run(self, id, **values):
        with self.w.edit() as s:
            find(s["runs"], id).update(values)
            if self.w.database and values.get('queue'):
                for job_id in values['queue']:
                    run_progress.item(s, id, job_id, create=True)

    def reserve_provider(self, run_id, job_id, cost):
        with self.w.edit() as state:
            run = find(state['runs'], run_id)
            if run['cancel']:
                run['status'] = 'cancelled'
                return False
            if companies.discovery_status(state, find(state['jobs'], job_id))['cooling']:
                raise ValueError('Company is paused')
            providers.require_consent(state, 'openai')
            if run['reserved'] + cost > run['budget']:
                run.update(status='paused', note='Approved budget exhausted; no request made')
                return False
            run.update(reserved=run['reserved'] + cost, inflight=job_id)
            if self.w.database:
                row = run_progress.item(state, run_id, job_id, create=True)
                run_progress.reserve(row, cost)
            return True

    def save_provider_selection(self, run_id, job_id, ids):
        with self.w.edit() as state:
            find(state['runs'], run_id)['inflight'] = None
            if self.w.database:
                row = run_progress.item(state, run_id, job_id, create=True)
                run_progress.provider_outcome(row, 'selected')
                row['fact_ids'] = ids

    def run(self, id):
        try:
            self.update_run(id, status='running')
            run = find(self.w.read()['runs'], id)
            if run['queue'] is None:
                if run['discover']:
                    for source in self.w.read()['sources']:
                        if find(self.w.read()['runs'], id)['cancel']:
                            self.update_run(id, status='cancelled')
                            return
                        self.refresh(source['id'])
                state = self.w.read()
                already_prepared = {app['job_id'] for app in state['applications']}
                rows = matching.ranked(self.discoverable_jobs(state), run['profile'], state['facts'])
                queue = [
                    row['job']['id'] for row in rows if row['match']['eligible_for_preparation']
                    and row['job']['id'] not in already_prepared
                ]
                self.update_run(id, queue=queue, note='Discovery and ranking complete')
            while True:
                state = self.w.read()
                run = find(state['runs'], id)
                if run['cancel']:
                    self.update_run(id, status='cancelled')
                    return
                remaining = [job_id for job_id in run['queue'] if job_id not in run['done']]
                if len(run['packages']) >= run['count'] or not remaining:
                    self.update_run(id, status='complete', note='No weak matches added to fill the batch')
                    return
                job = find(state['jobs'], remaining[0])
                facts = matching.available(state['facts'])
                assessment = matching.match(job, run['profile'], facts)
                try:
                    if companies.discovery_status(state, job)['cooling']:
                        raise ValueError('Company is paused')
                    if not assessment['eligible_for_preparation']:
                        raise ValueError('Eligibility changed; recheck result')
                    ids = assessment['fact_ids'][:10]
                    if run['mode'] == 'openai':
                        providers.require_consent(state, 'openai')
                        row = run_progress.item(state, id, job['id']) if self.w.database else None
                        if row and row['status'] == 'selected':
                            ids = row['fact_ids']
                        else:
                            body = providers.request_body(job, facts, run['config'])
                            cost = providers.reserve(body, run['config'])
                            if not self.reserve_provider(id, job['id'], cost):
                                return
                            ids = providers.openai_select(body, facts)
                            self.save_provider_selection(id, job['id'], ids)
                        providers.require_consent(self.w.read(), 'openai')
                    self.prepare(job, run['profile'], state['identity'], facts, assessment, ids, run_id=id)
                except Exception as exc:
                    with self.w.edit() as state:
                        current = find(state['runs'], id)
                        if current['cancel'] and not current.get('inflight'):
                            current['status'] = 'cancelled'
                            return
                        error = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
                        if self.w.database:
                            row = run_progress.item(state, id, job['id'], create=True)
                            if current.get('inflight'):
                                run_progress.provider_outcome(row, 'unknown')
                                error = 'Provider outcome uncertain. Request was not retried.'
                            else:
                                row['status'] = 'failed'
                            row['error'] = error
                        current['inflight'] = None
                        current['done'].append(job['id'])
                        current['errors'].append({'job_id': job['id'], 'error': error})
        except Exception:
            self.update_run(id, status='failed', note='Run interrupted by an error; inspect inputs and resume')

    def prepare(self, job, profile, identity, facts, m, ids, *, run_id=None):
        from .application_context import without_branding

        job = without_branding(job)
        m["salary_expectation"] = matching.salary_expectation(job, m)
        ids = providers.selection({"fact_ids": ids}, facts)
        chosen = [find(facts, i) for i in ids]
        current = {f["id"]: f for f in matching.available(self.w.read()["facts"])}
        if any(current.get(f["id"]) != f for f in chosen):
            raise ValueError(
                "Career facts changed during preparation; review and retry"
            )
        config = settings(self.w.path)
        current_master = master.status(self.w)
        if current_master['changed']:
            raise ValueError('Master changed; review and confirm its updates before generating')
        id = uid()
        staging = inside(self.w.path, '.runtime/staging')
        staging.mkdir(parents=True, exist_ok=True)
        with self.w.lock, tempfile.TemporaryDirectory(dir=staging) as temp:
            state = self.w.read()
            if job['id'] in submitted_job_ids(state):
                raise ValueError('This job is already recorded as submitted')
            if run_id:
                if find(state['runs'], run_id)['cancel']:
                    raise ValueError('Preparation run was cancelled')
                if companies.discovery_status(state, find(state['jobs'], job['id']))['cooling']:
                    raise ValueError('Company is paused')
            p = Path(temp) / 'package'
            documents.render(p, identity, job, chosen, m, profile.get('template', 'navy'))
            if config['master_template']:
                master.render(self.w.path, p, job, chosen, matching.available(self.w.read()["facts"]))
            if master.status(self.w) != current_master:
                raise ValueError('Master changed during generation; review and retry')
            files = {name: (p / name).read_bytes() for name in documents.FILES}
            packages.validate(files, config)
            app = {'id': id, 'job_id': job['id'], 'title': job['title'], 'employer': job['employer'],
                   'created_at': now(), 'status': 'draft', 'comments': [], 'fact_ids': ids,
                   'profile_id': profile['id']}
            with self.w.edit() as state:
                self.register_draft(state, app, self.pending_before_change(state, job['id']))
                app.update(packages.publish(self.w.path, files, job, identity))
                if run_id:
                    run = find(state['runs'], run_id)
                    run['done'].append(job['id'])
                    run['packages'].append(app['id'])
                    if self.w.database:
                        row = run_progress.item(state, run_id, job['id'], create=True)
                        row.update(status='prepared', application_id=app['id'])
        return app
