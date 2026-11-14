"""Atomic, process-locked private workspaces and portable recovery."""

from pathlib import Path, PurePosixPath
from contextlib import contextmanager, nullcontext
import hashlib
import json
import os
import re
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timezone


EXPORT_DIRS = ('applications', 'imports', 'master', 'templates', 'research',
               'jobs', 'profiles', 'records', 'resumes', 'decisions', 'docs',
               '.recovery', 'packages')


EXCLUDED_DIRS = {'.git', '.github', '.local', '.runtime', '.venv', 'node_modules',
                 '__pycache__', '.cache', '.build', 'graphify-out', 'output'}
ARCHIVE_MANIFEST = 'checksums.json'


def excluded(path):
    return (any(p.startswith(('.env', 'credentials', 'secrets')) for p in path.parts) or
            path.suffix in ('.key', '.pem', '.py', '.pyc', '.js', '.mjs', '.cjs', '.sh', '.db', '.sqlite', '.zip', '.tar', '.gz') or
            path.name.endswith('.lock') or path.name.startswith('workspace.sqlite3')
            or any(p in EXCLUDED_DIRS for p in path.parts))


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def atomic(path, data, *, staging=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if staging is not None:
        staging.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=staging or path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def validate_archive_entries(entries):
    entries = list(entries)
    if len(entries) > 100000 or sum(size for _, size in entries) > 1024 * 1024 * 1024:
        raise ValueError("Archive too large")
    names = [name for name, _ in entries]
    if len(names) != len({PurePosixPath(name).as_posix().casefold() for name in names}):
        raise ValueError("Duplicate archive paths")
    for name in names:
        path = PurePosixPath(name)
        if (
            "\\" in name
            or ":" in name
            or path.is_absolute()
            or ".." in path.parts
            or not path.parts
            or path.as_posix() != name
            or excluded(Path(name))
        ):
            raise ValueError("Unsafe archive path")
    return names


def initial_state():
    return {
        'schema': 2, 'workspace_id': uid(), 'identity': {}, 'facts': [],
        'profiles': [], 'jobs': [], 'sources': [], 'runs': [], 'applications': [],
        'consents': {}, 'events': [],
    }


def workspace_files(root, *, sqlite=False, config_path=None):
    from .workspaces import config_home, inside, settings
    config_path = config_path or config_home().expanduser().resolve()
    config = settings(root)
    paths = {*EXPORT_DIRS, 'tasks', 'workspace.json', 'workspace.lock.json',
             config['master'], *config['backup_paths']}
    paths.update(path.name for path in root.glob('*.md') if path.is_file())
    nested_config = config_path != root and config_path.is_relative_to(root)

    def allowed(path):
        relative = path.relative_to(root)
        return (relative.as_posix() not in ('state.json', ARCHIVE_MANIFEST)
                and (not sqlite or relative.parts[0] != 'state')
                and not excluded(relative)
                and not any(part.startswith('.') and part != '.recovery' for part in relative.parts)
                and not (config_path == root and relative.parts[0] in ('permissions', 'location.json'))
                and not (nested_config and path.is_relative_to(config_path)))

    def visit(source):
        if not allowed(source):
            return
        source = inside(root, source.relative_to(root).as_posix())
        if source.is_file():
            yield source
        elif source.is_dir():
            for child in source.iterdir():
                yield from visit(child)

    for name in sorted(paths):
        yield from visit(root / name)


class Workspace:
    def __init__(self, path, *, create=True, sqlite=False, recover=True):
        self.path = Path(path).resolve()
        self.database = None
        from .workspaces import config_home, inside
        self.config_path = config_home().expanduser().resolve()
        project = self.path / 'pyproject.toml'
        if project.is_file() and 'name = "employment-agency-local"' in project.read_text():
            raise ValueError('Use the workspace/ subfolder, not the public application source folder')
        state_path = inside(self.path, 'state.json')
        lock_path = inside(self.path, '.lock')
        if create:
            self.path.mkdir(parents=True, exist_ok=True)
        elif not state_path.is_file() and not inside(self.path, 'workspace.sqlite3').is_file():
            raise ValueError(f'Workspace state is missing at {self.path}. Choose an existing workspace or use init.')
        self.lock = threading.RLock()
        # Kernel advisory lock is released on crash; no stale lock deletion race.
        self.handle = lock_path.open("a+b")
        try:
            if os.name == "nt":
                import msvcrt

                self.handle.seek(0)
                self.handle.write(b"0")
                self.handle.flush()
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.handle.close()
            raise ValueError("Workspace is already open in another process")
        try:
            self.open_state(state_path, create, sqlite=sqlite, recover=recover)
        except BaseException:
            self.close()
            raise

    def open_state(self, path, create, *, sqlite=False, recover=True):
        from .sqlite_workspace import DATABASE, SQLiteState, ensure_git_rules, is_sqlite
        from .workspaces import inside

        if inside(self.path, DATABASE).exists():
            self.database = SQLiteState(self.path)
            state = self.database.read()
        elif path.exists():
            state = json.loads(path.read_bytes())
            if is_sqlite(state):
                raise ValueError('Workspace database is missing. Restore a verified backup or Git snapshot.')
        elif create:
            state = initial_state()
            if sqlite:
                ensure_git_rules(self.path)
                self.database = SQLiteState(self.path, create=True)
                self.database.initialize(state)
            else:
                atomic(path, encode(state))
        else:
            raise ValueError(f'Workspace state is missing at {self.path}. Restore a verified workspace.')
        if not isinstance(state, dict) or state.get('schema') not in (1, 2):
            raise ValueError('Unsupported workspace schema; restore a compatible release. No data changed.')
        self.workspace_id = state.get('workspace_id')
        changed = False
        if state['schema'] == 2:
            if self.workspace_id is None and not self.database and recover:
                self.workspace_id = state['workspace_id'] = uid()
                state['consents'] = {}
                changed = True
            if self.workspace_id is not None and (
                not isinstance(self.workspace_id, str) or not re.fullmatch('[a-f0-9]{32}', self.workspace_id)
            ):
                raise ValueError('Invalid workspace identity')
        if not recover:
            return
        if self.database:
            self.database.publish(verify=True)
        for r in state["runs"]:
            if r["status"] == "running":
                changed = True
                r["status"] = "paused"
                r["note"] = "Interrupted; resume explicitly"
                if r.get("inflight"):
                    if self.database:
                        from .run_progress import interrupt
                        interrupt(state, r['id'], r['inflight'])
                    r["done"].append(r["inflight"])
                    r["errors"].append(
                        {
                            "job_id": r["inflight"],
                            "error": "Interrupted paid request; billing uncertain. Not retried on resume.",
                        }
                    )
                    r["inflight"] = None
        if changed:
            if self.database:
                with self.database.transaction():
                    self.database.save(state)
                self.database.publish()
            else:
                atomic(path, encode(state))
        if state["schema"] == 2:
            from .packages import restore_recovery
            restore_recovery(self.path, state['applications'])

    def close(self):
        if not self.handle.closed:
            if self.database:
                self.database.close()
            self.handle.close()

    def permissions_path(self):
        key = digest(encode([str(self.path), self.workspace_id]))
        return self.config_path / 'permissions' / (key + '.json')

    def read(self):
        with self.lock:
            state = (self.database.read() if self.database else
                     json.loads((self.path / "state.json").read_text(encoding="utf-8")))
            if state.get('schema') == 2:
                if state.get('workspace_id') != self.workspace_id:
                    raise ValueError('Workspace identity changed on disk. Reopen the workspace.')
                try:
                    state['consents'] = json.loads(self.permissions_path().read_text())
                except FileNotFoundError:
                    state['consents'] = {}
            return state

    @contextmanager
    def edit(self):
        with self.lock:
            with self.database.transaction() if self.database else nullcontext():
                state = self.read()
                previous_permissions = encode(state.get('consents', {}))
                yield state
                permissions = encode(state.get('consents', {}))
                if state.get('schema') == 2:
                    if state.get('workspace_id') != self.workspace_id:
                        raise ValueError('Workspace identity cannot be edited')
                    state['consents'] = {}
                if self.database:
                    from .companies import update_rounds
                    from .workspaces import settings, time_zone
                    update_rounds(state, time_zone(settings(self.path)['timezone']))
                    self.database.save(state)
                else:
                    atomic(self.path / 'state.json', encode(state))
            if state.get('schema') == 2 and permissions != previous_permissions:
                atomic(self.permissions_path(), permissions)
            if self.database:
                self.database.publish()

    def backup_files(self):
        return workspace_files(self.path, sqlite=bool(self.database), config_path=self.config_path)

    def export(self, target):
        target = Path(target)
        if target.exists():
            raise ValueError("Export destination exists")
        with self.lock:
            files = {path.relative_to(self.path).as_posix(): path for path in self.backup_files()}
            state = self.read()
            state["consents"] = {}
            raw = encode({'schema': 3, 'storage': 'sqlite', 'state': state} if self.database else state)
            validate_archive_entries([(ARCHIVE_MANIFEST, 0), ('state.json', len(raw)),
                                      *((name, path.stat().st_size) for name, path in files.items())])
            data = {'state.json': raw, **{name: path.read_bytes() for name, path in files.items()}}
            manifest = encode({name: digest(body) for name, body in data.items()})
            validate_archive_entries([(ARCHIVE_MANIFEST, len(manifest)),
                                      *((name, len(body)) for name, body in data.items())])
            target.parent.mkdir(parents=True, exist_ok=True)
            out = os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb')
            try:
                with out, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
                    for name, body in data.items():
                        archive.writestr(name, body)
                    archive.writestr(ARCHIVE_MANIFEST, manifest)
            except BaseException:
                target.unlink(missing_ok=True)
                raise
        return target

    def snapshot(self):
        return self.export(self.path / ".runtime/snapshots" / (uid() + ".zip"))


def restore(archive, destination, *, reset_permissions=True, sqlite=False):
    from .sqlite_workspace import is_sqlite
    dest = Path(destination)
    if dest.exists():
        raise ValueError("Restore requires a new destination")
    with zipfile.ZipFile(archive) as z:
        names = validate_archive_entries((info.filename, info.file_size) for info in z.infolist())
        checks = json.loads(z.read(ARCHIVE_MANIFEST))
        data = {n: z.read(n) for n in names if n != ARCHIVE_MANIFEST}
        if checks != {n: digest(b) for n, b in data.items()}:
            raise ValueError("Checksum mismatch")
        portable = json.loads(data.pop('state.json'))
        sqlite_archive = is_sqlite(portable)
        if sqlite_archive:
            if not reset_permissions:
                raise ValueError('This workspace backup requires the local SQLite application')
            sqlite = True
            portable = portable.get('state')
        if not isinstance(portable, dict) or portable.get('schema') not in (1, 2):
            raise ValueError('Unsupported workspace backup format')
        portable['consents'] = {}
        if sqlite or (reset_permissions and portable['schema'] == 2):
            portable['workspace_id'] = uid()
        if sqlite:
            validate_state(portable)
            portable['schema'] = 2
            if any(PurePosixPath(name).parts[0] == 'state' for name in data):
                raise ValueError('Backup contains conflicting Git snapshot files')
        else:
            data['state.json'] = encode(portable)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest.parent) as tmp:
        stage = Path(tmp) / 'workspace'
        stage.mkdir()
        for name, body in data.items():
            atomic(stage / name, body)
        if sqlite:
            if not sqlite_archive:
                from .service import submission_records
                portable['submission_attempts'] = submission_records(stage)
            initialize_sqlite(stage, portable)
        os.rename(stage, dest)


