import type { Job, JobRemoval } from "./models";

export function currentRemoval(
  job: Pick<Job, "removals"> | undefined,
): JobRemoval | undefined {
  const latest = job?.removals?.at(-1);
  return latest && !latest.restored_at ? latest : undefined;
}

export function removalId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
