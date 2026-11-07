import { applicationRoleId, decisionDate } from "@/lib/format";
import type { Application } from "@/lib/models";

function timestamp(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

export function applicationTime(app: Application) {
  const submitted =
    app.status === "submitted"
      ? timestamp(decisionDate(app, "submitted"))
      : -Infinity;
  return submitted === -Infinity ? timestamp(app.created_at) : submitted;
}

function replaces(candidate: Application, current: Application) {
  if ((candidate.status === "submitted") !== (current.status === "submitted")) {
    return candidate.status === "submitted";
  }
  // Imported review queues must not displace current versions. A submitted
  // snapshot still wins over every draft, including edits made after sending.
  if (Boolean(candidate.archived) !== Boolean(current.archived)) {
    return !candidate.archived;
  }
  const candidateTime = applicationTime(candidate);
  const currentTime = applicationTime(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  // State appends versions. Equal/missing dates use the last persisted version,
  // without relying on random identifiers or mutating the source records.
  return timestamp(candidate.created_at) >= timestamp(current.created_at);
}

export function applicationQueues(
  applications: Application[],
  includeHistorical = false,
) {
  const current = new Map<string, Application>();
  for (const app of applications) {
    const recovery = app.submission_correction
      ? applications.find(
          (item) =>
            item.id === app.submission_correction?.recovery_application_id,
        )
      : undefined;
    // Match the backend: only an intact linked recovery supersedes a manual decision.
    if (
      app.status === "submitted" &&
      recovery?.submission_recovery?.original_id === app.id &&
      recovery.manifest_hash === app.manifest_hash &&
      recovery.folder === app.folder
    )
      continue;
    const key = applicationRoleId(app);
    const previous = current.get(key);
    if (!previous || replaces(app, previous)) current.set(key, app);
  }
  // Resolve decisions before hiding archived queues: an archived submission
  // must never expose an older sibling as a new actionable application.
  return [...current.values()].filter(
    (app) => includeHistorical || !app.archived,
  );
}