def validate_state(state):
    required = ('facts', 'profiles', 'jobs', 'sources', 'runs', 'applications', 'events')
    if any(not isinstance(state.get(key), list) for key in required) or not isinstance(state.get('identity'), dict):
        raise ValueError('Workspace backup is missing required records')
    for collection in ('agent_intents', 'application_answers', 'application_destinations', 'agent_runs'):
        entries = state.get(collection, [])
        if not isinstance(entries, list) or any(not isinstance(entry, dict) or not isinstance(entry.get('id'), str)
                                               or not entry['id'] for entry in entries):
            raise ValueError('Invalid application journey records in the workspace backup')
        if len(entries) != len({entry['id'] for entry in entries}):
            raise ValueError('Duplicate application journey records in the workspace backup')
    if any(type(entry.get('marked')) is not bool or not isinstance(entry.get('updated_at'), str)
           for entry in state.get('agent_intents', [])):
        raise ValueError('Invalid agent intention in the workspace backup')


def initialize_sqlite(root, state):
    from .companies import update_rounds
    from .sqlite_workspace import SQLiteState, ensure_git_rules, read_snapshot
    from .workspaces import settings, time_zone

    validate_state(state)
    update_rounds(state, time_zone(settings(root)['timezone']))
    database = SQLiteState(root, create=True)
    try:
        database.initialize(state)
        ensure_git_rules(root)
        expected = {**state, 'consents': {}}
        if database.read() != expected or read_snapshot(root) != expected:
            raise ValueError('The converted records did not pass workspace verification')
        if database.connection.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('The converted workspace contains invalid database references')
    finally:
        database.close()


def migrate_sqlite(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.is_relative_to(source):
        raise ValueError('Choose a new folder outside the source workspace')
    workspace = Workspace(source, create=False, recover=False)
    try:
        if workspace.database:
            raise ValueError('This workspace already uses SQLite')
        with tempfile.TemporaryDirectory() as temp:
            backup = workspace.export(Path(temp) / 'before-upgrade.zip')
            restore(backup, destination, sqlite=True)
    finally:
        workspace.close()


def restore_snapshot(source, destination):
    from .sqlite_workspace import read_snapshot

    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists() or destination.is_relative_to(source):
        raise ValueError('Choose a new folder outside the source workspace')
    state = read_snapshot(source)
    state['workspace_id'] = uid()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        stage = Path(temp) / 'workspace'
        stage.mkdir()
        # Reuse the normal backup allowlist without opening a workspace whose
        # live database is deliberately absent in a Git clone.
        for path in workspace_files(source, sqlite=True):
            atomic(stage / path.relative_to(source), path.read_bytes())
        initialize_sqlite(stage, state)
        os.rename(stage, destination)
