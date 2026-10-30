import { HostedAuth } from "./auth";
import type { RequestData, StateResponse } from "./models";

export class WorkspaceChangedError extends Error {
  constructor() {
    super("Workspace changed. Reload before continuing.");
  }
}

/** One same-origin transport. Python remains the authority for every operation. */
export class ApiClient {
  private token = "";
  private workspace = "";
  private generation = 0;
  constructor(
    readonly hosted: boolean,
    readonly auth?: HostedAuth,
  ) {}

  private async request(action: string, data?: RequestData) {
    const headers = new Headers();
    if (this.auth)
      headers.set("Authorization", `Bearer ${await this.auth.access()}`);
    if (data !== undefined) {
      headers.set("Content-Type", "application/json");
      headers.set("X-Workspace-Token", this.token);
    }
    const response = await fetch(`/api/${action}`, {
      method: data === undefined ? "GET" : "POST",
      headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error || `Request failed (${response.status}). Please try again.`,
      );
    }
    return response;
  }

  async state(): Promise<StateResponse> {
    const generation = this.generation;
    const result = (await (
      await this.request("state")
    ).json()) as StateResponse;
    if (!result.state?._workspace || !Array.isArray(result.state.applications))
      throw new Error("Invalid workspace response. Please reload.");
    if (generation !== this.generation) throw new WorkspaceChangedError();
    if (this.workspace && this.workspace !== result.state._workspace.path)
      this.generation++;
    this.workspace = result.state._workspace.path;
    this.token = result.token;
    return result;
  }

  async action<T = unknown>(
    action: string,
    data: RequestData = {},
  ): Promise<T> {
    const generation = this.generation;
    const body = await (await this.request(action, data)).json();
    if (generation !== this.generation) throw new WorkspaceChangedError();
    if (body.result?.reload) this.generation++;
    return body.result as T;
  }

  async binary(action: string, data: RequestData = {}) {
    const generation = this.generation;
    const response = await this.request(action, data);
    const blob = await response.blob();
    if (generation !== this.generation) throw new WorkspaceChangedError();
    const filename = decodeURIComponent(
      (response.headers.get("Content-Disposition") || "").split("UTF-8''")[1] ||
        "download",
    );
    downloadBlob(blob, filename);
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const downloadJson = (name: string, value: unknown) =>
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    name,
  );

export async function connect(): Promise<{
  client: ApiClient;
  signedIn: boolean;
}> {
  const runtime = await fetch("/api/runtime", { cache: "no-store" });
  if (!runtime.ok)
    throw new Error("Cannot connect to the application. Please retry.");
  const { mode } = await runtime.json();
  if (mode === "local") return { client: new ApiClient(false), signedIn: true };
  if (mode !== "hosted") throw new Error("Unknown application mode.");
  const response = await fetch("/api/config", { cache: "no-store" });
  const config = await response.json();
  if (!response.ok)
    throw new Error(config.error || "Hosted configuration unavailable.");
  const auth = new HostedAuth(config);
  const signedIn = await auth.initialize();
  return { client: new ApiClient(true, auth), signedIn };
}
