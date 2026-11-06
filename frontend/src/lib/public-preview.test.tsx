import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClient, connect } from "./api";
import { PREVIEW_READ_ONLY, PublicPreviewTransport } from "./public-preview";
import { Action, Form } from "@/components/controls";
import type { JobRemoval, JobRemovalResult } from "./models";

const removalA = "a".repeat(32);
const removalB = "b".repeat(32);
const removalKey = (id = "job-a", revision = "test-version") =>
  `employment-agency:fictional-removals:${revision}:job:${id}`;
const removal = (id = removalA): JobRemoval => ({
  id,
  at: "2026-11-07T01:00:00.000Z",
  reason: "",
});

const bundle = () => ({
  schema: 1,
  public_preview: true,
  revision: "test-version",
  state: {
    identity: { name: "Alex Morgan" },
    facts: [],
    profiles: [],
    jobs: [
      {
        id: "job-a",
        title: "Engineer",
        employer: "Fictional Labs",
        saved: false,
      },
      {
        id: "job-b",
        title: "Platform Engineer",
        employer: "Fictional Cloud",
        saved: false,
      },
    ],
    applications: [{ id: "application-a", status: "submitted" }],
    _workspace: { path: "public-fictional-preview", demo: true },
  },
  rankings: {
    "profile-a": [
      {
        job: { id: "job-a", saved: false },
        match: { gaps: ["Unconfirmed requirement"] },
      },
      { job: { id: "job-b", saved: false }, match: { gaps: [] } },
    ],
  },
  history: [{ id: "history-a", files: ["resume.pdf"] }],
  files: {
    "application:application-a:resume.pdf": "/demo/files/aa.pdf",
    "history:history-a:resume.pdf": "/demo/files/aa.pdf",
  },
  documents: {
    "application-a": {
      resume: { base: "verified-manifest", url: "/demo/files/aa.pdf" },
    },
  },
});

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/demo/preview.json")
        return new Response(JSON.stringify(bundle()), { status: 200 });
      if (url === "/demo/files/aa.pdf")
        return new Response("%PDF-1.4\nFictional sample profile", {
          status: 200,
        });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("connects without authentication, runtime API calls or credentials", async () => {
  const { client, signedIn } = await connect();
  expect(signedIn).toBe(true);
  expect(client.preview).toBe(true);
  expect(client.hosted).toBe(false);
  expect(client.auth).toBeUndefined();
  const state = await client.state();
  expect(state.state.identity.name).toBe("Alex Morgan");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/demo/preview.json", expect.any(Object));
});

it("preserves the normal local API transport when the build flag is absent", async () => {
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/runtime")
        return new Response(JSON.stringify({ mode: "local" }));
      if (url === "/api/state")
        return new Response(
          JSON.stringify({ state: bundle().state, token: "normal-token" }),
        );
      if (url === "/api/rank")
        return new Response(JSON.stringify({ result: [] }));
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  const { client } = await connect();
  expect(client.preview).toBe(false);
  await client.state();
  await client.action("rank", { profile_id: "normal-profile" });
  const request = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => url === "/api/rank")!;
  expect(request[1]?.method).toBe("POST");
  expect((request[1]?.headers as Headers).get("X-Workspace-Token")).toBe(
    "normal-token",
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).startsWith("/demo/")),
  ).toBe(false);
});

it("persists only known boolean bookmarks while keeping the Service ranking and decisions fixed", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  await client.state();
  await client.action("save-job", { id: "job-a", saved: true });
  const second = new ApiClient(false, undefined, new PublicPreviewTransport());
  expect((await second.state()).state.jobs[0].saved).toBe(true);
  const rows = await second.action<
    { job: { saved: boolean }; match: { gaps: string[] } }[]
  >("rank", { profile_id: "profile-a" });
  expect(rows[0].job.saved).toBe(true);
  expect(rows[0].match.gaps).toEqual(["Unconfirmed requirement"]);
  expect(localStorage.key(0)).toBe(
    "employment-agency:fictional-bookmarks:test-version:job:job-a",
  );
  expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!)).toBe(true);
  await expect(
    second.action("save-job", { id: "job-a", saved: "yes" }),
  ).rejects.toThrow(/true or false/);
  await expect(
    second.action("save-job", { id: "unlisted", saved: true }),
  ).rejects.toThrow();
  expect((await second.state()).state.applications[0].status).toBe("submitted");
});

