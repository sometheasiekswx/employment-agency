import type {
  HistoryVersion,
  Job,
  JobRemoval,
  RankedJob,
  RequestData,
  StateResponse,
  WorkspaceState,
} from "./models";
import { currentRemoval } from "./job-removal";
import { applicationRoleId } from "./format";

export const publicPreviewEnabled = () =>
  process.env.NEXT_PUBLIC_EA_PUBLIC_PREVIEW === "1";
export const PREVIEW_READ_ONLY =
  "This fictional public preview supports browser-local bookmarks, removals and reasons. Use the local app to import career data, prepare documents or record real application decisions.";

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
const validTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
const validReason = (value: unknown): value is string =>
  typeof value === "string" &&
  [...value].length <= 4000 &&
  !value.includes("\0");

function validRemovalHistory(value: unknown): value is JobRemoval[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((event, index) => {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      typeof event.id !== "string" ||
      !/^[a-f0-9]{32}$/.test(event.id) ||
      ids.has(event.id) ||
      !validTimestamp(event.at) ||
      !validReason(event.reason) ||
      (event.reason_updated_at !== undefined &&
        !validTimestamp(event.reason_updated_at)) ||
      (event.restored_at !== undefined && !validTimestamp(event.restored_at)) ||
      (index < value.length - 1 && !event.restored_at)
    )
      return false;
    ids.add(event.id);
    return true;
  });
}

/** Static Service-produced data with browser-local bookmarks and removal history. */
export class PublicPreviewTransport {
  private bundle?: PublicPreviewBundle;
  private loading?: Promise<PublicPreviewBundle>;
  private bookmarks: Record<string, boolean> = {};
  private sessionOnly = new Set<string>();
  private removals = new Map<string, JobRemoval[]>();
  private sessionOnlyRemovals = new Set<string>();

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
      typeof bundle.revision !== "string" ||
      !bundle.revision ||
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

  private removalStorageKey(id: string) {
    return `employment-agency:fictional-removals:${this.bundle!.revision}:job:${id}`;
  }

  private removalHistory(job: Pick<Job, "id" | "removals">): JobRemoval[] {
    const fallback = validRemovalHistory(job.removals) ? job.removals : [];
    if (this.sessionOnlyRemovals.has(job.id))
      return clone(this.removals.get(job.id) ?? fallback);
    try {
      const raw = localStorage.getItem(this.removalStorageKey(job.id));
      let value: unknown;
      try {
        value = raw === null ? undefined : JSON.parse(raw);
      } catch {
        // Invalid stored data cannot remove a role or manufacture history.
      }
      if (validRemovalHistory(value)) {
        this.removals.set(job.id, value);
        return clone(value);
      }
      return clone(fallback);
    } catch {
      return clone(this.removals.get(job.id) ?? fallback);
    }
  }

  private saveRemovalHistory(id: string, removals: JobRemoval[]) {
    this.removals.set(id, clone(removals));
    try {
      localStorage.setItem(
        this.removalStorageKey(id),
        JSON.stringify(removals),
      );
      this.sessionOnlyRemovals.delete(id);
    } catch {
      this.sessionOnlyRemovals.add(id);
    }
  }

  private localChoices(job: Job): Job {
    const source = this.bundle!.state.jobs.find((entry) => entry.id === job.id);
    return {
      ...job,
      saved: this.saved(job.id, source?.saved ?? job.saved),
      removals: this.removalHistory(source ?? job),
    };
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
      state.jobs = state.jobs.map((job) => this.localChoices(job));
      for (const app of state.applications) {
        if (app.status !== "rejected") continue;
        const job = state.jobs.find(
          (entry) => entry.id === applicationRoleId(app),
        );
        const original = bundle.state.jobs.find(
          (entry) => entry.id === job?.id,
        );
        const legacy = currentRemoval(original);
        const restored =
          legacy?.legacy_application_id === app.id
            ? job?.removals?.find((event) => event.id === legacy.id)
                ?.restored_at
            : undefined;
        if (restored) {
          app.status = "draft";
          delete app.archived;
          if (
            !app.comments.some(
              (entry) =>
                entry.status === "rejected" && entry.kind !== "comment",
            )
          )
            app.comments.push({
              at: "",
              status: "rejected",
              text: "Earlier rejection recorded for this application.",
            });
          app.comments.push({
            at: restored,
            status: "draft",
            text: "Restored from Removed.",
          });
        }
      }
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
          job: this.localChoices(row.job),
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
    if (
      action === "remove-job" ||
      action === "restore-job" ||
      action === "job-removal-reason"
    ) {
      const job = bundle.state.jobs.find((entry) => entry.id === data?.id);
      const removalId = data?.removal_id;
      if (
        !job ||
        typeof removalId !== "string" ||
        !/^[a-f0-9]{32}$/.test(removalId)
      )
        return json(
          { error: "Choose a fictional role and valid removal ID." },
          400,
        );
      if (action === "job-removal-reason" && !validReason(data?.comment))
        return json(
          { error: "Use plain text of up to 4000 characters for the reason." },
          400,
        );
      const removals = this.removalHistory(job);
      const event = removals.find((entry) => entry.id === removalId);
      let changed = false;
      if (action === "remove-job") {
        if (!event) {
          if (currentRemoval({ removals }))
            return json({ error: "This role is already removed." }, 409);
          removals.push({
            id: removalId,
            at: new Date().toISOString(),
            reason: "",
          });
          changed = true;
        }
      } else {
        if (!event)
          return json({ error: "This removal could not be found." }, 404);
        if (action === "restore-job") {
          if (!event.restored_at) {
            event.restored_at = new Date().toISOString();
            changed = true;
          }
        } else {
          const reason = (data!.comment as string).trim();
          if (event.reason !== reason) {
            event.reason = reason;
            event.reason_updated_at = new Date().toISOString();
            changed = true;
          }
        }
      }
      if (changed) this.saveRemovalHistory(job.id, removals);
      return json({ result: { id: job.id, removals } });
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
