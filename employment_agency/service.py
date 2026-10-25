"""Shared UI/CLI operations. Mutations are validated and runs are resumable."""

import base64
import re
import threading
import shutil
import math
from pathlib import Path
from .store import now, uid, digest, atomic
from . import imports, sources, matching, documents, providers


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

    def state(self):
        return self.w.read()

    def action(self, action, a):
        if not isinstance(a, dict):
            raise ValueError("Expected JSON object")
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
            atomic(self.w.path / "imports" / (id + ".txt"), body.encode())
            lines = [x.strip(" \t•-") for x in body.splitlines() if x.strip()]
            with self.w.edit() as s:
                for line in lines[:500]:
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
        if action in ("fact", "confirm", "retire"):
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
                    else:
                        f["retired"] = True
                        f["confirmed"] = False
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
        if action == "url":
            return self.add_job(sources.url_job(text(a["url"], 2000)))
        if action == "source":
            kind = a["kind"]
            board = text(a["board"], 100)
            if kind not in ("greenhouse", "lever") or not re.fullmatch(
                r"[A-Za-z0-9_-]+", board
            ):
                raise ValueError("Invalid source")
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
            s = self.state()
            return matching.ranked(
                s["jobs"], find(s["profiles"], a["profile_id"]), s["facts"]
            )
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
        if action == "review":
            with self.w.edit() as s:
                app = find(s["applications"], a["id"])
                status = a.get("status", app["status"])
                if status not in ("draft", "reviewed", "rejected", "submitted"):
                    raise ValueError("Unknown review status")
                if app["status"] == "submitted" and status != "submitted":
                    raise ValueError("Submitted snapshot is immutable")
                if status in ("reviewed", "submitted") and not documents.intact(
                    self.w.path / "packages" / app["id"]
                ):
                    raise ValueError("Files changed; cannot approve")
                if status == "submitted" and app["status"] != "reviewed":
                    raise ValueError("Review before recording manual submission")
                app["status"] = status
                app["comments"].append(
                    {
                        "at": now(),
                        "text": text(a.get("comment", ""), 4000),
                        "status": status,
                    }
                )
            return app
        if action == "export":
            dest = self.w.path / "exports" / (uid() + ".zip")
            self.w.export(dest)
            return {"file": dest.name}
        raise ValueError("Unknown operation")

    def add_job(self, a):
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
        with self.w.edit() as s:
            existing = next((x for x in s["jobs"] if x["id"] == j["id"]), None)
            if existing:
                if "prior_application" not in a:
                    j["prior_application"] = existing.get("prior_application", "none")
                s["jobs"].remove(existing)
            s["jobs"].append(j)
        return j

    def refresh(self, id):
        src = find(self.state()["sources"], id)
        try:
            jobs = sources.discover(src["kind"], src["board"])
            for j in jobs:
                self.add_job(j)
            with self.w.edit() as s:
                ids = {j["id"] for j in jobs}
                for old in s["jobs"]:
                    if (
                        old["source"] == src["kind"] + ":" + src["board"]
                        and old["id"] not in ids
                    ):
                        old["availability"] = "closed"
                find(s["sources"], id).update(
                    {
                        "status": "retrieved",
                        "checked_at": now(),
                        "count": len(jobs),
                        "error": None,
                    }
                )
            return {"count": len(jobs)}
        except Exception as e:
            # Do not persist remote response bodies, secrets or raw exception strings.
            with self.w.edit() as s:
                find(s["sources"], id).update(
                    {
                        "status": "failed",
                        "checked_at": now(),
                        "error": type(e).__name__ + "; retry or import manually",
                    }
                )
            return {
                "error": "Source retrieval failed; previous results retained with their original timestamps"
            }

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

    def run(self, id):
        try:
            self.update_run(id, status="running")
            r = find(self.state()["runs"], id)
            if r["queue"] is None:
                if r["discover"]:
                    for src in self.state()["sources"]:
                        if find(self.state()["runs"], id)["cancel"]:
                            self.update_run(id, status="cancelled")
                            return
                        self.refresh(src["id"])
                s = self.state()
                already_prepared = {app["job_id"] for app in s["applications"]}
                rows = matching.ranked(s["jobs"], r["profile"], s["facts"])
                self.update_run(
                    id,
                    queue=[
                        x["job"]["id"]
                        for x in rows
                        if x["match"]["eligible_for_preparation"]
                        and x["job"]["id"] not in already_prepared
                    ],
                    note="Discovery and ranking complete",
                )
            while True:
                s = self.state()
                r = find(s["runs"], id)
                if r["cancel"]:
                    self.update_run(id, status="cancelled")
                    return
                remaining = [j for j in r["queue"] if j not in r["done"]]
                if len(r["packages"]) >= r["count"] or not remaining:
                    self.update_run(
                        id,
                        status="complete",
                        note="No weak matches added to fill the batch",
                    )
                    return
                job = find(s["jobs"], remaining[0])
                facts = matching.available(s["facts"])
                m = matching.match(job, r["profile"], facts)
                try:
                    if not m["eligible_for_preparation"]:
                        raise ValueError("Eligibility changed; recheck result")
                    ids = m["fact_ids"][:10]
                    if r["mode"] == "openai":
                        providers.require_consent(s, "openai")
                        body = providers.request_body(job, facts, r["config"])
                        cost = providers.reserve(body, r["config"])
                        if r["reserved"] + cost > r["budget"]:
                            self.update_run(
                                id,
                                status="paused",
                                note="Approved budget exhausted; no request made",
                            )
                            return
                        self.update_run(
                            id, reserved=r["reserved"] + cost, inflight=job["id"]
                        )
                        ids = providers.openai_select(body, facts)
                        self.update_run(id, inflight=None)
                        providers.require_consent(self.state(), "openai")
                    app = self.prepare(job, r["profile"], s["identity"], facts, m, ids)
                    with self.w.edit() as state:
                        current = find(state["runs"], id)
                        current["done"].append(job["id"])
                        current["packages"].append(app["id"])
                except Exception as e:
                    with self.w.edit() as state:
                        current = find(state["runs"], id)
                        current["inflight"] = None
                        current["done"].append(job["id"])
                        current["errors"].append(
                            {
                                "job_id": job["id"],
                                "error": str(e)
                                if isinstance(e, ValueError)
                                else type(e).__name__,
                            }
                        )
        except Exception:
            self.update_run(
                id,
                status="failed",
                note="Run interrupted by an error; inspect inputs and resume",
            )

    def prepare(self, job, profile, identity, facts, m, ids):
        m["salary_expectation"] = matching.salary_expectation(job, m)
        ids = providers.selection({"fact_ids": ids}, facts)
        chosen = [find(facts, i) for i in ids]
        current = {f["id"]: f for f in matching.available(self.state()["facts"])}
        if any(current.get(f["id"]) != f for f in chosen):
            raise ValueError(
                "Career facts changed during preparation; review and retry"
            )
        id = uid()
        p = self.w.path / "packages" / id
        try:
            documents.render(
                p, identity, job, chosen, m, profile.get("template", "navy")
            )
        except Exception:
            if p.exists():
                shutil.rmtree(p)
            raise
        app = {
            "id": id,
            "job_id": job["id"],
            "title": job["title"],
            "employer": job["employer"],
            "created_at": now(),
            "status": "draft",
            "comments": [],
            "fact_ids": ids,
        }
        with self.w.edit() as s:
            s["applications"].append(app)
        return app