it("keeps independent role writes from already loaded tabs and reads their latest choices", async () => {
  const first = new ApiClient(false, undefined, new PublicPreviewTransport());
  const second = new ApiClient(false, undefined, new PublicPreviewTransport());
  await Promise.all([first.state(), second.state()]);
  await first.action("save-job", { id: "job-a", saved: true });
  await second.action("save-job", { id: "job-b", saved: true });
  const reloaded = new ApiClient(
    false,
    undefined,
    new PublicPreviewTransport(),
  );
  expect((await reloaded.state()).state.jobs.map((job) => job.saved)).toEqual([
    true,
    true,
  ]);
  expect((await first.state()).state.jobs.map((job) => job.saved)).toEqual([
    true,
    true,
  ]);
  const ranked = await first.action<{ job: { saved: boolean } }[]>("rank", {
    profile_id: "profile-a",
  });
  expect(ranked.map((row) => row.job.saved)).toEqual([true, true]);
  await second.action("save-job", { id: "job-a", saved: false });
  expect((await first.state()).state.jobs.map((job) => job.saved)).toEqual([
    false,
    true,
  ]);
});

it("reads legacy whole-map bookmarks without rewriting them during new per-role writes", async () => {
  const legacyKey = "employment-agency:fictional-bookmarks:test-version";
  localStorage.setItem(legacyKey, JSON.stringify({ "job-a": true }));
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  expect((await client.state()).state.jobs[0].saved).toBe(true);
  await client.action("save-job", { id: "job-b", saved: true });
  expect(JSON.parse(localStorage.getItem(legacyKey)!)).toEqual({
    "job-a": true,
  });
  expect((await client.state()).state.jobs.map((job) => job.saved)).toEqual([
    true,
    true,
  ]);
});

