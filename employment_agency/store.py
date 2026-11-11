"""Atomic, process-locked private workspaces and portable recovery."""

from pathlib import Path, PurePosixPath
from contextlib import contextmanager
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
            path.name.endswith('.lock') or any(p in EXCLUDED_DIRS for p in path.parts))


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent)
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


class Workspace:
    def __init__(self, path, *, create=True):
        self.path = Path(path).resolve()
        from .workspaces import config_home, inside
        self.config_path = config_home().expanduser().resolve()
        project = self.path / 'pyproject.toml'
        if project.is_file() and 'name = "employment-agency-local"' in project.read_text():
            raise ValueError('Use the workspace/ subfolder, not the public application source folder')
        state_path = inside(self.path, 'state.json')
        lock_path = inside(self.path, '.lock')
        if create:
            self.path.mkdir(parents=True, exist_ok=True)
        elif not state_path.is_file():
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
            self.open_state(state_path, create)
        except BaseException:
            self.close()
            raise

    def open_state(self, path, create):
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            if not create:
                raise ValueError(f'Workspace state is missing at {self.path}. Choose an existing workspace or use init.') from None
            state = {
                "schema": 2,
                "identity": {},
                "facts": [],
                "profiles": [],
                "jobs": [],
                "sources": [],
                "runs": [],
                "applications": [],
                "consents": {},
                "events": [],
            }
        if not isinstance(state, dict) or state.get("schema") not in (1, 2):
            raise ValueError("Unsupported workspace schema; restore a compatible release. No data changed.")
        self.workspace_id = None
        changed = False
        if state["schema"] == 2:
            if "workspace_id" not in state:
                # A legacy path-only grant cannot establish the identity of these records.
                state["workspace_id"] = uid()
                state["consents"] = {}
                changed = True
            self.workspace_id = state["workspace_id"]
            if not isinstance(self.workspace_id, str) or not re.fullmatch('[a-f0-9]{32}', self.workspace_id):
                raise ValueError("Invalid workspace identity")
        for r in state["runs"]:
            if r["status"] == "running":
                changed = True
                r["status"] = "paused"
                r["note"] = "Interrupted; resume explicitly"
                if r.get("inflight"):
                    r["done"].append(r["inflight"])
                    r["errors"].append(
                        {
                            "job_id": r["inflight"],
                            "error": "Interrupted paid request; billing uncertain. Not retried on resume.",
                        }
                    )
                    r["inflight"] = None
        if changed:
            atomic(path, encode(state))
        if state["schema"] == 2:
            from .packages import restore_recovery
            restore_recovery(self.path, state['applications'])

    def close(self):
        if not self.handle.closed:
            self.handle.close()

    def permissions_path(self):
        key = digest(encode([str(self.path), self.workspace_id]))
        return self.config_path / 'permissions' / (key + '.json')

    def read(self):
        with self.lock:
            state = json.loads((self.path / "state.json").read_text(encoding="utf-8"))
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
            s = self.read()
            previous_permissions = encode(s.get('consents', {}))
            yield s
            if s.get('schema') == 2:
                if s.get('workspace_id') != self.workspace_id:
                    raise ValueError('Workspace identity cannot be edited')
                permissions = encode(s.pop('consents', {}))
                s['consents'] = {}
                atomic(self.path / 'state.json', encode(s))
                if permissions != previous_permissions:
                    atomic(self.permissions_path(), permissions)
            else:
                atomic(self.path / 'state.json', encode(s))

    def backup_files(self):
        from .workspaces import inside, settings
        config = settings(self.path)
        paths = {*EXPORT_DIRS, 'tasks', 'workspace.json', 'workspace.lock.json',
                 config['master'], *config['backup_paths']}
        paths.update(path.name for path in self.path.glob('*.md') if path.is_file())
        nested_config = self.config_path != self.path and self.config_path.is_relative_to(self.path)

        def allowed(path):
            relative = path.relative_to(self.path)
            return (relative.as_posix() not in ('state.json', ARCHIVE_MANIFEST)
                    and not excluded(relative)
                    and not any(part.startswith('.') and part != '.recovery' for part in relative.parts)
                    and not (self.config_path == self.path and relative.parts[0] in ('permissions', 'location.json'))
                    and not (nested_config and path.is_relative_to(self.config_path)))

        def visit(source):
            if not allowed(source):
                return
            source = inside(self.path, source.relative_to(self.path).as_posix())
            if source.is_file():
                yield source
            elif source.is_dir():
                for child in source.iterdir():
                    yield from visit(child)

        for name in sorted(paths):
            yield from visit(self.path / name)

    def export(self, target):
        target = Path(target)
        if target.exists():
            raise ValueError("Export destination exists")
        with self.lock:
            files = {path.relative_to(self.path).as_posix(): path for path in self.backup_files()}
            state = self.read()
            state["consents"] = {}
            raw = encode(state)
            validate_archive_entries([(ARCHIVE_MANIFEST, 0), ('state.json', len(raw)),
                                      *((name, path.stat().st_size) for name, path in files.items())])
            data = {'state.json': raw, **{name: path.read_bytes() for name, path in files.items()}}
            manifest = encode({name: digest(body) for name, body in data.items()})
            validate_archive_entries([(ARCHIVE_MANIFEST, len(manifest)),
                                      *((name, len(body)) for name, body in data.items())])
            target.parent.mkdir(parents=True, exist_ok=True)
            out = target.open("xb")
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


def restore(archive, destination, *, reset_permissions=True):
    dest = Path(destination)
    if dest.exists():
        raise ValueError("Restore requires a new destination")
    with zipfile.ZipFile(archive) as z:
        names = validate_archive_entries((info.filename, info.file_size) for info in z.infolist())
        checks = json.loads(z.read(ARCHIVE_MANIFEST))
        data = {n: z.read(n) for n in names if n != ARCHIVE_MANIFEST}
        if checks != {n: digest(b) for n, b in data.items()}:
            raise ValueError("Checksum mismatch")
        s = json.loads(data["state.json"])
        if s.get("schema") not in (1, 2):
            raise ValueError("Unsupported schema")
        s["consents"] = {}
        if reset_permissions and s["schema"] == 2:
            s["workspace_id"] = uid()
        data["state.json"] = encode(s)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest.parent) as tmp:
        stage = Path(tmp) / "workspace"
        stage.mkdir()
        for n, b in data.items():
            atomic(stage / n, b)
        os.rename(stage, dest)
