"use client";

import { useId, useLayoutEffect, useRef, type FormEvent } from "react";
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
  feedback?: RemovalFeedbackState;
  editor?: RemovalReasonEditor;
  onUndo: () => void;
  onAddReason: () => void;
  onRetryRemoval: () => void;
  onDismiss: () => void;
  onNoticeInteractionChange?: (held: boolean) => void;
  onChangeReason: (value: string) => void;
  onSaveReason: () => void;
  onCloseReason: () => void;
}

function jobLabel(job: RemovalFeedbackJob) {
  const title = job.title.trim() || "Untitled opportunity";
  return job.employer.trim() ? `${title} · ${job.employer.trim()}` : title;
}

export function RemovalFeedback({
  feedback,
  editor,
  onUndo,
  onAddReason,
  onRetryRemoval,
  onDismiss,
  onNoticeInteractionChange,
  onChangeReason,
  onSaveReason,
  onCloseReason,
}: RemovalFeedbackProps) {
  const reasonHeading = useId();
  const reasonError = useId();
  const notice = useRef<HTMLElement>(null);
  const noticeId = feedback?.removalId;
  const noticeStatus = feedback?.status;
  useLayoutEffect(() => {
    const element = notice.current;
    if (!element || !onNoticeInteractionChange) return;
    let hovered = element.matches(":hover");
    let focused = element.contains(document.activeElement);
    const update = () => onNoticeInteractionChange(hovered || focused);
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovered = true;
      update();
    };
    const leave = () => {
      hovered = false;
      update();
    };
    const focus = () => {
      focused = true;
      update();
    };
    const blur = (event: FocusEvent) => {
      focused =
        event.relatedTarget instanceof Node &&
        element.contains(event.relatedTarget);
      update();
    };
    update();
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", blur);
    return () => {
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", blur);
      onNoticeInteractionChange(false);
    };
  }, [noticeId, noticeStatus, onNoticeInteractionChange]);
  if (!feedback && !editor) return null;

  const saveReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor?.saving) onSaveReason();
  };

  return (
    <div className="removal-feedback">
      {feedback && (
        <section
          key={feedback.removalId}
          ref={notice}
          className="removal-feedback-notice"
          aria-label="Opportunity removal"
          data-job-id={feedback.job.id}
          data-removal-id={feedback.removalId}
        >
          <div className="removal-feedback-message">
            <p
              role={feedback.status === "error" ? "alert" : "status"}
              aria-atomic="true"
            >
              {feedback.status === "removing" && "Removing "}
              {feedback.status === "removed" && "Removed "}
              {feedback.status === "restoring" && "Restoring "}
              {feedback.status === "restored" && "Restored "}
              {feedback.status === "error" && "Couldn’t update "}
              <strong>{jobLabel(feedback.job)}</strong>.
              {feedback.status === "error" && feedback.error && (
                <>
                  {" "}
                  <span className="removal-feedback-error">
                    {feedback.error}
                  </span>
                </>
              )}
            </p>
            <div className="removal-feedback-actions">
              {(feedback.status === "removing" ||
                feedback.status === "removed") && (
                <Action
                  previewAllowed
                  keepContentWhileBusy
                  run={async () => onUndo()}
                >
                  Undo
                </Action>
              )}
              {feedback.status === "removed" && (
                <Action
                  previewAllowed
                  keepContentWhileBusy
                  run={async () => onAddReason()}
                >
                  Add reason
                </Action>
              )}
              {feedback.status === "error" && (
                <Action
                  previewAllowed
                  keepContentWhileBusy
                  run={async () => onRetryRemoval()}
                >
                  Retry
                </Action>
              )}
            </div>
          </div>
          <Action
            className="secondary removal-feedback-close"
            aria-label="Dismiss removal feedback"
            previewAllowed
            keepContentWhileBusy
            run={async () => onDismiss()}
          >
            <X aria-hidden="true" />
          </Action>
        </section>
      )}
      {editor && (
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
      )}
    </div>
  );
}
