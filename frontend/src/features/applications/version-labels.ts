import { displayDate } from "@/lib/format";
import type { Application, HistoryVersion } from "@/lib/models";

const statuses = {
  draft: "Draft",
  reviewed: "Reviewed",
  submitted: "Submitted",
  rejected: "Rejected",
};

export interface VersionLabel {
  application: Application;
  title: string;
  date: string;
  label: string;
  note?: string;
}

function creationTime(application: Application) {
  const time = Date.parse(application.created_at || "");
  return Number.isNaN(time) ? -Infinity : time;
}

/** Number the role's application records without hiding preserved decisions. */
export function applicationVersionLabels(
  applications: Application[],
  current: Application,
  timezone: string,
): VersionLabel[] {
  const versions = applications.filter((application) =>
    current.job_id
      ? application.job_id === current.job_id
      : application.id === current.id,
  );
  if (!versions.some((application) => application.id === current.id))
    versions.push(current);
  // Equal or missing dates retain persisted order, including imports.
  versions.sort((a, b) => {
    const first = creationTime(a);
    const second = creationTime(b);
    return first === second ? 0 : first < second ? -1 : 1;
  });
  return versions.map((application, index) => {
    const title = `Version ${index + 1} · ${statuses[application.status]}`;
    const date = application.created_at
      ? displayDate(application.created_at, timezone)
      : "Date not recorded";
    const note = application.submission_correction
      ? "Submission record corrected; the original decision is preserved."
      : application.submission_recovery
        ? "Recovery record from a corrected submission."
        : undefined;
    return { application, title, date, label: `${title} · ${date}`, note };
  });
}

/** Match the full canonical folder, never a similar role or employer name. */
export function historyVersionLabel(
  version: HistoryVersion,
  applications: Application[],
  timezone: string,
) {
  const folder = [
    "applications",
    version.city,
    version.company,
    version.job,
    version.label,
  ].join("/");
  const records = applications.filter(
    (application) => application.folder === folder,
  );
  const labels = records.map((record) =>
    applicationVersionLabels(applications, record, timezone).find(
      (label) => label.application.id === record.id,
    )!,
  );
  return {
    title:
      labels.length === 1
        ? labels[0].title
        : labels.length > 1
          ? "Shared document version"
          : "Preserved document version",
    date:
      labels.length === 1
        ? labels[0].date
        : displayDate(version.generated_at, timezone),
    records: labels,
  };
}