it("keeps session-local bookmark interaction when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Unavailable", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Unavailable", "QuotaExceededError");
  });
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  expect((await client.state()).state.jobs[0].saved).toBe(false);
  await client.action("save-job", { id: "job-a", saved: true });
  expect((await client.state()).state.jobs[0].saved).toBe(true);
  const ranked = await client.action<{ job: { saved: boolean } }[]>("rank", {
    profile_id: "profile-a",
  });
  expect(ranked[0].job.saved).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("persists removals and reasons across reloads without changing bookmarks, applications or history", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  await client.action("save-job", { id: "job-a", saved: true });
  const removed = await client.action<JobRemovalResult>("remove-job", {
    id: "job-a",
    removal_id: removalA,
  });
  expect(removed).toEqual({
    id: "job-a",
    removals: [{ id: removalA, at: expect.any(String), reason: "" }],
  });
  const reason = await client.action<JobRemovalResult>("job-removal-reason", {
    id: "job-a",
    removal_id: removalA,
    comment: "  Different career direction\n  ",
  });
  expect(reason.removals[0]).toEqual({
    ...removed.removals[0],
    reason: "Different career direction",
    reason_updated_at: expect.any(String),
  });
  expect(JSON.parse(localStorage.getItem(removalKey())!)).toEqual(
    reason.removals,
  );

  const reloaded = new ApiClient(
    false,
    undefined,
    new PublicPreviewTransport(),
  );
  const state = (await reloaded.state()).state;
  expect(state.jobs[0]).toMatchObject({
    saved: true,
    removals: reason.removals,
  });
  expect(state.jobs[1].removals).toEqual([]);
  expect(state.applications).toEqual(bundle().state.applications);
  expect(await reloaded.action("history")).toEqual(bundle().history);
  const ranked = await reloaded.action<{ job: { removals: JobRemoval[] } }[]>(
    "rank",
    { profile_id: "profile-a" },
  );
  expect(ranked[0].job.removals).toEqual(reason.removals);

  const restored = await reloaded.action<JobRemovalResult>("restore-job", {
    id: "job-a",
    removal_id: removalA,
  });
  expect(restored.removals).toEqual([
    { ...reason.removals[0], restored_at: expect.any(String) },
  ]);
  expect((await reloaded.state()).state.jobs[0]).toMatchObject({
    saved: true,
    removals: restored.removals,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps retries idempotent and stale Undo bound to its historical removal", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-11-07T01:00:00Z");
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  const firstRequest = { id: "job-a", removal_id: removalA };
  const secondRequest = { id: "job-a", removal_id: removalB };
  const removed = await client.action<JobRemovalResult>(
    "remove-job",
    firstRequest,
  );
  vi.setSystemTime("2026-11-07T02:00:00Z");
  expect(await client.action("remove-job", firstRequest)).toEqual(removed);
  await expect(client.action("remove-job", secondRequest)).rejects.toThrow(
    /already removed/,
  );
  const restored = await client.action<JobRemovalResult>(
    "restore-job",
    firstRequest,
  );
  vi.setSystemTime("2026-11-07T03:00:00Z");
  expect(await client.action("restore-job", firstRequest)).toEqual(restored);
  const removedAgain = await client.action<JobRemovalResult>(
    "remove-job",
    secondRequest,
  );
  vi.setSystemTime("2026-11-07T04:00:00Z");
  expect(await client.action("remove-job", firstRequest)).toEqual(removedAgain);
  expect(await client.action("restore-job", firstRequest)).toEqual(
    removedAgain,
  );
  expect(removedAgain.removals[1].restored_at).toBeUndefined();

  const historicalReason = await client.action<JobRemovalResult>(
    "job-removal-reason",
    { ...firstRequest, comment: "Keep this historical explanation" },
  );
  expect(historicalReason.removals[0]).toMatchObject({
    restored_at: restored.removals[0].restored_at,
    reason: "Keep this historical explanation",
  });
  expect(historicalReason.removals[1]).toEqual(removedAgain.removals[1]);
  vi.setSystemTime("2026-11-07T05:00:00Z");
  expect(
    await client.action("job-removal-reason", {
      ...firstRequest,
      comment: "  Keep this historical explanation  ",
    }),
  ).toEqual(historicalReason);
  const cleared = await client.action<JobRemovalResult>("job-removal-reason", {
    ...firstRequest,
    comment: "",
  });
  expect(cleared.removals[0].reason).toBe("");
  expect(cleared.removals[1].restored_at).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves independent removal writes and reads the latest history from already loaded tabs", async () => {
  const first = new ApiClient(false, undefined, new PublicPreviewTransport());
  const second = new ApiClient(false, undefined, new PublicPreviewTransport());
  await Promise.all([first.state(), second.state()]);
  await first.action("remove-job", { id: "job-a", removal_id: removalA });
  await second.action("remove-job", { id: "job-b", removal_id: removalB });
  await second.action("save-job", { id: "job-a", saved: true });
  await first.action("job-removal-reason", {
    id: "job-a",
    removal_id: removalA,
    comment: "Saved separately from the bookmark",
  });
  const restored = await second.action<JobRemovalResult>("restore-job", {
    id: "job-a",
    removal_id: removalA,
  });
  expect(restored.removals[0]).toMatchObject({
    reason: "Saved separately from the bookmark",
    restored_at: expect.any(String),
  });
  expect((await first.state()).state.jobs).toEqual(
    (await second.state()).state.jobs,
  );
  const reloaded = new ApiClient(
    false,
    undefined,
    new PublicPreviewTransport(),
  );
  const jobs = (await reloaded.state()).state.jobs;
  expect(jobs[0]).toMatchObject({ saved: true, removals: restored.removals });
  expect(jobs[1].removals).toEqual([
    { id: removalB, at: expect.any(String), reason: "" },
  ]);
  expect(localStorage.getItem(removalKey("job-b"))).not.toBeNull();
});

