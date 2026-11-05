import type { ApiClient } from "@/lib/api";
import type { RankedJob } from "@/lib/models";

type RankingClient = Pick<ApiClient, "action">;
interface Entry {
  key: string;
  expiresAt: number;
  rows?: RankedJob[];
  pending?: Promise<RankedJob[]>;
}
interface WorkspaceCache {
  workspace: string;
  profiles: Map<string, Entry>;
}

// Private matches live only in this client's memory, never browser storage.
const caches = new WeakMap<RankingClient, WorkspaceCache>();
const MAX_AGE_MS = 60_000;

function cacheFor(client: RankingClient, workspace: string) {
  let cache = caches.get(client);
  if (!cache || cache.workspace !== workspace) {
    cache = { workspace, profiles: new Map() };
    caches.set(client, cache);
  }
  return cache.profiles;
}

export function cachedRanking(
  client: RankingClient,
  workspace: string,
  profileId: string,
  key: string,
) {
  const entry = cacheFor(client, workspace).get(profileId);
  return entry?.key === key && entry.expiresAt > Date.now()
    ? entry.rows
    : undefined;
}

export async function loadRanking(
  client: RankingClient,
  workspace: string,
  profileId: string,
  key: string,
  force = false,
): Promise<RankedJob[]> {
  const cache = cacheFor(client, workspace);
  const previous = cache.get(profileId);
  if (!force && previous?.key === key) {
    if (previous.pending) return previous.pending;
    if (previous.rows && previous.expiresAt > Date.now()) return previous.rows;
  }
  const entry: Entry = { key, expiresAt: 0 };
  entry.pending = client
    .action<RankedJob[]>("rank", { profile_id: profileId })
    .then(
      (rows) => {
        if (cache.get(profileId) === entry) {
          entry.rows = rows;
          entry.expiresAt = Date.now() + MAX_AGE_MS;
          entry.pending = undefined;
        }
        return rows;
      },
      (error: unknown) => {
        if (cache.get(profileId) === entry) cache.delete(profileId);
        throw error;
      },
    );
  cache.set(profileId, entry);
  return entry.pending;
}
