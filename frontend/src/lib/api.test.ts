import { describe, expect, it, vi } from "vitest";
import { ApiClient, WorkspaceChangedError } from "./api";
import { HostedAuth } from "./auth";

const envelope = (path = "/fictional/workspace", token = "fixture-token") => ({
  state: { _workspace: { path }, applications: [] },
  token,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("API transport", () => {
  it("attaches the current local token to mutations and surfaces server errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(envelope()))
      .mockResolvedValueOnce(json({ error: "Master changed" }, 400));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient(false);
    await client.state();
    await expect(client.action("local-package", { id: "job" })).rejects.toThrow(
      "Master changed",
    );
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe("/api/local-package");
    expect(options.headers.get("X-Workspace-Token")).toBe("fixture-token");
    expect(options.headers.has("Authorization")).toBe(false);
  });

  it("drops a response from the previous workspace", async () => {
    let complete!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(envelope()))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(json(envelope("/another/workspace", "new-token")));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient(false);
    await client.state();
    const pending = client.action("rank");
    await client.state();
    complete(json({ result: ["old-workspace-result"] }));
    await expect(pending).rejects.toBeInstanceOf(WorkspaceChangedError);
  });

  it("does not replace global fetch and explicitly authorizes hosted requests", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(envelope("Private cloud workspace", "")));
    vi.stubGlobal("fetch", fetch);
    const auth = new HostedAuth({
      url: "https://example.supabase.co",
      key: "public",
    });
    vi.spyOn(auth, "access").mockResolvedValue("fixture-access");
    const client = new ApiClient(true, auth);
    await client.state();
    expect(window.fetch).toBe(fetch);
    expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer fixture-access",
    );
  });

  it("rejects an invalid state envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ state: {} })));
    await expect(new ApiClient(false).state()).rejects.toThrow(
      "Invalid workspace response",
    );
  });
});

describe("hosted session refresh", () => {
  it("shares one refresh between concurrent requests", async () => {
    sessionStorage.setItem(
      "ea-cloud-session",
      JSON.stringify({
        access_token: "expired",
        refresh_token: "refresh",
        expires_at: 1,
      }),
    );
    let complete!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    const fetch = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetch);
    const auth = new HostedAuth({
      url: "https://example.supabase.co",
      key: "public",
    });
    await auth.initialize();
    const pending = Promise.all([auth.access(), auth.access()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      refresh_token: "refresh",
    });
    complete(
      json({
        access_token: "new-access",
        refresh_token: "next-refresh",
        expires_in: 3600,
      }),
    );
    expect(await pending).toEqual(["new-access", "new-access"]);
    await expect(auth.access()).resolves.toBe("new-access");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a failed session for an explicit retry and reports sign-in failure", async () => {
    const expired = JSON.stringify({
      access_token: "expired",
      refresh_token: "refresh",
      expires_at: 1,
    });
    sessionStorage.setItem("ea-cloud-session", expired);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(
        json({
          access_token: "retried-access",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const auth = new HostedAuth({
      url: "https://example.supabase.co",
      key: "public",
    });
    await auth.initialize();
    await expect(auth.access()).rejects.toThrow("sign in again");
    expect(sessionStorage.getItem("ea-cloud-session")).toBe(expired);
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(auth.access()).resolves.toBe("retried-access");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      refresh_token: "refresh",
    });
    expect(
      JSON.parse(sessionStorage.getItem("ea-cloud-session")!),
    ).toMatchObject({
      access_token: "retried-access",
      refresh_token: "rotated-refresh",
    });
  });
});

it("returns exact verified document bytes and rejects a read from the previous workspace", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45]);
  let complete!: (response: Response) => void;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json(envelope()))
    .mockResolvedValueOnce(new Response(bytes))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce(json(envelope("/another/workspace", "new-token")));
  vi.stubGlobal("fetch", fetch);
  const client = new ApiClient(false);
  await client.state();
  await expect(
    client.readDocument("exact-version", "resume.pdf"),
  ).resolves.toEqual(bytes);
  const [url, request] = fetch.mock.calls[1];
  expect(url).toBe("/api/file");
  expect(request.headers.get("X-Workspace-Token")).toBe("fixture-token");
  expect(JSON.parse(request.body)).toEqual({
    id: "exact-version",
    name: "resume.pdf",
  });
  const pending = client.readDocument("old-version", "resume.pdf");
  await client.state();
  complete(new Response(bytes));
  await expect(pending).rejects.toBeInstanceOf(WorkspaceChangedError);
});
