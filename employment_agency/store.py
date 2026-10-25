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
        self.path.mkdir(parents=True, exist_ok=True)
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
            atomic(
                f,
                encode(
                    {
                        "schema": 1,
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
        if state.get("schema") != 1:
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
        self.handle.close()

    def read(self):
        with self.lock:
            return json.loads((self.path / "state.json").read_text(encoding="utf-8"))

    @contextmanager
    def edit(self):
        with self.lock:
            s = self.read()
            yield s
            atomic(self.path / "state.json", encode(s))

    def export(self, target):
        target = Path(target)
        if target.exists():
            raise ValueError("Export destination exists")
        with self.lock:
            data = {"state.json": encode(self.read())}
            for base in ("packages", "imports"):
                for p in (
                    (self.path / base).rglob("*") if (self.path / base).exists() else []
                ):
                    if p.is_symlink():
                        raise ValueError("Symlinks are not exportable")
                    if p.is_file():
                        data[p.relative_to(self.path).as_posix()] = p.read_bytes()
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
        return self.export(self.path / "snapshots" / (uid() + ".zip"))


def restore(archive, destination):
    dest = Path(destination)
    if dest.exists():
        raise ValueError("Restore requires a new destination")
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > 20000 or sum(i.file_size for i in infos) > 512 * 1024 * 1024:
            raise ValueError("Archive too large")
        names = [i.filename for i in infos]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive paths")
        for n in names:
            p = PurePosixPath(n)
            if (
                "\\" in n
                or ":" in n
                or p.is_absolute()
                or ".." in p.parts
                or n not in ("state.json", "checksums.json")
                and p.parts[0] not in ("packages", "imports")
            ):
                raise ValueError("Unsafe archive path")
        checks = json.loads(z.read("checksums.json"))
        data = {n: z.read(n) for n in names if n != "checksums.json"}
        if checks != {n: digest(b) for n, b in data.items()}:
            raise ValueError("Checksum mismatch")
        s = json.loads(data["state.json"])
        if s.get("schema") != 1:
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
