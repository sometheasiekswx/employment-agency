import type { Application, Fact, Job, RankedJob } from "@/lib/models";
import { compareDestinations, destination } from "@/lib/format";
import { applicationQueues } from "@/features/applications/queues";
import { currentRemoval } from "@/lib/job-removal";

export { advertisedSalary } from "@/lib/format";

export type DiscoveryView = "recommended" | "all" | "saved" | "applications";
export interface RequirementEvidence {
  requirement: string;
  assessment: string;
  facts: Fact[];
}

/** Only known, confirmed facts can become visible supporting evidence. */
export function requirementEvidence(value: unknown, facts: Fact[]) {
  const confirmed = new Map(
    facts
      .filter((fact) => fact.confirmed && !fact.retired && !fact.conflict)
      .map((fact) => [fact.id, fact]),
  );
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RequirementEvidence[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.requirement !== "string") return [];
    const ids = Array.isArray(item.fact_ids) ? item.fact_ids : [];
    return [
      {
        requirement: item.requirement,
        assessment: typeof item.assessment === "string" ? item.assessment : "",
        facts: ids.flatMap((id) => {
          const fact = typeof id === "string" ? confirmed.get(id) : undefined;
          return fact ? [fact] : [];
        }),
      },
    ];
  });
}

export function applicationsByJob(applications: Application[]) {
  return new Map(
    applicationQueues(applications, true).map((app) => [app.job_id, app]),
  );
}

export function roleStatus(job: Job, app?: Application) {
  if (app?.status === "submitted") return { label: "Submitted", tone: "muted" };
  if (job.prior_application === "submitted")
    return { label: "Submission recorded", tone: "muted" };
  if (app?.status === "rejected") return { label: "Rejected", tone: "warning" };
  if (job.prior_application === "rejected")
    return { label: "Earlier rejection", tone: "warning" };
  if (app?.status === "reviewed") return { label: "Reviewed", tone: "green" };
  if (app) return { label: "Draft", tone: "purple" };
  if (job.saved) return { label: "Saved", tone: "amber" };
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
  return rows.filter(({ job, match }) => {
    if (
      filters.view !== "applications" &&
      Boolean(currentRemoval(job)) !== Boolean(filters.removed)
    )
      return false;
    if (filters.view === "saved" && !job.saved) return false;
    if (filters.view === "recommended" && match.hard_conflicts.length)
      return false;
    if (filters.location && destination(job, priorities) !== filters.location)
      return false;
    return (
      !query ||
      [
        job.title,
        job.employer,
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

export function groupOpportunities(rows: RankedJob[], priorities: string[]) {
  const groups = new Map<string, RankedJob[]>();
  for (const row of rows) {
    const city = destination(row.job, priorities);
    groups.set(city, [...(groups.get(city) || []), row]);
  }
  return [...groups].sort(([a], [b]) => compareDestinations(a, b, priorities));
}
