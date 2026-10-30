import type { Application, Job } from "@/lib/models";
import { decisionDate, displayDate, known } from "@/lib/format";

export function ApplicationDetails({
  app,
  job,
  timezone,
}: {
  app: Application;
  job: Partial<Job>;
  timezone: string;
}) {
  const salary = job.salary;
  const pay =
    typeof salary === "string"
      ? salary
      : salary && (salary.min || salary.max)
        ? [
            salary.currency,
            salary.min || "",
            salary.max ? `– ${salary.max}` : "",
            salary.period,
            salary.basis,
          ]
            .filter(Boolean)
            .join(" ")
        : "";
  const rows: [string, string | undefined, boolean?][] = [
    ["Location", job.location],
    ["Work arrangement", job.work_arrangement],
    ["Advertised salary", pay],
    ["Listing posted", job.posted_at, true],
    ["Listing reposted", job.reposted_at, true],
    ["Application deadline", job.closes, true],
    ["Availability", job.availability],
    ["Last checked", job.checked_at, true],
    ["Generated", app.created_at, true],
    ["Reviewed", decisionDate(app, "reviewed"), true],
    ["Submitted", decisionDate(app, "submitted"), true],
  ];
  return (
    <dl className="application-details">
      {rows
        .filter(([, value]) => known(value))
        .map(([label, value, date]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{date ? displayDate(value, timezone) : value}</dd>
          </div>
        ))}
    </dl>
  );
}
