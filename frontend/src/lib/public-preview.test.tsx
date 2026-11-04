import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClient, connect } from "./api";
import { PREVIEW_READ_ONLY, PublicPreviewTransport } from "./public-preview";
import { Action, Form } from "@/components/controls";

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
afterEach(() => vi.unstubAllEnvs());

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
