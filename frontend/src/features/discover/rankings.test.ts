import { expect, it, vi } from "vitest";
import type { RankedJob } from "@/lib/models";
import { cachedRanking, loadRanking } from "./rankings";

const rows: RankedJob[] = [];

it("shares a pending assessment and reuses even an empty completed result", async () => {
  let finish!: (value: RankedJob[]) => void;
  const client = {
    action: vi.fn().mockImplementation(
      () =>
        new Promise<RankedJob[]>((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const first = loadRanking(client, "/workspace", "profile", "inputs");
  const second = loadRanking(client, "/workspace", "profile", "inputs");
  expect(client.action).toHaveBeenCalledTimes(1);
  expect(
    cachedRanking(client, "/workspace", "profile", "inputs"),
  ).toBeUndefined();
  finish(rows);
  expect(await first).toBe(rows);
  expect(await second).toBe(rows);
  expect(cachedRanking(client, "/workspace", "profile", "inputs")).toBe(rows);
  await loadRanking(client, "/workspace", "profile", "inputs");
  expect(client.action).toHaveBeenCalledTimes(1);
});

it("separates profiles, changed inputs and API clients", async () => {
  const client = { action: vi.fn().mockResolvedValue(rows) };
  await loadRanking(client, "/workspace", "profile-a", "inputs");
  expect(
    cachedRanking(client, "/workspace", "profile-b", "inputs"),
  ).toBeUndefined();
  await loadRanking(client, "/workspace", "profile-b", "inputs");
  expect(
    cachedRanking(client, "/workspace", "profile-a", "changed-facts"),
  ).toBeUndefined();
  await loadRanking(client, "/workspace", "profile-a", "changed-facts");
  const other = { action: vi.fn().mockResolvedValue(rows) };
  expect(
    cachedRanking(other, "/workspace", "profile-a", "changed-facts"),
  ).toBeUndefined();
  await loadRanking(other, "/workspace", "profile-a", "changed-facts");
  expect(client.action).toHaveBeenCalledTimes(3);
  expect(other.action).toHaveBeenCalledTimes(1);
});

it("discards cached and late responses when the same client switches workspaces", async () => {
  let finish!: (value: RankedJob[]) => void;
  const client = { action: vi.fn().mockResolvedValue(rows) };
  await loadRanking(client, "/first", "profile", "same-inputs");
  client.action.mockImplementationOnce(
    () =>
      new Promise<RankedJob[]>((resolve) => {
        finish = resolve;
      }),
  );
  const old = loadRanking(client, "/first", "profile", "same-inputs", true);
  expect(
    cachedRanking(client, "/second", "profile", "same-inputs"),
  ).toBeUndefined();
  await loadRanking(client, "/second", "profile", "same-inputs");
  finish([]);
  await old;
  expect(cachedRanking(client, "/second", "profile", "same-inputs")).toBe(rows);
  expect(
    cachedRanking(client, "/first", "profile", "same-inputs"),
  ).toBeUndefined();
});

it("expires time-sensitive matches and lets explicit refresh bypass the cache", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
  const client = { action: vi.fn().mockResolvedValue(rows) };
  await loadRanking(client, "/workspace", "profile", "inputs");
  await loadRanking(client, "/workspace", "profile", "inputs", true);
  expect(client.action).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(160_000);
  expect(
    cachedRanking(client, "/workspace", "profile", "inputs"),
  ).toBeUndefined();
  await loadRanking(client, "/workspace", "profile", "inputs");
  expect(client.action).toHaveBeenCalledTimes(3);
});

it("does not cache failures or let an older request replace newer inputs", async () => {
  const client = {
    action: vi.fn().mockRejectedValueOnce(new Error("Unavailable")),
  };
  await expect(
    loadRanking(client, "/workspace", "profile", "inputs"),
  ).rejects.toThrow("Unavailable");
  expect(
    cachedRanking(client, "/workspace", "profile", "inputs"),
  ).toBeUndefined();
  let finish!: (value: RankedJob[]) => void;
  client.action.mockImplementationOnce(
    () =>
      new Promise<RankedJob[]>((resolve) => {
        finish = resolve;
      }),
  );
  const old = loadRanking(client, "/workspace", "profile", "inputs");
  client.action.mockResolvedValueOnce(rows);
  await loadRanking(client, "/workspace", "profile", "new-inputs");
  finish([]);
  await old;
  expect(cachedRanking(client, "/workspace", "profile", "new-inputs")).toBe(
    rows,
  );
  expect(
    cachedRanking(client, "/workspace", "profile", "inputs"),
  ).toBeUndefined();
});
