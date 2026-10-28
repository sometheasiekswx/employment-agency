"""Hosted-only boundary. No credentials or private workspace paths reach the client."""
import io
import json
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from contextlib import contextmanager, nullcontext
from .store import Workspace, restore, uid
from .service import Service, find
from .workspaces import configure
from . import packages

MAX_SNAPSHOT = 3 * 1024 * 1024
MAX_EXPANDED = 30 * 1024 * 1024
ACTIONS = {'identity', 'import', 'fact', 'confirm', 'retire', 'profile', 'job', 'url', 'source',
           'discover', 'rank', 'local-package', 'review', 'master-propose', 'master-accept'}


class CloudError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def config():
    values = {k: os.environ.get(k, '') for k in ('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'EA_ALLOWED_EMAILS', 'EA_PUBLIC_ORIGIN')}
    if not all(values.values()):
        raise CloudError('Hosted pilot is awaiting provider configuration.', 503)
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', values['SUPABASE_URL']):
        raise CloudError('Invalid provider configuration.', 503)
    return values


class Supabase:
    def __init__(self, cfg):
        self.cfg = cfg

    def request(self, path, method='GET', data=None, token=None, binary=False):
        key = self.cfg['SUPABASE_SERVICE_ROLE_KEY']
        body = data if isinstance(data, bytes) else (json.dumps(data).encode() if data is not None else None)
        headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key),
                   'Content-Type': 'application/zip' if isinstance(data, bytes) else 'application/json',
                   'Prefer': 'return=representation'}
        try:
            with urlopen(Request(self.cfg['SUPABASE_URL'] + path, data=body, method=method, headers=headers), timeout=20) as response:
                raw = response.read(MAX_SNAPSHOT + 1)
            if len(raw) > MAX_SNAPSHOT:
                raise CloudError('Provider response exceeds pilot limit.', 413)
            return raw if binary else (json.loads(raw) if raw else None)
        except (HTTPError, URLError, TimeoutError) as exc:
            # Never return provider bodies: they can include identifiers or credentials.
            raise CloudError('Provider request failed; retry or contact the pilot operator.', 502) from exc

    def authenticate(self, bearer):
        if not bearer.startswith('Bearer ') or len(bearer) > 10000:
            raise CloudError('Sign in with Google.', 401)
        try:
            user = self.request('/auth/v1/user', token=bearer[7:])
        except CloudError as exc:
            raise CloudError('Session expired. Sign in again.', 401) from exc
        allowed = {v.strip().lower() for v in self.cfg['EA_ALLOWED_EMAILS'].split(',') if v.strip()}
        providers = user.get('app_metadata', {}).get('providers', [])
        if not user.get('email_confirmed_at') or 'google' not in providers or user.get('email', '').lower() not in allowed:
            raise CloudError('This invite-only pilot is not available to this account.', 403)
        try:
            return str(uuid.UUID(user['id']))
        except (KeyError, ValueError):
            raise CloudError('Invalid account identity.', 401)

    def record(self, owner):
        rows = self.request('/rest/v1/career_workspaces?owner=eq.' + owner)
        return rows[0] if rows else {'revision': 0, 'object_key': None, 'deleting': False}

    def download(self, owner, key):
        if not re.fullmatch(re.escape(owner) + r'/[a-f0-9]{32}\.zip', key):
            raise CloudError('Snapshot owner mismatch.', 403)
        return self.request('/storage/v1/object/career-private/' + key, binary=True)

    def commit(self, owner, revision, body):
        if len(body) > MAX_SNAPSHOT:
            raise CloudError('Pilot workspace exceeds 3 MB compressed. Export your data and use the local app.', 413)
        key = owner + '/' + uid() + '.zip'
        self.request('/storage/v1/object/career-private/' + key, 'POST', body)
        try:
            return self.request('/rest/v1/rpc/commit_career_workspace', 'POST',
                                {'who': owner, 'expected': revision, 'object_name': key, 'size_bytes': len(body)})
        except CloudError:
            # An ambiguous network outcome may have committed. Never delete a possible current snapshot.
            current = self.record(owner)
            if current.get('object_key') == key:
                return current['revision']
            self.request('/storage/v1/object/career-private', 'DELETE', {'prefixes': [key]})
            raise CloudError('Workspace changed in another tab or reached its pilot quota. Reload before retrying.', 409)

    @contextmanager
    def mutation_guard(self, owner):
        # Storage INSERT is exclusive (no x-upsert). Never steal a stale lock:
        # an operator must confirm the owning invocation ended before recovery.
        key = owner + '/operation-lock.zip'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w'):
            pass
        try:
            self.request('/storage/v1/object/career-private/' + key, 'POST', buffer.getvalue())
        except CloudError as exc:
            raise CloudError('Another save or deletion may be in progress. Retry later; contact the operator if it persists.', 409) from exc
        try:
            # A request may have authenticated just before another request deleted
            # its account. Recheck after acquiring the exclusive lock.
            user = self.request('/auth/v1/admin/users/' + owner)
            if user.get('id') != owner:
                raise CloudError('Account no longer available.', 401)
            yield
        finally:
            self.request('/storage/v1/object/career-private', 'DELETE', {'prefixes': [key]})

    def delete(self, owner):
        # Block future commits before deleting objects. Retrying completes interrupted deletion.
        rows = self.request('/rest/v1/career_workspaces?owner=eq.' + owner)
        if not rows:
            self.request('/rest/v1/career_workspaces', 'POST', {'owner': owner, 'deleting': True})
        else:
            self.request('/rest/v1/career_workspaces?owner=eq.' + owner, 'PATCH', {'deleting': True})
        while True:
            items = self.request('/storage/v1/object/list/career-private', 'POST', {'prefix': owner, 'limit': 100, 'offset': 0})
            if not items:
                break
            names = [owner + '/' + x['name'] for x in items if x['name'] != 'operation-lock.zip']
            if not names:
                break
            self.request('/storage/v1/object/career-private', 'DELETE', {'prefixes': names})
        self.request('/auth/v1/admin/users/' + owner, 'DELETE')


