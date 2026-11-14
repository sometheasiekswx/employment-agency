"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
} from "react";
import { useNotifications } from "@/components/notification-center";
import { X } from "lucide-react";
import { Action, TextArea } from "@/components/controls";
import "./removal-feedback.css";

export interface RemovalFeedbackJob {
  id: string;
  title: string;
  employer: string;
}

export interface RemovalFeedbackState {
  job: RemovalFeedbackJob;
  removalId: string;
  status: "removing" | "removed" | "restoring" | "restored" | "error";
  error?: string;
}

export interface RemovalReasonEditor {
  job: RemovalFeedbackJob;
  removalId: string;
  value: string;
  saving: boolean;
  error?: string;
}

export interface RemovalFeedbackProps {
  editor?: RemovalReasonEditor;
  onChangeReason: (value: string) => void;
  onSaveReason: () => void;
  onCloseReason: () => void;
}

function jobLabel(job: RemovalFeedbackJob) {
  const title = job.title.trim() || "Untitled opportunity";
  return job.employer.trim() ? `${title} · ${job.employer.trim()}` : title;
}

export function RemovalNotice({
  feedback,
  onUndo,
  onAddReason,
  onRetryRemoval,
  onDismiss,
  onNoticeInteractionChange,
}: {
  feedback?: RemovalFeedbackState;
  onUndo: () => void;
  onAddReason: () => void;
  onRetryRemoval: () => void;
  onDismiss: () => void;
  onNoticeInteractionChange: (held: boolean) => void;
}) {
  const { setNotification, removeNotification } = useNotifications();
  const actions = useRef({ onUndo, onAddReason, onRetryRemoval, onDismiss });
  useLayoutEffect(() => {
    actions.current = { onUndo, onAddReason, onRetryRemoval, onDismiss };
  }, [onUndo, onAddReason, onRetryRemoval, onDismiss]);
  const id = feedback && `removal:${feedback.removalId}`;
  useEffect(
    () => () => {
      if (id) removeNotification(id);
    },
    [id, removeNotification],
  );

  useLayoutEffect(() => {
    if (!feedback || !id) return;
    const verbs = {
      removing: "Removing",
      removed: "Removed",
      restoring: "Restoring",
      restored: "Restored",
      error: "Couldn’t update",
    };
    const { status, job, removalId, error } = feedback;
    const buttons = [];
    if (status === "removing" || status === "removed")
      buttons.push({ label: "Undo", run: () => actions.current.onUndo() });
    if (status === "removed")
      buttons.push({
        label: "Add reason",
        run: () => actions.current.onAddReason(),
      });
    if (status === "error")
      buttons.push({
        label: "Retry",
        run: () => actions.current.onRetryRemoval(),
      });
    setNotification(id, {
      kind:
        status === "error"
          ? "error"
          : status === "restored"
            ? "success"
            : "undo",
      message: `${verbs[status]} ${jobLabel(job)}.${error ? ` ${error}` : ""}`,
      label: "Opportunity removal",
      dismissLabel: "Dismiss removal feedback",
      onDismiss: () => actions.current.onDismiss(),
      actions: buttons.length ? buttons : undefined,
      externallyTimed: true,
      onInteraction: onNoticeInteractionChange,
      jobId: job.id,
      removalId,
    });
  }, [feedback, id, setNotification, onNoticeInteractionChange]);
  return null;
}

export function RemovalRecovery({
  failure,
  dismiss,
}: {
  failure?: { feedback: RemovalFeedbackState; retry: () => Promise<boolean> };
  dismiss: () => void;
}) {
  if (!failure) return null;
  return (
    <div className="removal-recovery">
      <p>
        Couldn’t update {jobLabel(failure.feedback.job)}.{" "}
        {failure.feedback.error}
      </p>
      <div className="removal-feedback-actions">
        <Action
          previewAllowed
          run={async () => {
            await failure.retry();
          }}
        >
          Retry role update
        </Action>
        <button type="button" className="secondary" onClick={dismiss}>
          Dismiss role update error
        </button>
      </div>
    </div>
  );
}

export function RemovalFeedback({
  editor,
  onChangeReason,
  onSaveReason,
  onCloseReason,
}: RemovalFeedbackProps) {
  const reasonHeading = useId();
  const reasonError = useId();
  if (!editor) return null;

  const saveReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor?.saving) onSaveReason();
  };

  return (
    <div className="removal-feedback">
      <form
        className="removal-reason-editor"
        aria-labelledby={reasonHeading}
        onSubmit={saveReason}
        data-job-id={editor.job.id}
        data-removal-id={editor.removalId}
      >
        <div className="removal-reason-heading">
          <div>
            <h3 id={reasonHeading}>Reason for removing</h3>
            <p>{jobLabel(editor.job)}</p>
          </div>
          <Action
            className="secondary removal-feedback-close"
            aria-label="Close reason editor"
            previewAllowed
            keepContentWhileBusy
            run={async () => onCloseReason()}
          >
            <X aria-hidden="true" />
          </Action>
        </div>
        <TextArea
          label="Removal reason (optional)"
          name="removal_reason"
          value={editor.value}
          onChange={(event) => onChangeReason(event.target.value)}
          maxLength={4000}
          rows={3}
          aria-describedby={editor.error ? reasonError : undefined}
        />
        {editor.error && (
          <p id={reasonError} role="alert" className="removal-feedback-error">
            {editor.error}
          </p>
        )}
        <div className="removal-reason-footer">
          <div className="removal-feedback-actions">
            <button type="submit" disabled={editor.saving}>
              {editor.error ? "Retry saving reason" : "Save reason"}
            </button>
            {editor.value && (
              <Action
                previewAllowed
                keepContentWhileBusy
                run={async () => onChangeReason("")}
              >
                Clear text
              </Action>
            )}
          </div>
          {editor.saving && <p role="status">Saving reason…</p>}
        </div>
      </form>
    </div>
  );
}
