import type { Job } from "./models";

export interface PublicJobSource {
  board: string;
  employer: string;
  country: string;
  city: string;
  destination: string;
  query: string;
  count: number;
}

export interface ReviewedJobSource {
  source: string;
  employer: string;
  careers_url: string;
  posting_urls: string[];
}

const storedPrefix = "employment-agency:public-posting:";
const bookmarkMap = "employment-agency:employer-bookmarks";
const choicePrefixes = [
  storedPrefix,
  bookmarkMap + ":job:",
  "employment-agency:employer-removals:job:",
];

/** Drop browser records outside the current, logo-verified public catalog. */
export function prunePublicListingStorage(admitted: ReadonlySet<string>) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    );
    for (const key of keys) {
      const prefix = choicePrefixes.find((candidate) => key?.startsWith(candidate));
      if (key && prefix && !admitted.has(key.slice(prefix.length)))
        localStorage.removeItem(key);
      if (key && /^employment-agency:fictional-(bookmarks|removals):/.test(key))
        localStorage.removeItem(key);
    }
    const raw = localStorage.getItem(bookmarkMap);
    if (raw === null) return;
    try {
      const previous: unknown = JSON.parse(raw);
      if (!previous || typeof previous !== "object" || Array.isArray(previous))
        return;
      const entries = Object.entries(previous);
      const retained = entries.filter(([id, saved]) => admitted.has(id) && typeof saved === "boolean");
      if (retained.length && retained.length !== entries.length)
        localStorage.setItem(bookmarkMap, JSON.stringify(Object.fromEntries(retained)));
      if (!retained.length) localStorage.removeItem(bookmarkMap);
    } catch {
      localStorage.removeItem(bookmarkMap);
    }
  } catch {
    // The current catalog still controls membership when storage is blocked.
  }
}
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const text = (value: unknown, limit = 300) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";

export const publicSourceId = ({ board, country }: PublicJobSource) =>
  `smartrecruiters:${board}:${country}`;

function validSource(source: PublicJobSource) {
  return (
    source &&
    /^[A-Za-z0-9_-]{1,40}$/.test(source.board) &&
    /^[a-z]{2}$/.test(source.country) &&
    Boolean(text(source.employer) && text(source.destination)) &&
    typeof source.city === "string" &&
    typeof source.query === "string" &&
    Number.isInteger(source.count) &&
    source.count > 0 &&
    source.count <= 8
  );
}

function description(title: string, employer: string, location: string) {
  return `${title} at ${employer} in ${location}. See the original advert for the full role and current requirements.`;
}

/** Only public posting metadata is retained with a browser bookmark or removal. */
export function rememberPublicListing(job: Job) {
  if (!/^(smartrecruiters|reviewed):/.test(job.source ?? "")) return;
  try {
    localStorage.setItem(
      storedPrefix + job.id,
      JSON.stringify({
        id: job.id,
        source: job.source,
        url: job.url,
        title: job.title,
        location: job.location,
        city: job.city,
        checked_at: job.checked_at,
        posted_at: job.posted_at,
      }),
    );
  } catch {
    // Browser storage can be unavailable. The current tab still has the role.
  }
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return;
  const link = new URL(value);
  if (link.protocol === "https:" && !link.username && !link.password && !link.hash)
    return link;
}

function legacyPosting(job: Job, source: PublicJobSource) {
  const link = httpsUrl(job.url);
  return (
    isId(job.id) &&
    link?.origin === "https://jobs.smartrecruiters.com" &&
    !link.search &&
    new RegExp(`^/${source.board}/[0-9]{6,20}$`).test(link.pathname)
  ) ? {
    url: link.href,
    employer: source.employer,
    city: source.destination,
    careers_url: `https://careers.smartrecruiters.com/${source.board}`,
  } : undefined;
}

async function reviewedPosting(
  job: Job,
  source: ReviewedJobSource,
  destinations: Set<string>,
) {
  if (
    !/^[a-f0-9]{24}$/.test(job.id) ||
    !job.url ||
    !Array.isArray(source.posting_urls) ||
    !source.posting_urls.includes(job.url) ||
    !text(source.employer)
  ) return;
  const link = httpsUrl(job.url);
  const careers = httpsUrl(source.careers_url);
  if (!link || !careers) return;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(job.url));
  const id = Array.from(new Uint8Array(hash).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (id !== job.id) return;
  return {
    url: link.href,
    employer: source.employer,
    city: job.city && destinations.has(job.city) ? job.city : undefined,
    careers_url: careers.href,
  };
}

export async function storedPublicListings(
  sources: PublicJobSource[],
  reviewed: ReviewedJobSource[],
  destinations: Set<string>,
): Promise<Job[]> {
  const legacy = new Map(
    sources.filter(validSource).map((source) => [publicSourceId(source), source]),
  );
  const approved = new Map(
    reviewed.filter((source) => /^reviewed:[a-z0-9-]+$/.test(source?.source))
      .map((source) => [source.source, source]),
  );
  const candidates: Promise<Job | undefined>[] = [];
  async function restore(key: string): Promise<Job | undefined> {
    try {
      const job = JSON.parse(localStorage.getItem(key) ?? "null") as Job | null;
      if (!job?.source || key !== storedPrefix + job.id) return;
      const title = text(job.title);
      const location = text(job.location);
      if (!title || !location) return;
      const legacySource = legacy.get(job.source);
      const reviewedSource = approved.get(job.source);
      const posting = legacySource
        ? legacyPosting(job, legacySource)
        : reviewedSource && await reviewedPosting(job, reviewedSource, destinations);
      if (!posting) return;
      return {
        ...posting,
        id: job.id,
        title,
        location,
        source: job.source,
        description: description(title, posting.employer, location),
        availability: "Saved employer snapshot",
        checked_at: text(job.checked_at, 40),
        posted_at: text(job.posted_at, 10),
        eligibility: "unknown",
      };
    } catch {
      // An invalid storage entry cannot become a role.
    }
  }
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(storedPrefix)) candidates.push(restore(key));
    }
  } catch {
    // Storage may be blocked by the browser.
  }
  return (await Promise.all(candidates)).filter((job): job is Job => Boolean(job));
}