class CloudWorkspace(Workspace):
    def permissions_path(self):
        return self.path / '.runtime/permissions.json'


def validate_archive(body):
    if len(body) > MAX_SNAPSHOT:
        raise CloudError('Snapshot too large.', 413)
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        if len(z.infolist()) > 5000 or sum(i.file_size for i in z.infolist()) > MAX_EXPANDED:
            raise CloudError('Expanded snapshot exceeds pilot limit.', 413)


def execute(backend, owner, action, args):
    read_only = action in {'state', 'file', 'export', 'rank', 'master-propose'}
    guard = nullcontext() if read_only else backend.mutation_guard(owner)
    with guard:
        return _execute(backend, owner, action, args)


def _execute(backend, owner, action, args):
    if not isinstance(args, dict):
        raise CloudError('Expected an object.')
    if action not in ACTIONS | {'state', 'file', 'export', 'delete-account', 'workspace-settings'}:
        raise CloudError('This operation is available only in the local app.', 403)
    if action == 'delete-account':
        if args.get('confirmation') != 'DELETE':
            raise CloudError('Type DELETE to confirm account and data deletion.')
        backend.delete(owner)
        return {'deleted': True}
    record = backend.record(owner)
    if record.get('deleting'):
        raise CloudError('Account deletion is in progress. Retry deletion to complete it.', 409)
    with tempfile.TemporaryDirectory(prefix='ea-cloud-') as directory:
        root = Path(directory)
        path = root / 'workspace'
        if record.get('object_key'):
            body = backend.download(owner, record['object_key'])
            validate_archive(body)
            archive = root / 'restore.zip'
            archive.write_bytes(body)
            restore(archive, path, reset_permissions=False)
        w = CloudWorkspace(path)
        try:
            # Cloud cannot execute TeX, use machine paths or carry transferred AI consent.
            configure(path, {'master_template': False, 'setup_complete': True})
            service = Service(w)
            if action == 'state':
                state = service.state()
                state['_hosted'] = True
                state['_workspace']['path'] = 'Private cloud workspace'
                state['_workspace']['master_template'] = False
                state['consents'] = {}
                return {'state': state, 'token': ''}
            if action == 'file':
                app = find(w.read()['applications'], args.get('id'))
                f = packages.path_for(path, app, args.get('name', ''))
                return {'binary': f.read_bytes(), 'filename': f.name}
            if action == 'export':
                target = root / 'export.zip'
                w.export(target)
                return {'binary': target.read_bytes(), 'filename': 'career-workspace.zip'}
            if action == 'workspace-settings':
                if set(args) - {'label', 'timezone', 'preferred_locations'}:
                    raise CloudError('Local workspace settings are unavailable in the hosted app.')
                result = configure(path, args)
            else:
                if action == 'import' and len(args.get('data', '')) > 2800000:
                    raise CloudError('Pilot imports are limited to 2 MB.', 413)
                result = service.action(action, args)
                if action in {'rank', 'master-propose'}:
                    return {'result': result}
            state = w.read()
            if len(state['facts']) > 500 or len(state['jobs']) > 300 or len(state['applications']) > 25:
                raise CloudError('Pilot limit reached (500 facts, 300 jobs, 25 packages). Export to continue locally.', 413)
            target = root / 'commit.zip'
            w.export(target)
            validate_archive(target.read_bytes())
            backend.commit(owner, record['revision'], target.read_bytes())
            return {'result': result}
        finally:
            w.close()