it("isolates the overlay by fixture revision and reads fixture history for ranking rows", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  await client.action("remove-job", { id: "job-a", removal_id: removalA });
  const nextFixture = bundle();
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ...nextFixture,
        revision: "next-version",
        state: {
          ...nextFixture.state,
          jobs: nextFixture.state.jobs.map((job) => ({
            ...job,
            removals: job.id === "job-b" ? [removal(removalB)] : [],
          })),
        },
      }),
    ),
  );
  const next = new ApiClient(false, undefined, new PublicPreviewTransport());
  expect((await next.state()).state.jobs.map((job) => job.removals)).toEqual([
    [],
    [removal(removalB)],
  ]);
  const ranked = await next.action<{ job: { removals: JobRemoval[] } }[]>(
    "rank",
    { profile_id: "profile-a" },
  );
  expect(ranked.map((row) => row.job.removals)).toEqual([
    [],
    [removal(removalB)],
  ]);
  await next.action("remove-job", { id: "job-a", removal_id: removalB });
  expect((await client.state()).state.jobs[0].removals?.[0].id).toBe(removalA);
  expect(
    localStorage.getItem(removalKey("job-a", "next-version")),
  ).not.toBeNull();
});

it.each([
  ["broken JSON", "{"],
  ["null", "null"],
  ["object", "{}"],
  ["nested array", "[[]]"],
  ["missing reason", JSON.stringify([{ id: removalA, at: removal().at }])],
  ["invalid ID", JSON.stringify([{ ...removal(), id: "wrong" }])],
  ["invalid date", JSON.stringify([{ ...removal(), at: "yesterday" }])],
  [
    "invalid restoration",
    JSON.stringify([{ ...removal(), restored_at: true }]),
  ],
  [
    "invalid reason date",
    JSON.stringify([{ ...removal(), reason_updated_at: null }]),
  ],
  ["invalid reason", JSON.stringify([{ ...removal(), reason: false }])],
  [
    "oversize reason",
    JSON.stringify([{ ...removal(), reason: "x".repeat(4001) }]),
  ],
  ["NUL reason", JSON.stringify([{ ...removal(), reason: "hidden\0text" }])],
  [
    "duplicate IDs",
    JSON.stringify([{ ...removal(), restored_at: removal().at }, removal()]),
  ],
  ["multiple active events", JSON.stringify([removal(), removal(removalB)])],
])("ignores malformed stored removal history: %s", async (_name, raw) => {
  localStorage.setItem(removalKey(), raw);
  localStorage.setItem(
    removalKey("job-b"),
    JSON.stringify([removal(removalB)]),
  );
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  expect((await client.state()).state.jobs.map((job) => job.removals)).toEqual([
    [],
    [removal(removalB)],
  ]);
  await client.action("remove-job", { id: "job-a", removal_id: removalA });
  expect((await client.state()).state.jobs[0].removals?.[0].id).toBe(removalA);
});

