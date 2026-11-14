"""Incremental, bounded search. Worker threads only fetch public content."""

import copy
import queue
import threading
from time import monotonic
from urllib.parse import urlsplit

from . import companies, job_feeds, matching, public_pages
from .discovery_fetch import FETCH_FAILURES, Fetch, ResponseCache, label_error
from .store import now, uid


MAX_INPUTS = 16
MAX_FOLLOWED = 16
MAX_PER_PAGE = 5
MAX_WORKERS = 4
MAX_RUN_IMPORT = 500
MAX_SOURCE_IMPORT = 150
MAX_FEED_DETAILS = 12
EARLY_SECONDS = 25
RUN_SECONDS = 90
NETWORK_SLOTS = threading.BoundedSemaphore(8)


class Discovery:
    def __init__(self, service):
        self.service = service
        self.lock = threading.RLock()
        self.thread = None
        self.cancelled = threading.Event()
        self.result = None
        self.cache = ResponseCache()

    @property
    def busy(self):
        return bool(self.thread and self.thread.is_alive())

    def action(self, action, args):
        if action == "discovery-start":
            return self.start(args)
        if action == "discovery-status":
            return self.status(args.get("id"))
        if action == "discovery-stop":
            return self.stop(args.get("id"))
        raise ValueError("Unknown discovery operation")

    def start(self, args):
        from .service import find

        if set(args) - {"profile_id", "source_ids", "urls", "firecrawl", "render"}:
            raise ValueError("Unknown discovery options")
        with self.lock:
            if self.busy:
                raise ValueError("A discovery run is active. Check its results or stop it first.")
            state = self.service.w.read()
            profile_id = args.get("profile_id")
            if profile_id:
                find(state["profiles"], profile_id)
            source_ids = args.get("source_ids", [])
            urls = args.get("urls", [])
            for values in (source_ids, urls):
                if not isinstance(values, list) or len(values) > MAX_INPUTS or any(
                    not isinstance(value, str) for value in values
                ):
                    raise ValueError(f"Choose up to {MAX_INPUTS} public URLs and configured feeds")
            for option in ("firecrawl", "render"):
                if option in args and type(args[option]) is not bool:
                    raise ValueError("Discovery options must be on or off")
            if not urls and not source_ids:
                raise ValueError("Choose at least one feed or enter a public URL")
            self.cancelled = threading.Event()
            started = monotonic()
            fetch = Fetch(self.cancelled, started + RUN_SECONDS, allow_firecrawl=args.get("firecrawl"),
                          force_browser=args.get("render"), cache=self.cache)
            targets = {}
            for source_id in dict.fromkeys(source_ids):
                source = find(state["sources"], source_id)
                target = feed_target(source["kind"], source["board"], source_id)
                targets.setdefault(target["key"], target)
            for url in dict.fromkeys(urls):
                url = public_pages.clean_url(url.strip())
                target = page_target(url, prefer_firecrawl=True)
                if target.get("kind"):
                    source = matching_source(state, target)
                    if source:
                        target["source_id"] = source["id"]
                targets.setdefault(target["key"], target)
            if len(targets) > MAX_INPUTS:
                raise ValueError(f"Choose at most {MAX_INPUTS} feeds and URLs per search")
            result = {
                "id": uid(), "status": "running", "started_at": now(), "elapsed_seconds": 0,
                "early_results": False, "profile_id": profile_id, "sources": [], "pages": [],
                "leads": [], "jobs": [], "new_job_count": 0,
            }
            if args.get("firecrawl") and not fetch.firecrawl_key:
                result["notice"] = "Sign in to the Firecrawl CLI or set FIRECRAWL_API_KEY to enable its fallback. Local sources are still being checked."
            self.result = result
            for target in targets.values():
                row = outcome_for(target)
                if source_id := target.get("source_id"):
                    source = find(state["sources"], source_id)
                    row["last_verified_at"] = source.get("checked_at")
                result["sources"].append(row)
            self.thread = threading.Thread(
                target=self.run, args=(started, list(targets.values()), fetch), daemon=True,
            )
            self.thread.start()
            return copy.deepcopy(result)

    def status(self, run_id=None):
        with self.lock:
            if run_id is not None and (not self.result or self.result["id"] != run_id):
                raise ValueError("Discovery run is no longer available")
            return copy.deepcopy(self.result)

    def stop(self, run_id=None):
        with self.lock:
            if not self.result or self.result["id"] != run_id:
                raise ValueError("Discovery run is no longer available")
            if self.result["status"] == "running":
                self.cancelled.set()
                self.finish("stopped", "Search stopped")
            return copy.deepcopy(self.result)

    def close(self):
        with self.lock:
            self.cancelled.set()
            thread = self.thread
        if thread and thread.is_alive():
            thread.join()

    def wait(self):
        if self.thread:
            self.thread.join()
        return self.status()

    def finish(self, status, reason):
        self.result["status"] = status
        for row in self.result["sources"]:
            if row["status"] in ("queued", "fetching"):
                row.update(status=status, note=reason)

    def run(self, started, targets, fetch):
        jobs = queue.Queue()
        completed = queue.Queue()
        known = {target["key"] for target in targets}
        outcomes = dict(zip((target["key"] for target in targets), self.result["sources"]))
        imported = set()
        new_jobs = set()
        followed = 0
        pending = 0
        in_flight = {}
        per_host = {}
        queued = []
        try:
            with self.lock:
                for _ in range(MAX_WORKERS):
                    worker = threading.Thread(
                        target=fetch_worker, args=(jobs, completed, fetch), daemon=True,
                    )
                    worker.start()
            queued.extend(targets)
            while queued or pending:
                with self.lock:
                    elapsed = monotonic() - started
                    self.result["elapsed_seconds"] = round(elapsed, 1)
                    self.result["early_results"] = elapsed >= EARLY_SECONDS
                    if fetch.cancelled.is_set():
                        if self.result["status"] == "running":
                            self.finish("stopped", "Search stopped")
                        break
                    if monotonic() >= fetch.deadline:
                        self.finish("timed_out", "Search reached its time limit")
                        break
                    deadlines = {key for key, (_, deadline) in in_flight.items() if monotonic() >= deadline}
                    for key in deadlines:
                        target, _ = in_flight.pop(key)
                        pending -= 1
                        per_host[target_host(target)] -= 1
                        outcomes[key].update(status="timed_out", note="Source timed out")
                        if target.get("source_id"):
                            self.service.degrade_source(target["source_id"], "timed_out", "Source timed out")
                    ready = []
                    state = None
                    for target in queued:
                        host = target_host(target)
                        row = outcomes[target["key"]]
                        if pending >= MAX_WORKERS or per_host.get(host, 0) >= 2:
                            ready.append(target)
                            continue
                        if state is None:
                            state = self.service.w.read()
                        if target.get("kind") and not target.get("source_id"):
                            if source := matching_source(state, target):
                                target["source_id"] = source["id"]
                                row["last_verified_at"] = source.get("checked_at")
                        if note := source_skip_reason(state, target):
                            row.update(status="skipped", note=note)
                        else:
                            row["status"] = "fetching"
                            per_host[host] = per_host.get(host, 0) + 1
                            jobs.put(target)
                            pending += 1
                            in_flight[target["key"]] = (target, monotonic() + source_wait(target))
                    queued = ready
                if not pending:
                    continue
                try:
                    target, payload = completed.get(timeout=0.15)
                except queue.Empty:
                    continue
                with self.lock:
                    if fetch.cancelled.is_set() or monotonic() >= fetch.deadline:
                        continue
                    if target["key"] not in in_flight:
                        continue
                    in_flight.pop(target["key"])
                    pending -= 1
                    per_host[target_host(target)] -= 1
                    row = outcomes[target["key"]]
                    next_targets = self.accept(target, payload, row, imported, new_jobs, fetch.deadline)
                    for child in next_targets:
                        if followed >= MAX_FOLLOWED:
                            break
                        if child["key"] in known:
                            continue
                        known.add(child["key"])
                        followed += 1
                        child_row = outcome_for(child)
                        self.result["sources"].append(child_row)
                        outcomes[child["key"]] = child_row
                        queued.append(child)
                    if not queued and not pending:
                        break
            with self.lock:
                if self.result["status"] == "running":
                    expired = monotonic() >= fetch.deadline
                    self.finish("timed_out" if expired else "complete",
                                "Search reached its time limit" if expired else "")
        except Exception:
            with self.lock:
                if self.result["status"] == "running":
                    self.result["error"] = "The workspace could not finish discovery. Earlier results were retained."
                    self.finish("failed", self.result["error"])
        finally:
            fetch.cancelled.set()
            for _ in range(MAX_WORKERS):
                jobs.put(None)
            with self.lock:
                self.result["elapsed_seconds"] = round(monotonic() - started, 1)

    def accept(self, target, payload, row, imported, new_jobs, deadline):
        if isinstance(payload, Exception):
            status, message = label_error(payload)
            row.update(status=status, note=message)
            if target.get("source_id"):
                self.service.degrade_source(target["source_id"], status, message)
            return []
        method, fetched_jobs, page = payload
        row.update(method=method, checked_at=now(), job_count=len(fetched_jobs))
        if page and page.get("note"):
            row.update(status="partial", note=page["note"])
        else:
            row["status"] = "retrieved"
        if page:
            row["final_url"] = page["url"]
            self.result["pages"].append({key: page[key] for key in ("url", "title", "text", "links")})
            if not fetched_jobs and page["text"] and public_pages.job_hint(page["url"], page["title"]):
                self.add_lead(page)
        capacity = max(0, min(MAX_SOURCE_IMPORT, MAX_RUN_IMPORT - len(imported)))
        full_board = target.get("kind") in job_feeds.EMPLOYER_BOARDS
        valid, leads = [], []
        for job in fetched_jobs:
            if all(job.get(key) for key in ("title", "employer", "description", "url")):
                valid.append(job)
            elif target.get("kind") == "smartrecruiters" and job.get("detail_url"):
                leads.append(job)
            else:
                full_board = False
                if row["status"] == "retrieved":
                    row.update(status="partial", note="Some listings are missing structured details")
                self.add_lead(job)
        profile = {}
        if leads or len(valid) > capacity:
            state = self.service.w.read()
            profile = next((item for item in state["profiles"] if item["id"] == self.result["profile_id"]), {})
        if leads:
            leads = [match["job"] for match in matching.ranked(leads, profile, state["facts"])]
        if len(valid) > capacity:
            valid = [match["job"] for match in matching.ranked(valid, profile, state["facts"])][:capacity]
            row.update(status="partial", note=f"Imported up to {capacity} listings from this source")
        if len(leads) > MAX_FEED_DETAILS:
            row.update(status="partial", note=f"Checked details for up to {MAX_FEED_DETAILS} postings")
        try:
            job_ids, newly_recorded, skipped = self.service.import_discovery(
                valid, source_id=target.get("source_id"), full_snapshot=full_board and not leads,
                status=row["status"], observed_jobs=fetched_jobs, deadline=deadline,
            )
        except TimeoutError:
            row.update(status="timed_out", note="Search reached its time limit before saving this source")
            return []
        except ValueError:
            message = "Source conflicted with existing records. Earlier records were retained."
            row.update(status="failed", note=message)
            if target.get("source_id"):
                self.service.degrade_source(target["source_id"], "failed", message)
            return []
        if skipped:
            row.update(status="skipped", note=skipped)
            return []
        row["imported_count"] = len(job_ids)
        row["job_ids"] = job_ids
        imported.update(job_ids)
        new_jobs.update(newly_recorded)
        if job_ids or (imported and full_board):
            state = self.service.w.read()
            profile_id = self.result["profile_id"]
            profile = next((item for item in state["profiles"] if item["id"] == profile_id), {})
            self.result["jobs"] = rank_results(state, profile, imported, new_jobs)
            self.result["new_job_count"] = len(new_jobs)
            valid_urls = {job["url"] for job in valid}
            self.result["leads"] = [lead for lead in self.result["leads"] if lead["url"] not in valid_urls]
        next_targets = []
        for job in leads:
            self.add_lead(job)
        next_targets.extend(detail_target(job) for job in leads[:MAX_FEED_DETAILS])
        if page and not valid and target.get("depth", 0) < 2:
            links = [link for link in page["links"] if public_pages.allowed_link(link["url"], page["url"])
                     and public_pages.job_link(link["url"], link["title"])]
            links.sort(key=lambda link: public_pages.label(link["title"]).casefold() in public_pages.NAVIGATION)
            next_targets.extend(page_target(link["url"], depth=target.get("depth", 0) + 1)
                                for link in links[:MAX_PER_PAGE])
        return next_targets

    def add_lead(self, job):
        leads = self.result["leads"]
        if len(leads) < 80 and not any(lead["url"] == job["url"] for lead in leads):
            leads.append({key: job.get(key, "") for key in ("title", "employer", "location", "url")})


