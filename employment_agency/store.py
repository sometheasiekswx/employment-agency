"""Atomic, process-locked private workspaces and portable recovery."""

from pathlib import Path, PurePosixPath
from contextlib import contextmanager
import hashlib
import json
import os
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


class Workspace:
    def __init__(self, path):
        self.path = Path(path).resolve()
        project = self.path / 'pyproject.toml'
        if project.is_file() and 'name = "employment-agency-local"' in project.read_text():
            raise ValueError('Use the workspace/ subfolder, not the public application source folder')
        self.path.mkdir(parents=True, exist_ok=True)
        from .workspaces import inside
        for name in ('state.json', '.lock'):
            inside(self.path, name)
        self.lock = threading.RLock()
        # Kernel advisory lock is released on crash; no stale lock deletion race.
        self.handle = (self.path / ".lock").open("a+b")
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
        f = self.path / "state.json"
        if not f.exists():
            if self.permissions_path().exists():
                atomic(self.permissions_path(), encode({}))
            atomic(
                f,
                encode(
                    {
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
                ),
            )
        state = self.read()
        if state.get("schema") not in (1, 2):
            self.close()
            raise ValueError(
                "Unsupported workspace schema; restore a compatible release. No data changed."
            )
        with self.edit() as s:
            for r in s["runs"]:
                if r["status"] == "running":
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

    def close(self):
        if not self.handle.closed:
            self.handle.close()

    def permissions_path(self):
        from .workspaces import config_home
        return config_home() / 'permissions' / (digest(str(self.path).encode()) + '.json')

    def read(self):
        with self.lock:
            state = json.loads((self.path / "state.json").read_text(encoding="utf-8"))
            if state.get('schema') == 2:
                try:
                    state['consents'] = json.loads(self.permissions_path().read_text())
                except FileNotFoundError:
                    state['consents'] = {}
            return state

    @contextmanager
    def edit(self):
        with self.lock:
            s = self.read()
            yield s
            if s.get('schema') == 2:
                permissions = s.pop('consents', {})
                s['consents'] = {}
                atomic(self.path / 'state.json', encode(s))
                atomic(self.permissions_path(), encode(permissions))
            else:
                atomic(self.path / 'state.json', encode(s))

    def export(self, target):
        target = Path(target)
        if target.exists():
            raise ValueError("Export destination exists")
        with self.lock:
            data = {"state.json": encode(self.read())}
            from .workspaces import inside
            for p in self.path.rglob('*'):
                rel = p.relative_to(self.path)
                if excluded(rel):
                    continue
                inside(self.path, rel.as_posix())
                if not p.is_file():
                    continue
                if rel.as_posix() != 'state.json':
                    data[rel.as_posix()] = p.read_bytes()
            # Consent must be regranted after restore; it is not transferable authority.
            state = json.loads(data["state.json"])
            state["consents"] = {}
            data["state.json"] = encode(state)
            target.parent.mkdir(parents=True, exist_ok=True)
            with (
                target.open("xb") as out,
                zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z,
            ):
                for name, body in data.items():
                    z.writestr(name, body)
                z.writestr(
                    "checksums.json", encode({n: digest(b) for n, b in data.items()})
                )
        return target

    def snapshot(self):
        return self.export(self.path / ".runtime/snapshots" / (uid() + ".zip"))


def restore(archive, destination, *, reset_permissions=True):
    dest = Path(destination)
    if dest.exists():
        raise ValueError("Restore requires a new destination")
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > 100000 or sum(i.file_size for i in infos) > 1024 * 1024 * 1024:
            raise ValueError("Archive too large")
        names = [i.filename for i in infos]
        if len(names) != len({PurePosixPath(n).as_posix().casefold() for n in names}):
            raise ValueError("Duplicate archive paths")
        for n in names:
            p = PurePosixPath(n)
            if (
                "\\" in n
                or ":" in n
                or p.is_absolute()
                or ".." in p.parts
                or not p.parts
                or p.as_posix() != n
                or excluded(Path(n))
            ):
                raise ValueError("Unsafe archive path")
        checks = json.loads(z.read("checksums.json"))
        data = {n: z.read(n) for n in names if n != "checksums.json"}
        if checks != {n: digest(b) for n, b in data.items()}:
            raise ValueError("Checksum mismatch")
        s = json.loads(data["state.json"])
        if s.get("schema") not in (1, 2):
            raise ValueError("Unsupported schema")
        s["consents"] = {}
        data["state.json"] = encode(s)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest.parent) as tmp:
        stage = Path(tmp) / "workspace"
        stage.mkdir()
        for n, b in data.items():
            atomic(stage / n, b)
        os.rename(stage, dest)
    if reset_permissions:
        from .workspaces import config_home
        atomic(config_home() / 'permissions' / (digest(str(dest.resolve()).encode()) + '.json'), encode({}))
