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

const endpoint = "https://api.smartrecruiters.com/v1/companies";
const storedPrefix = "employment-agency:public-posting:";
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

function locationLabel(value: string, destination: string) {
  return value.toLowerCase().includes(destination.toLowerCase())
    ? value
    : `${value}, ${destination}`;
}

function description(title: string, employer: string, location: string) {
  return `${title} at ${employer} in ${location}. See the original advert for the full role and current requirements.`;
}

function normalize(
  source: PublicJobSource,
  value: unknown,
  checked: string,
): Job | undefined {
  if (!value || typeof value !== "object") return;
  const posting = value as Record<string, unknown>;
  const place = posting.location as Record<string, unknown> | undefined;
  const id = text(posting.uuid).replaceAll("-", "").toLowerCase();
  const title = text(posting.name);
  const city = text(place?.city);
  if (
    !isId(id) ||
    typeof posting.id !== "string" ||
    !/^\d{6,20}$/.test(posting.id) ||
    !title ||
    /^\[?(expression of interest|relocate to|talent pool)/i.test(title) ||
    !city ||
    place?.country !== source.country ||
    (source.city && city.toLowerCase() !== source.city.toLowerCase())
  )
    return;
  const location = locationLabel(
    text(place?.fullLocation) || city,
    source.destination,
  );
  const posted = text(posting.releasedDate).slice(0, 10);
  return {
    id,
    title,
    employer: source.employer,
    location,
    city: source.destination,
    source: publicSourceId(source),
    url: `https://jobs.smartrecruiters.com/${source.board}/${posting.id}`,
    careers_url: `https://careers.smartrecruiters.com/${source.board}`,
    description: description(title, source.employer, location),
    availability: "Listed on employer board",
    checked_at: checked,
    posted_at: /^\d{4}-\d{2}-\d{2}$/.test(posted) ? posted : undefined,
    work_arrangement:
      place.remote === true
        ? "Remote"
        : place.hybrid === true
          ? "Hybrid"
          : undefined,
    eligibility: "unknown",
  };
}

export async function refreshPublicListings(
  sources: PublicJobSource[],
  fallback: Job[],
) {
  const checked = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const snapshots = new Map(fallback.map((job) => [job.id, job]));
  try {
    const groups = await Promise.all(
      sources.filter(validSource).map(async (source) => {
        const params = new URLSearchParams({
          country: source.country,
          limit: String(Math.min(25, source.count * 5)),
        });
        if (source.city) params.set("city", source.city);
        if (source.query) params.set("q", source.query);
        try {
          const response = await fetch(
            `${endpoint}/${source.board}/postings?${params}`,
            {
              credentials: "omit",
              referrerPolicy: "no-referrer",
              cache: "no-store",
              redirect: "error",
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error("Employer feed unavailable");
          const data: { content?: unknown } = await response.json();
          if (!Array.isArray(data.content))
            throw new Error("Invalid employer feed");
          return data.content
            .slice(0, 25)
            .flatMap((value) => {
              const job = normalize(source, value, checked);
              return job
                ? [
                    {
                      ...job,
                      requirements: snapshots.get(job.id)?.requirements,
                    },
                  ]
                : [];
            })
            .slice(0, source.count);
        } catch {
          return fallback.filter(
            (job) => job.source === publicSourceId(source),
          );
        }
      }),
    );
    return [...new Map(groups.flat().map((job) => [job.id, job])).values()];
  } finally {
    clearTimeout(timer);
  }
}

/** Only public posting metadata is retained with a browser bookmark or removal. */
export function rememberPublicListing(job: Job) {
  if (!job.source?.startsWith("smartrecruiters:")) return;
  try {
    localStorage.setItem(
      storedPrefix + job.id,
      JSON.stringify({
        id: job.id,
        source: job.source,
        url: job.url,
        title: job.title,
        location: job.location,
        checked_at: job.checked_at,
        posted_at: job.posted_at,
      }),
    );
  } catch {
    // Browser storage can be unavailable. The current tab still has the role.
  }
}

export function storedPublicListings(sources: PublicJobSource[]): Job[] {
  const available = new Map(
    sources
      .filter(validSource)
      .map((source) => [publicSourceId(source), source]),
  );
  const jobs: Job[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(storedPrefix)) continue;
      try {
        const job = JSON.parse(
          localStorage.getItem(key) ?? "null",
        ) as Job | null;
        const source = job?.source && available.get(job.source);
        if (!job || !source || !isId(job.id) || key !== storedPrefix + job.id)
          continue;
        const link = new URL(job.url || "");
        const path = link.pathname.split("/");
        if (
          link.origin !== "https://jobs.smartrecruiters.com" ||
          link.username ||
          link.password ||
          link.search ||
          link.hash ||
          path.length !== 3 ||
          path[1] !== source.board ||
          !/^\d{6,20}$/.test(path[2])
        )
          continue;
        const title = text(job.title);
        const location = text(job.location);
        if (!title || !location) continue;
        jobs.push({
          id: job.id,
          title,
          location,
          source: job.source,
          url: link.href,
          employer: source.employer,
          city: source.destination,
          careers_url: `https://careers.smartrecruiters.com/${source.board}`,
          description: description(title, source.employer, location),
          availability: "Saved employer snapshot",
          checked_at: text(job.checked_at, 40),
          posted_at: text(job.posted_at, 10),
          eligibility: "unknown",
        });
      } catch {
        // An invalid storage entry cannot become a role.
      }
    }
  } catch {
    // Storage may be blocked by the browser.
  }
  return jobs;
}