def feed_target(kind, board, source_id=None):
    return {"key": (kind, board), "kind": kind, "board": board,
            "label": f"{kind}: {board}", "source_id": source_id}


def page_target(url, *, depth=0, prefer_firecrawl=False):
    selector = job_feeds.selector_for(url)
    if selector:
        target = feed_target(*selector)
        target["url"] = url
        return target
    return {"key": url, "url": url, "label": url, "depth": depth, "firecrawl": prefer_firecrawl}


def detail_target(job):
    return {"key": job["detail_url"], "url": job["url"], "label": job["title"], "detail": job}


def target_host(target):
    if "detail" in target:
        return "smartrecruiters"
    return target.get("kind") or urlsplit(target["url"]).hostname


def source_wait(target):
    if "detail" in target:
        return 12
    return 22 if target.get("kind") else 30


def outcome_for(target):
    return {"label": target["label"], "url": target.get("url"), "status": "queued",
            "job_count": 0, "imported_count": 0}


def matching_source(state, target):
    return next((source for source in state["sources"]
                 if (source["kind"], source["board"]) == target["key"]), None)


def source_skip_reason(state, target):
    if source_id := target.get("source_id"):
        if companies.source_cooldown(state, source_id):
            return "Company is paused"
        if not companies.source_employer(state, source_id):
            source = companies.by_id(state["sources"], source_id)
            name = companies.source_research_name(state, source)
            if name and not companies.research_employer(state, name)["remaining"]:
                return "Company is paused or its history needs review"
    url = target.get("url")
    if url and any(url in (job.get("url"), job.get("careers_url"))
                   and companies.discovery_status(state, job)["cooling"] for job in state["jobs"]):
        return "Company is paused"
    return None


