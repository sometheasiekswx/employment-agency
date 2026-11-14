"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ApiClient } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { currentRemoval, removalId } from "@/lib/job-removal";
import type {
  Job,
  JobRemoval,
  JobRemovalResult,
  RequestData,
} from "@/lib/models";
import type {
  RemovalFeedbackState,
  RemovalReasonEditor,
} from "./removal-feedback";

type Overlay = { removals: JobRemoval[]; pending: boolean };
const feedbackDuration = 8_000;
const keyFor = (jobId: string, eventId: string) => `${jobId}:${eventId}`;

function includesReceipt(history: JobRemoval[], receipt: JobRemoval[]) {
  return receipt.every((entry) => {
    const current = history.find(({ id }) => id === entry.id);
    return (
      current &&
      (!entry.restored_at || current.restored_at) &&
      (current.reason === entry.reason ||
        (current.reason_updated_at &&
          current.reason_updated_at > (entry.reason_updated_at || "")))
    );
  });
}

/** Job-scoped triage, independent of application decisions and dirty documents. */
export function useJobRemoval({
  jobs,
  client,
  refresh,
}: {
  jobs: Job[];
  client: ApiClient;
  refresh: () => Promise<void>;
}) {
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({});
  const [feedback, setFeedback] = useState<RemovalFeedbackState>();
  const [feedbackHeld, setFeedbackHeld] = useState(false);
  const countdown = useRef<
    { feedback: RemovalFeedbackState; remaining: number } | undefined
  >(undefined);
  const [drafts, setDrafts] = useState<Record<string, RemovalReasonEditor>>({});
  const [editorKey, setEditorKey] = useState("");
  const revisions = useRef(new Map<string, number>());
  const confirmed = useRef(
    new Map(jobs.map((job) => [job.id, job.removals || []])),
  );
  const receipts = useRef(new Map<string, JobRemoval[]>());
  const queues = useRef(new Map<string, Promise<unknown>>());
  const retry = useRef<() => Promise<boolean>>(async () => false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    // A refresh started before a mutation may arrive just as its receipt does.
    // Keep that receipt visible until the provider has observed it.
    const acknowledged = new Set<string>();
    jobs.forEach((job) => {
      const history = job.removals || [];
      const receipt = receipts.current.get(job.id);
      if (
        queues.current.has(job.id) ||
        (receipt && !includesReceipt(history, receipt))
      )
        return;
      confirmed.current.set(job.id, history);
      receipts.current.delete(job.id);
      acknowledged.add(job.id);
    });
    setOverlays((previous) => {
      const pending = Object.entries(previous).filter(
        ([id, item]) => item.pending || !acknowledged.has(id),
      );
      return pending.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(pending);
    });
  }, [jobs]);

  const editingReason = Boolean(drafts[editorKey]);
  useLayoutEffect(() => {
    if (feedback?.status !== "removed" && feedback?.status !== "restored") {
      countdown.current = undefined;
      return;
    }
    if (countdown.current?.feedback !== feedback)
      countdown.current = { feedback, remaining: feedbackDuration };
    if (feedbackHeld || editingReason) return;

    const timer = countdown.current;
    const started = performance.now();
    const timeout = window.setTimeout(() => {
      setFeedback((current) => (current === feedback ? undefined : current));
    }, timer.remaining);
    return () => {
      window.clearTimeout(timeout);
      timer.remaining = Math.max(
        0,
        timer.remaining - (performance.now() - started),
      );
    };
  }, [feedback, feedbackHeld, editingReason]);

  const sync = () => {
    if (active.current) void refresh().catch(() => {});
  };

  const enqueue = (
    id: string,
    action: string,
    data: RequestData,
  ): Promise<JobRemovalResult> => {
    const previous = queues.current.get(id) || Promise.resolve();
    const request = previous
      .catch(() => {})
      .then(async () => {
        if (!active.current) throw new Error("Workspace changed.");
        return client.action<JobRemovalResult>(action, data);
      });
    queues.current.set(id, request);
    void request
      .finally(() => {
        if (queues.current.get(id) === request) queues.current.delete(id);
      })
      .catch(() => {});
    return request;
  };

  const jobWithRemoval = (job: Job): Job => ({
    ...job,
    removals: overlays[job.id]?.removals || job.removals,
  });

  const change = async (
    job: Job,
    event: JobRemoval,
    restore: boolean,
  ): Promise<boolean> => {
    const revision = (revisions.current.get(job.id) || 0) + 1;
    revisions.current.set(job.id, revision);
    const history = job.removals || [];
    const optimistic = restore
      ? history.map((item) =>
          item.id === event.id
            ? { ...item, restored_at: new Date().toISOString() }
            : item,
        )
      : history.some((item) => item.id === event.id)
        ? history
        : [...history, event];
    setOverlays((old) => ({
      ...old,
      [job.id]: { removals: optimistic, pending: true },
    }));
    const summary = { id: job.id, title: job.title, employer: job.employer };
    setFeedback({
      job: summary,
      removalId: event.id,
      status: restore ? "restoring" : "removing",
    });
    retry.current = () => change(job, event, restore);
    try {
      const result = await enqueue(
        job.id,
        restore ? "restore-job" : "remove-job",
        {
          id: job.id,
          removal_id: event.id,
        },
      );
      if (!active.current) return false;
      confirmed.current.set(job.id, result.removals);
      receipts.current.set(job.id, result.removals);
      if (revisions.current.get(job.id) === revision) {
        setOverlays((old) => ({
          ...old,
          [job.id]: { removals: result.removals, pending: false },
        }));
        const stillRemoved = currentRemoval(result);
        setFeedback((old) =>
          old?.job.id === job.id && old.removalId === event.id
            ? {
                ...old,
                status: stillRemoved ? "removed" : "restored",
                removalId: stillRemoved?.id || event.id,
              }
            : old,
        );
      }
      sync();
      return restore
        ? !currentRemoval(result)
        : Boolean(currentRemoval(result));
    } catch (error) {
      if (active.current && revisions.current.get(job.id) === revision) {
        setOverlays((old) => {
          const next = { ...old };
          const previous = confirmed.current.get(job.id);
          if (previous) next[job.id] = { removals: previous, pending: false };
          else delete next[job.id];
          return next;
        });
        setFeedback((old) =>
          old?.job.id === job.id && old.removalId === event.id
            ? { ...old, status: "error", error: errorMessage(error) }
            : old,
        );
        sync();
      }
      return false;
    }
  };

  const remove = (job: Job) =>
    change(
      job,
      {
        id: removalId(),
        at: new Date().toISOString(),
        reason: "",
      },
      false,
    );
  const restore = (job: Job, event = currentRemoval(job)) =>
    event ? change(job, event, true) : Promise.resolve(false);

  const addReason = (job: Job, event: JobRemoval) => {
    const key = keyFor(job.id, event.id);
    setDrafts((old) =>
      old[key]
        ? old
        : {
            ...old,
            [key]: {
              job: { id: job.id, title: job.title, employer: job.employer },
              removalId: event.id,
              value: event.reason,
              saving: false,
            },
          },
    );
    setEditorKey(key);
  };
  const saveReason = async () => {
    const draft = drafts[editorKey];
    if (!draft || draft.saving) return;
    const key = editorKey;
    const value = draft.value;
    const revision = revisions.current.get(draft.job.id) || 0;
    setDrafts((old) => ({
      ...old,
      [key]: { ...old[key], saving: true, error: "" },
    }));
    try {
      const result = await enqueue(draft.job.id, "job-removal-reason", {
        id: draft.job.id,
        removal_id: draft.removalId,
        comment: value,
      });
      if (!active.current) return;
      confirmed.current.set(draft.job.id, result.removals);
      receipts.current.set(draft.job.id, result.removals);
      if ((revisions.current.get(draft.job.id) || 0) === revision)
        setOverlays((old) => ({
          ...old,
          [draft.job.id]: { removals: result.removals, pending: false },
        }));
      setDrafts((old) => {
        const current = old[key];
        if (!current) return old;
        if (current.value !== value)
          return {
            ...old,
            [key]: { ...current, saving: false, error: "" },
          };
        // Clearing the saved draft closes only its own editor.
        const next = { ...old };
        delete next[key];
        return next;
      });
      sync();
    } catch (error) {
      if (active.current)
        setDrafts((old) => ({
          ...old,
          [key]: {
            ...old[key],
            saving: false,
            error: errorMessage(error),
          },
        }));
    }
  };

  const closeReason = useCallback(() => setEditorKey(""), []);
  return {
    jobWithRemoval,
    feedback,
    setFeedbackHeld,
    editor: drafts[editorKey],
    remove,
    restore,
    addReason,
    retry: () => retry.current(),
    dismiss: () => setFeedback(undefined),
    closeReason,
    changeReason: (value: string) =>
      setDrafts((old) => {
        const draft = old[editorKey];
        return draft
          ? { ...old, [editorKey]: { ...draft, value, error: "" } }
          : old;
      }),
    saveReason,
  };
}
