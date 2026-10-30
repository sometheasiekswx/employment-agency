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
    const fetch = vi.fn().mockResolvedValue(
      json({
        access_token: "new-access",
        refresh_token: "next-refresh",
        expires_in: 3600,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const auth = new HostedAuth({
      url: "https://example.supabase.co",
      key: "public",
    });
    await auth.initialize();
    expect(await Promise.all([auth.access(), auth.access()])).toEqual([
      "new-access",
      "new-access",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
    );
  });

  it("preserves a failed session for an explicit retry and reports sign-in failure", async () => {
    sessionStorage.setItem(
      "ea-cloud-session",
      JSON.stringify({
        access_token: "expired",
        refresh_token: "refresh",
        expires_at: 1,
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    const auth = new HostedAuth({
      url: "https://example.supabase.co",
      key: "public",
    });
    await auth.initialize();
    await expect(auth.access()).rejects.toThrow("sign in again");
    expect(sessionStorage.getItem("ea-cloud-session")).not.toBeNull();
  });
});