def fetch_worker(work, completed, fetch):
    while (target := work.get()) is not None:
        while not NETWORK_SLOTS.acquire(timeout=0.15):
            if fetch.cancelled.is_set():
                return
        try:
            if fetch.cancelled.is_set():
                return
            if target.get("kind"):
                outcome = ("feed", fetch.feed(target["kind"], target["board"]), None)
            elif "detail" in target:
                outcome = ("feed", [fetch.enrich(target["detail"])], None)
            else:
                method, page = fetch.page(target["url"], allow_firecrawl=target.get("firecrawl", False))
                outcome = (method, page["jobs"], page)
        except (*FETCH_FAILURES, KeyError, TypeError, AttributeError, RecursionError) as exc:
            outcome = exc
        finally:
            NETWORK_SLOTS.release()
        completed.put((target, outcome))


def rank_results(state, profile, imported, new_jobs):
    from .service import legacy_rejections, submitted_job_ids

    submitted = submitted_job_ids(state)
    application_ids = {app.get("job_id") for app in state["applications"]}
    rejected = legacy_rejections(state)
    links = {link["id"]: link for link in state.get("employer_links", [])}
    excluded_vacancies = {links[key]["vacancy_id"] for key in submitted | application_ids if key in links}
    requisitions = {
        (job.get("source"), job["vacancy_requisition"])
        for job in state["jobs"] if job.get("vacancy_requisition") and job["id"] in submitted | application_ids
    }
    candidates = []
    for job in state["jobs"]:
        job_id = job["id"]
        link = links.get(job_id, {})
        removals = job.get("removals") or []
        requisition = (job.get("source"), job.get("vacancy_requisition"))
        if (job_id in imported and job_id not in submitted and job_id not in rejected
                and job_id not in application_ids and link.get("vacancy_id") not in excluded_vacancies
                and requisition not in requisitions
                and job.get("availability") != "closed" and not (removals and not removals[-1].get("restored_at"))
                and not companies.discovery_status(state, job)["cooling"]):
            candidates.append(job)
    seen = set()
    ranked = []
    for row in matching.ranked(candidates, profile, state["facts"]):
        job = row["job"]
        vacancy = links.get(job["id"], {}).get("vacancy_id")
        keys = {("url", job["url"])}
        if vacancy:
            keys.add(("vacancy", vacancy))
        if job.get("vacancy_requisition"):
            keys.add(("requisition", job.get("source"), job["vacancy_requisition"]))
        if not seen.intersection(keys) and not row["match"]["hard_conflicts"]:
            seen.update(keys)
            ranked.append({**row, "new_to_workspace": job["id"] in new_jobs})
        if len(ranked) == 40:
            break
    return ranked
