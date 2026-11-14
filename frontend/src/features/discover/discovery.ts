import type { Application, ApplicationBlocker, ApplicationQueueEntry, Fact, Job, RankedJob } from "@/lib/models";
import {
  applicationRoleId,
  destination,
} from "@/lib/format";
import { applicationQueues } from "@/features/applications/queues";
import { applicationStatusLabel } from "@/features/applications/version-labels";
import { currentRemoval } from "@/lib/job-removal";

export { advertisedSalary } from "@/lib/format";

export type DiscoveryView = "jobs" | "to-apply" | "applications";

export function pendingActionLabel(saved?: boolean) {
  return saved ? "Remove from To apply" : "Apply later";
}

function pendingCapacityBlocked(job: Job, blocker?: ApplicationBlocker) {
  return !job.saved && blocker?.code === "company_slots_used" &&
    (!job.application_blocker || job.application_blocker.code === blocker.code);
}

export function pendingCapacityStatus(job: Job, blocker?: ApplicationBlocker) {
  if (!pendingCapacityBlocked(job, blocker)) return undefined;
  return job.company?.pending_only_count === 2 ? "2 selected" : "No slots left";
}

export function stacksAtPendingLimit(job: Job) {
  return Boolean(
    job.hiring_employer_verified &&
    job.company?.id &&
    job.company.pending_only_count === 2 &&
    pendingCapacityBlocked(job, job.pending_blocker),
  );
}

export function employerQueueHref(employerId: string) {
  return `/discover/?${new URLSearchParams({
    view: "to-apply",
    employer: employerId,
  })}`;
}

export function displayedBlocker(job: Job, pending?: ApplicationBlocker) {
  if (pending?.code === "company_slots_used" && job.application_blocker)
    return job.application_blocker;
  return pending || job.application_blocker;
}
export interface RequirementEvidence {
  requirement: string;
  assessment: string;
  facts: Fact[];
  careerFacts: Fact[];
  confirmedForJob: boolean;
}

/** Only known, confirmed facts can become visible supporting evidence. */
export function requirementEvidence(value: unknown, facts: Fact[], job?: Job) {
  const confirmed = new Map(
    facts
      .filter((fact) => fact.confirmed && !fact.retired && !fact.conflict)
      .map((fact) => [fact.id, fact]),
  );
  const ranked = new Map<string, Record<string, unknown>>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.requirement === "string")
        ranked.set(item.requirement, item);
    }
  }
  const resolve = (ids: unknown) =>
    Array.isArray(ids)
      ? [...new Set(ids)].flatMap((id) => {
          const fact = typeof id === "string" ? confirmed.get(id) : undefined;
          return fact ? [fact] : [];
        })
      : [];
  const saved = job?.requirement_evidence;
  const matched = job?.matched_skill_evidence;
  return [...new Set(job?.requirements ?? ranked.keys())].map(
    (requirement): RequirementEvidence => {
      const item = ranked.get(requirement);
      const recorded =
        saved && Object.hasOwn(saved, requirement)
          ? saved[requirement]
          : undefined;
      const skillIds =
        matched && Object.hasOwn(matched, requirement)
          ? matched[requirement]
          : undefined;
      const career = new Map(
        [...resolve(recorded?.fact_ids), ...resolve(skillIds)].map((fact) => [
          fact.id,
          fact,
        ]),
      );
      return {
        requirement,
        assessment: typeof item?.assessment === "string" ? item.assessment : "",
        facts: resolve(item?.fact_ids).filter((fact) => !career.has(fact.id)),
        careerFacts: [...career.values()],
        confirmedForJob: recorded?.confirmed === true,
      };
    },
  );
}

export function remainingEvidenceGaps(
  gaps: string[],
  evidence: RequirementEvidence[],
) {
  const confirmed = new Set(
    evidence
      .filter(
        ({ careerFacts, confirmedForJob }) =>
          careerFacts.length || confirmedForJob,
      )
      .map(({ requirement }) => requirement),
  );
  return gaps.filter((gap) => !confirmed.has(gap));
}

export function applicationsByJob(applications: Application[], entries?: ApplicationQueueEntry[]) {
  if (entries) {
    const versions = new Map(applications.map((app) => [app.id, app]));
    return new Map(entries.flatMap(({ job_id, application_id }) => {
      const version = application_id ? versions.get(application_id) : undefined;
      return version ? [[job_id, version] as const] : [];
    }));
  }
  return new Map(
    applicationQueues(applications, true).map((app) => [
      applicationRoleId(app),
      app,
    ]),
  );
}

export function roleStatus(job: Job, app?: Application, preview = false) {
  if (app?.status === "submitted")
    return {
      label: applicationStatusLabel(app.status, preview),
      tone: "muted",
    };
  if (job.prior_application === "submitted")
    return { label: "Submission recorded", tone: "muted" };
  if (app?.status === "rejected") return { label: "Rejected", tone: "warning" };
  if (job.prior_application === "rejected")
    return { label: "Earlier rejection", tone: "warning" };
  if (app?.status === "reviewed") return { label: "Reviewed", tone: "green" };
  if (app) return { label: "Draft", tone: "purple" };
  if (job.saved) return { label: "To apply", tone: "amber" };
  return { label: "New", tone: "blue" };
}

export function filterOpportunities(
  rows: RankedJob[],
  filters: {
    query: string;
    location: string;
    view: DiscoveryView;
    removed?: boolean;
  },
  priorities: string[],
) {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter(({ job }) => {
    if (
      filters.view !== "applications" &&
      Boolean(currentRemoval(job)) !== Boolean(filters.removed)
    )
      return false;
    if (
      filters.view !== "applications" &&
      Boolean(job.saved) !== (filters.view === "to-apply")
    )
      return false;
    if (filters.location && destination(job, priorities) !== filters.location)
      return false;
    return (
      !query ||
      [
        job.title,
        job.employer,
        job.company?.name,
        job.location,
        job.city,
        job.work_arrangement,
        ...(job.requirements || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}

export function groupOpportunities(rows: RankedJob[]) {
  const groups = new Map<string, { id: string; name: string; roles: RankedJob[] }>();
  for (const row of rows) {
    const { company, employer } = row.job;
    const name = company?.name || employer.trim() || "Hiring employer unknown";
    const id = company?.id
      ? `employer:${company.id}`
      : `listing:${name.toLocaleLowerCase().replace(/\s+/g, " ")}`;
    const group = groups.get(id);
    if (group) group.roles.push(row);
    else groups.set(id, { id, name, roles: [row] });
  }
  return [...groups.values()];
}
