import type { Application, Job } from "./models";

export const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The operation failed. Please try again.";
export function safeUrl(value?: string) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function displayDate(value?: string, timezone = "UTC") {
  if (!value) return "Unknown";
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateOnly = value.length === 10;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(dateOnly
      ? {}
      : { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
    timeZone: dateOnly ? "UTC" : timezone,
  }).format(date);
}
export const decisionDate = (
  app: Application,
  status: "reviewed" | "submitted",
) =>
  app[`${status}_at`] ||
  app.comments?.find(
    (comment) => comment.kind !== "comment" && comment.status === status,
  )?.at ||
  "";
export function applicationHref(app: Application) {
  const section =
    app.status === "submitted" || app.status === "rejected"
      ? app.status
      : "active";
  const query = new URLSearchParams({ section, application: app.id });
  if (app.archived) query.set("history", "true");
  return `/?${query}`;
}
export function destination(
  job: Pick<Job, "city" | "location">,
  priorities: string[],
) {
  const place = job.city || job.location || "Location unconfirmed";
  return (
    priorities.find((city) =>
      place.toLowerCase().includes(city.toLowerCase()),
    ) || place
  );
}
export function compareDestinations(
  a: string,
  b: string,
  priorities: string[],
) {
  const order = (city: string) =>
    priorities.includes(city) ? priorities.indexOf(city) : 1000;
  return order(a) - order(b) || a.localeCompare(b);
}
export function known(value: unknown) {
  return (
    value != null &&
    !["", "unknown", "not stated", "n/a", "none", "undisclosed"].includes(
      String(value).trim().toLowerCase(),
    )
  );
}

export function advertisedSalary(
  job: Pick<Job, "salary">,
  {
    compact = false,
    missing = "Salary not listed",
  }: { compact?: boolean; missing?: string } = {},
) {
  if (typeof job.salary === "string") {
    const value = job.salary.trim();
    return value && !/^salary not listed$/i.test(value) ? value : missing;
  }
  const salary = job.salary;
  const minimum =
    Number.isFinite(salary?.min) && Number(salary?.min) > 0
      ? salary!.min
      : undefined;
  const maximum =
    Number.isFinite(salary?.max) && Number(salary?.max) > 0
      ? salary!.max
      : undefined;
  if (!salary || (minimum == null && maximum == null)) return missing;
  const numbers = new Intl.NumberFormat("en", {
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  });
  const amount = (value: number) =>
    compact ? numbers.format(value).toLowerCase() : numbers.format(value);
  const range =
    minimum != null && maximum != null
      ? `${amount(minimum)}–${amount(maximum)}`
      : minimum != null
        ? `From ${amount(minimum)}`
        : `Up to ${amount(maximum!)}`;
  return [
    salary.currency,
    range,
    salary.period ? `/ ${salary.period}` : "",
    !compact && salary.basis === "gross_base" ? "gross base" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
