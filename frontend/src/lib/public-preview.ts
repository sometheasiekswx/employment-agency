import type {
  HistoryVersion,
  RankedJob,
  RequestData,
  StateResponse,
  WorkspaceState,
} from "./models";

export const publicPreviewEnabled = () =>
  process.env.NEXT_PUBLIC_EA_PUBLIC_PREVIEW === "1";
export const PREVIEW_READ_ONLY =
  "This fictional public preview is read-only. Use the local app to import career data, prepare documents or record real decisions.";

interface PublicPreviewBundle {
  public_preview: true;
  schema: 1;
  revision: string;
  state: WorkspaceState;
  rankings: Record<string, RankedJob[]>;
  history: HistoryVersion[];
  files: Record<string, string>;
  documents: Record<string, Record<string, { base: string; url: string }>>;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const clone = <T>(value: T): T => structuredClone(value);

/** Static Service-produced data; only a browser-local bookmark overlay mutates. */
export class PublicPreviewTransport {
  private bundle?: PublicPreviewBundle;
  private loading?: Promise<PublicPreviewBundle>;
  private bookmarks: Record<string, boolean> = {};
  private sessionOnly = new Set<string>();

  private async load() {
    if (this.bundle) return this.bundle;
    if (!this.loading)
      this.loading = this.readBundle().catch((error) => {
        this.loading = undefined;
        throw error;
      });
    return this.loading;
  }

  private async readBundle() {
    const response = await fetch("/demo/preview.json", { cache: "no-store" });
    if (!response.ok)
      throw new Error("The fictional preview could not load. Please reload.");
    const bundle = (await response.json()) as PublicPreviewBundle;
    if (
      bundle.public_preview !== true ||
      bundle.schema !== 1 ||
      !bundle.state?._workspace?.demo ||
      !Array.isArray(bundle.state.jobs) ||
      !Array.isArray(bundle.state.applications)
    )
      throw new Error("Invalid public preview snapshot.");
    if (
      Object.values(bundle.files).some(
        (url) => !/^\/demo\/files\/[a-f0-9]+\.[a-z0-9]+$/.test(url),
      )
    )
      throw new Error("Invalid preview document path.");
    this.bundle = bundle;
    return bundle;
  }

  private storageKey() {
    return `employment-agency:fictional-bookmarks:${this.bundle!.revision}`;
  }
  private saved(id: string, fallback?: boolean) {
    if (this.sessionOnly.has(id)) return this.bookmarks[id];
    try {
      const raw = localStorage.getItem(`${this.storageKey()}:job:${id}`);
      if (raw !== null) {
        const value: unknown = JSON.parse(raw);
        if (typeof value === "boolean") return (this.bookmarks[id] = value);
      }
      // Older deployments stored one whole-map overlay. Read it as a fallback,
      // but never rewrite it: concurrent tabs now write independent role keys.
      const legacy: unknown = JSON.parse(
        localStorage.getItem(this.storageKey()) || "{}",
      );
      if (
        legacy &&
        typeof legacy === "object" &&
        !Array.isArray(legacy) &&
        Object.hasOwn(legacy, id)
      ) {
        const value = (legacy as Record<string, unknown>)[id];
        if (typeof value === "boolean") return (this.bookmarks[id] = value);
      }
      return fallback ?? false;
    } catch {
      return this.bookmarks[id] ?? fallback ?? false;
    }
  }

  fileUrl(id: string, name: string, history = false) {
    return this.bundle?.files[
      `${history ? "history" : "application"}:${id}:${name}`
    ];
  }

  async request(action: string, data?: RequestData) {
    const bundle = await this.load();
    if (action === "state") {
      const state = clone(bundle.state);
      state.jobs = state.jobs.map((job) => ({
        ...job,
        saved: this.saved(job.id, job.saved),
      }));
      return json({
        state,
        token: "public-fictional-preview",
      } satisfies StateResponse);
    }
    if (action === "rank") {
      const rows =
        typeof data?.profile_id === "string"
          ? bundle.rankings[data.profile_id]
          : undefined;
      if (!Array.isArray(rows))
        return json(
          { error: "Choose one of the fictional search profiles." },
          400,
        );
      return json({
        result: clone(rows).map((row) => ({
          ...row,
          job: { ...row.job, saved: this.saved(row.job.id, row.job.saved) },
        })),
      });
    }
    if (action === "history") return json({ result: clone(bundle.history) });
    if (action === "save-job") {
      const id = data?.id;
      if (
        typeof id !== "string" ||
        !bundle.state.jobs.some((job) => job.id === id) ||
        typeof data?.saved !== "boolean"
      )
        return json(
          {
            error:
              "Choose a fictional role and a true or false bookmark value.",
          },
          400,
        );
      this.bookmarks[id] = data.saved;
      try {
        localStorage.setItem(
          `${this.storageKey()}:job:${id}`,
          JSON.stringify(data.saved),
        );
        this.sessionOnly.delete(id);
      } catch {
        this.sessionOnly.add(id);
      }
      return json({ result: { id, saved: data.saved } });
    }
    if (action === "document-editor") {
      const id = typeof data?.id === "string" ? data.id : "";
      const stem = typeof data?.document === "string" ? data.document : "";
      const document =
        Object.hasOwn(bundle.documents, id) &&
        (stem === "resume" || stem === "cover-letter")
          ? bundle.documents[id]?.[stem]
          : undefined;
      if (!document || this.fileUrl(id, `${stem}.pdf`) !== document.url)
        return json({ error: "Fictional document not found." }, 404);
      const response = await fetch(document.url);
      if (!response.ok)
        return json({ error: "The example PDF could not load." }, 404);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return json({
        result: {
          id,
          document: stem,
          base: document.base,
          mode: "view",
          pdf: btoa(binary),
          notice:
            "This is a generated fictional example. Editing and new document generation are available in the local app.",
        },
      });
    }
    // Never forward an unknown action, submission or provider request to a server.
    return json({ error: PREVIEW_READ_ONLY }, 405);
  }
}