it("rejects invalid removal requests and unknown events without changing state or forwarding requests", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  const initial = await client.state();
  for (const action of ["remove-job", "restore-job", "job-removal-reason"]) {
    for (const request of [
      { id: "unlisted", removal_id: removalA, comment: "reason" },
      { id: "__proto__", removal_id: removalA, comment: "reason" },
      { id: "job-a", removal_id: "invalid", comment: "reason" },
      { id: "job-a", removal_id: removalA.toUpperCase(), comment: "reason" },
      { id: "job-a", removal_id: 123, comment: "reason" },
    ])
      await expect(client.action(action, request)).rejects.toThrow();
  }
  for (const action of ["restore-job", "job-removal-reason"])
    await expect(
      client.action(action, {
        id: "job-a",
        removal_id: removalA,
        comment: "reason",
      }),
    ).rejects.toThrow(/could not be found/);
  expect(await client.state()).toEqual(initial);

  await client.action("remove-job", { id: "job-a", removal_id: removalA });
  const removed = await client.state();
  for (const comment of [undefined, null, false, [], "x".repeat(4001), "a\0b"])
    await expect(
      client.action("job-removal-reason", {
        id: "job-a",
        removal_id: removalA,
        comment,
      }),
    ).rejects.toThrow(/plain text/);
  expect(await client.state()).toEqual(removed);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "keeps removal, reason and restore in memory when writes fail (reads unavailable: %s)",
  async (readsUnavailable) => {
    // When reads remain available, an old stored value must not win over a failed write.
    localStorage.setItem(removalKey(), JSON.stringify([]));
    if (readsUnavailable)
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("Unavailable", "SecurityError");
      });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Unavailable", "QuotaExceededError");
    });
    const client = new ApiClient(
      false,
      undefined,
      new PublicPreviewTransport(),
    );
    expect((await client.state()).state.jobs[0].removals).toEqual([]);
    await client.action("remove-job", { id: "job-a", removal_id: removalA });
    await client.action("job-removal-reason", {
      id: "job-a",
      removal_id: removalA,
      comment: "Retained in this session",
    });
    expect((await client.state()).state.jobs[0].removals?.[0]).toMatchObject({
      id: removalA,
      reason: "Retained in this session",
    });
    const restored = await client.action<JobRemovalResult>("restore-job", {
      id: "job-a",
      removal_id: removalA,
    });
    expect(restored.removals[0]).toMatchObject({
      reason: "Retained in this session",
      restored_at: expect.any(String),
    });
    const ranked = await client.action<{ job: { removals: JobRemoval[] } }[]>(
      "rank",
      { profile_id: "profile-a" },
    );
    expect(ranked[0].job.removals).toEqual(restored.removals);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("fails closed for every private mutation or provider operation without network forwarding", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  await client.state();
  for (const operation of [
    "local-package",
    "review",
    "import",
    "identity",
    "save-document",
    "preview-document",
    "apply-start",
    "consent",
    "run",
    "workspace-browse",
    "export",
    "delete-account",
  ]) {
    await expect(
      client.action(operation, {
        text: "private input must not leave the browser",
      }),
    ).rejects.toThrow(PREVIEW_READ_ONLY);
  }
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("returns actual static PDFs in view mode and maps downloads under demo only", async () => {
  const client = new ApiClient(false, undefined, new PublicPreviewTransport());
  await client.state();
  const document = await client.action<{
    mode: string;
    pdf: string;
    notice: string;
  }>("document-editor", { id: "application-a", document: "resume" });
  expect(document.mode).toBe("view");
  expect(atob(document.pdf)).toContain("%PDF-1.4");
  expect(document.notice).toContain("fictional");
  expect(client.previewFileUrl("application-a", "resume.pdf")).toBe(
    "/demo/files/aa.pdf",
  );
  expect(client.previewFileUrl("history-a", "resume.pdf", true)).toBe(
    "/demo/files/aa.pdf",
  );
  expect(
    client.previewFileUrl("application-a", "../../private"),
  ).toBeUndefined();
  await expect(
    client.action("document-editor", {
      id: "__proto__",
      document: "constructor",
    }),
  ).rejects.toThrow();
});

it("explicitly disables mutation forms/actions while allowing preview interactions", async () => {
  const mutate = vi.fn(async () => {});
  const supported = vi.fn(async () => {});
  render(
    <>
      <Form onSave={mutate}>
        <label>
          Personal detail
          <input name="name" />
        </label>
        <button>Save details</button>
      </Form>
      <Action run={mutate}>Prepare application</Action>
      <Action previewAllowed run={supported}>
        Save example role
      </Action>
    </>,
  );
  expect(
    screen.getByRole("textbox", { name: "Personal detail" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Prepare application" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save example role" }));
  await waitFor(() => expect(supported).toHaveBeenCalledTimes(1));
  expect(mutate).not.toHaveBeenCalled();
});
