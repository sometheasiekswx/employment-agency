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
