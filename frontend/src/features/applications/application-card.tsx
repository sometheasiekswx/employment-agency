"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Action,
  Check,
  Field,
  Form,
  TextArea,
  checked,
  text,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { applicationHref, displayDate, safeUrl } from "@/lib/format";
import type { Application, EditorDocument, Job } from "@/lib/models";
import { FileLink } from "./file-link";
import { ApplicationDetails } from "./application-details";
import { ReviewStatus } from "./review-status";

const fileLabels = {
  "resume.pdf": "CV PDF",
  "cover-letter.pdf": "Cover letter PDF",
  "resume.docx": "Edit resume (Word)",
  "cover-letter.docx": "Edit cover letter (Word)",
  "resume.tex": "Resume LaTeX",
  "cover-letter.tex": "Cover letter LaTeX",
  "application.eml": "Email draft",
  "evidence.json": "Source evidence",
};

export function ApplicationCard({
  app,
  job,
  onEdit,
  onApply,
}: {
  app: Application;
  job: Partial<Job>;
  onEdit: (document: EditorDocument, opener: HTMLButtonElement) => void;
  onApply: (opener: HTMLButtonElement) => void;
}) {
  const { state, client, run } = useWorkspace();
  const [comment, setComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [decision, setDecision] = useState<"submit" | "correct">();
  const [decisionBusy, setDecisionBusy] = useState(false);
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  const decisionOpener = useRef<HTMLButtonElement | null>(null);
  const restoreDecisionFocus = useRef(false);
  const router = useRouter();
  const reviewForm = useId();
  const headingId = useId();
  const timezone = state._workspace.timezone;
  const original = app.submission_recovery
    ? state.applications?.find(
        (item) => item.id === app.submission_recovery?.original_id,
      )
    : undefined;
  useEffect(() => {
    if (decision) decisionHeading.current?.focus();
    else if (restoreDecisionFocus.current) {
      restoreDecisionFocus.current = false;
      decisionOpener.current?.focus();
    }
  }, [decision]);
  const openDecision = (
    kind: "submit" | "correct",
    opener: HTMLButtonElement,
  ) => {
    decisionOpener.current = opener;
    setDecision(kind);
  };
  const cancelDecision = () => {
    restoreDecisionFocus.current = true;
    setDecision(undefined);
  };
  const files = Object.entries(fileLabels).filter(
    ([file]) => app.documents?.[file],
  );
  return (
    <article
      className="dossier"
      id={`application-${app.id}`}
      data-application-id={app.id}
      tabIndex={-1}
      aria-labelledby={headingId}
    >
      <header className="dossier-header">
        <h2 id={headingId}>{app.title}</h2>
        <p>
          {app.employer}{" "}
          <ReviewStatus
            readOnly={client.preview}
            status={app.status}
            form={reviewForm}
            busy={reviewBusy || decisionBusy || Boolean(decision)}
          />
        </p>
      </header>
      <div className="dossier-content">
        {app.fit_summary && <p className="fit-summary">{app.fit_summary}</p>}
        {Boolean(app.warnings?.length) && (
          <p className="warning">{app.warnings?.join(" · ")}</p>
        )}
        <ApplicationDetails app={app} job={job} timezone={timezone} />
        {app.submission_recovery && (
          <details className="submission-audit">
            <summary>Original submission record and correction</summary>
            <p>
              This draft descends from a corrected manual submission record. The
              original record and its documents remain preserved.
            </p>
            <p>
              <strong>Correction:</strong> {app.submission_recovery.reason}
            </p>
            <p>
              Corrected {displayDate(app.submission_recovery.at, timezone)}.
              {app.submission_recovery.recorded_at && (
                <>
                  {" "}
                  Original submission recording:{" "}
                  {displayDate(app.submission_recovery.recorded_at, timezone)}.
                </>
              )}
            </p>
            {original && (
              <>
                <p>
                  The original Submitted record and its documents are preserved.
                </p>
                <div className="actions">
                  {original.documents?.["resume.pdf"] && (
                    <FileLink id={original.id} name="resume.pdf">
                      Original CV PDF
                    </FileLink>
                  )}
                  {original.documents?.["cover-letter.pdf"] && (
                    <FileLink id={original.id} name="cover-letter.pdf">
                      Original cover letter PDF
                    </FileLink>
                  )}
                </div>
                {original.comments.map((item, index) => (
                  <p key={index}>
                    <small>
                      {displayDate(item.at, timezone)} ·{" "}
                      {item.kind === "comment" ? "Comment" : item.status}
                    </small>
                    <br />
                    {item.text}
                  </p>
                ))}
              </>
            )}
            {job.prior_application === "submitted" && (
              <p className="warning">
                A separate earlier submission decision still applies to this
                job. Review that decision before preparing or applying again.
              </p>
            )}
          </details>
        )}
        <div className="editor-actions">
          {(["resume", "cover-letter"] as const)
            .filter((document) => app.documents?.[`${document}.pdf`])
            .map((document) => (
              <Action
                previewAllowed
                key={document}
                run={async (button) => {
                  onEdit(
                    await client.action<EditorDocument>("document-editor", {
                      id: app.id,
                      document,
                    }),
                    button,
                  );
                }}
              >
                {client.preview ? "View" : "View / edit"}{" "}
                {document === "resume" ? "CV" : "cover letter"}
              </Action>
            ))}
        </div>
        <div className="actions">
          {files.slice(0, 2).map(([file, label]) => (
            <FileLink key={file} id={app.id} name={file}>
              {label}
            </FileLink>
          ))}
        </div>
        {files.length > 2 && (
          <details>
            <summary>Supporting files & source evidence</summary>
            <div className="actions">
              {files.slice(2).map(([file, label]) => (
                <FileLink key={file} id={app.id} name={file}>
                  {label}
                </FileLink>
              ))}
            </div>
          </details>
        )}
        {Boolean(app.file_changes?.length) && (
          <div className="error">
            <p>
              Files changed on disk: {app.file_changes?.join(", ")}. The
              verified original is preserved for recovery.
            </p>
            <Action
              run={async () => {
                await run("adopt-edits", { id: app.id });
              }}
            >
              Validate edits as a new draft
            </Action>
          </div>
        )}
        {app.migration_warning && (
          <p className="error">{app.migration_warning}</p>
        )}
        {safeUrl(job.url) && (
          <p>
            <a
              href={safeUrl(job.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open application listing
            </a>
          </p>
        )}
      </div>
      <div className="review-pane">
        <div className="review-header">
          <h3>Review & decision</h3>
          {!client.hosted && app.documents?.["resume.pdf"] && (
            <button
              className="secondary"
              disabled={state._workspace.demo}
              onClick={(event) => onApply(event.currentTarget)}
            >
              {app.status === "submitted"
                ? "Submission details"
                : "Apply For Me"}
            </button>
          )}
        </div>
        <Form
          id={reviewForm}
          onBusyChange={setReviewBusy}
          onSave={async (data, submitter) => {
            const status =
              submitter?.name === "status" ? submitter.value : undefined;
            if (!status && !text(data, "comment").trim())
              throw new Error("Enter a comment to save.");
            await run("review", {
              id: app.id,
              comment: text(data, "comment"),
              ...(status ? { status } : {}),
            });
            setComment("");
          }}
        >
          <fieldset disabled={Boolean(decision)}>
            <TextArea
              label="Comments"
              name="comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <div className="actions">
              {app.status !== "submitted" && (
                <>
                  {app.status !== "rejected" ? (
                    <button name="status" value="rejected">
                      Reject
                    </button>
                  ) : (
                    <button name="status" value="draft">
                      Return to Active
                    </button>
                  )}
                  <button
                    type="button"
                    className="record-submission"
                    onClick={(event) =>
                      openDecision("submit", event.currentTarget)
                    }
                  >
                    Record submission…
                  </button>
                </>
              )}
              <button>Save comment</button>
            </div>
          </fieldset>
        </Form>
        {app.status === "submitted" &&
          !app.submission_correction &&
          !client.preview &&
          (app.submission_correction_blocked ? (
            <p className="muted">{app.submission_correction_blocked}</p>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={reviewBusy || Boolean(decision) || !app.manifest_hash}
              onClick={(event) => openDecision("correct", event.currentTarget)}
            >
              Correct submission record…
            </button>
          ))}
        {decision && (
          <section
            className="decision-confirmation"
            aria-labelledby={`${headingId}-decision`}
          >
            <h4
              id={`${headingId}-decision`}
              ref={decisionHeading}
              tabIndex={-1}
            >
              {decision === "submit"
                ? "Record this submission?"
                : "Correct a mistaken submission record?"}
            </h4>
            <p>
              {app.title} · {app.employer}
            </p>
            <p>
              {decision === "submit"
                ? "Only record this after you have submitted the application yourself. This action does not send anything."
                : "Use this only if the application was recorded as Submitted by mistake. This does not undo a real submission. The original record and documents will remain unchanged."}
            </p>
            <Form
              key={decision}
              onBusyChange={setDecisionBusy}
              onSave={async (data) => {
                if (!checked(data, "confirmed"))
                  throw new Error("Confirm the statement before continuing.");
                if (decision === "submit") {
                  const method = text(data, "submission_method").trim();
                  if (!method)
                    throw new Error(
                      "Describe where or how you submitted the application.",
                    );
                  const result = await run<Application>(
                    "review",
                    {
                      id: app.id,
                      status: "submitted",
                      comment: [
                        comment.trim(),
                        `Submission recorded by user. Method: ${method}`,
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    },
                    "Submission recorded. No message was sent by this action.",
                  );
                  setComment("");
                  router.replace(applicationHref(result));
                } else {
                  const reason = text(data, "reason").trim();
                  if (!reason)
                    throw new Error(
                      "Explain why the submission record is incorrect.",
                    );
                  const result = await run<Application>(
                    "correct-submission",
                    {
                      id: app.id,
                      base: app.manifest_hash,
                      confirmed: true,
                      reason,
                    },
                    "Submission record corrected. The original is preserved; a draft record is ready for review.",
                  );
                  router.replace(applicationHref(result));
                }
                setDecision(undefined);
              }}
            >
              {decision === "submit" ? (
                <Field
                  label="Where or how you submitted"
                  name="submission_method"
                  required
                  maxLength={1000}
                  placeholder="Employer website or email"
                />
              ) : (
                <TextArea
                  label="Reason for correction"
                  name="reason"
                  required
                  maxLength={4000}
                />
              )}
              <Check
                name="confirmed"
                required
                label={
                  decision === "submit"
                    ? "I have already submitted this application."
                    : "This application was not actually submitted; the record was a mistake."
                }
              />
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={cancelDecision}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={
                    decision === "submit" ? "record-submission" : undefined
                  }
                >
                  {decision === "submit"
                    ? "Confirm submission record"
                    : "Create corrected draft record"}
                </button>
              </div>
            </Form>
          </section>
        )}
        {app.comments.length > 0 && (
          <details>
            <summary>Review history ({app.comments.length})</summary>
            {app.comments.map((item, index) => (
              <p key={index}>
                <small>
                  {displayDate(item.at, timezone)} ·{" "}
                  {item.kind === "comment" ? "Comment" : item.status}
                </small>
                <br />
                {item.text}
              </p>
            ))}
          </details>
        )}
      </div>
    </article>
  );
}
