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
import { useDraft } from "@/components/unsaved";
import { OpportunityListingLink } from "@/features/discover/opportunity-source-preview";
import { applicationHref, displayDate, safeUrl } from "@/lib/format";
import type { Application, EditorDocument, Job } from "@/lib/models";
import { FileLink } from "./file-link";
import { ApplicationDetails } from "./application-details";
import { ReviewStatus } from "./review-status";
import { CompanySubmission } from "./company-submission";
import { DemoDraftEditor } from "./demo-draft-editor";

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
  view = "all",
}: {
  app: Application;
  job: Partial<Job>;
  onEdit: (document: EditorDocument, opener: HTMLButtonElement) => void;
  onApply: (opener: HTMLButtonElement) => void;
  view?: "all" | "documents" | "activity";
}) {
  const { state, client, run } = useWorkspace();
  const { canLeave } = useDraft();
  const [comment, setComment] = useState("");
  const [reviewFormRevision, setReviewFormRevision] = useState(0);
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
  const canChangeReview = app.status === "draft" || app.status === "reviewed";
  const reviewHistory = app.comments.length > 0 && (
    <details className="application-review-history" open={view === "activity"}>
      <summary>Review history ({app.comments.length})</summary>
      <ol
        className="application-activity-list"
        aria-label="Latest activity first"
      >
        {[...app.comments].reverse().map((item, index) => (
          <li key={`${item.at}-${index}`}>
            <div className="application-activity-meta">
              <strong>
                {item.kind === "comment" ? "Comment" : item.status || "Update"}
              </strong>
              <time dateTime={item.at}>{displayDate(item.at, timezone)}</time>
            </div>
            {item.text && <p>{item.text}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
  return (
    <article
      className="dossier"
      id={`application-${app.id}`}
      data-application-id={app.id}
      data-view={view}
      tabIndex={-1}
      aria-labelledby={headingId}
    >
      <header className="dossier-header" hidden={view === "documents"}>
        <h2 id={headingId}>{app.title}</h2>
        <p>
          {view === "all" && <>{app.employer} </>}
          <ReviewStatus
            readOnly={client.preview || view === "documents"}
            preview={client.preview}
            status={app.status}
            form={reviewForm}
            busy={reviewBusy || decisionBusy || Boolean(decision)}
          />
        </p>
      </header>
      <div className="dossier-content" hidden={view === "activity"}>
        {app.demo_draft && client.demoDrafts && (
          <DemoDraftEditor
            key={app.id}
            id={app.id}
            session={client.demoDrafts}
          />
        )}
        {client.preview && !app.demo_draft && (
          <p className="muted">
            {app.status === "submitted"
              ? "Sample submission. No application was sent."
              : "Sample application. No application was sent."}
          </p>
        )}
        {Boolean(app.warnings?.length) && (
          <p className="warning">{app.warnings?.join(" · ")}</p>
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
          {view === "documents" && !client.preview && canChangeReview && (
            <Action
              disabled={reviewBusy || decisionBusy || Boolean(decision)}
              run={async () => {
                setReviewBusy(true);
                try {
                  await run(
                    "review",
                    {
                      id: app.id,
                      status: app.status === "draft" ? "reviewed" : "draft",
                    },
                    app.status === "draft"
                      ? "This version is marked reviewed."
                      : "This version is marked draft.",
                  );
                } finally {
                  setReviewBusy(false);
                }
              }}
            >
              {app.status === "draft"
                ? "Mark this version reviewed"
                : "Return this version to draft"}
            </Action>
          )}
        </div>
        <div className="actions">
          {files.slice(0, 2).map(([file, label]) => (
            <FileLink key={file} id={app.id} name={file}>
              {label}
            </FileLink>
          ))}
        </div>

        <details className="application-context" open={view === "all"}>
          <summary>Application details</summary>
          {app.fit_summary && <p className="fit-summary">{app.fit_summary}</p>}

          <ApplicationDetails app={app} job={job} timezone={timezone} />
          {app.submission_recovery && (
            <details className="submission-audit">
              <summary>Original submission record and correction</summary>
              <p>
                This draft descends from a corrected manual submission record.
                The original record and its documents remain preserved.
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
                    {displayDate(app.submission_recovery.recorded_at, timezone)}
                    .
                  </>
                )}
              </p>
              {original && (
                <>
                  <p>
                    The original Submitted record and its documents are
                    preserved.
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
        </details>
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
                if (!canLeave()) return;
                const application = await run<Application>("adopt-edits", {
                  id: app.id,
                });
                router.replace(applicationHref(application));
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
          <div>
            <OpportunityListingLink
              job={{
                ...job,
                title: job.title || app.title,
                employer: job.employer || app.employer,
              }}
            >
              Open application listing
            </OpportunityListingLink>
          </div>
        )}
      </div>
      <div className="review-pane" hidden={view === "documents"}>
        <div className="review-header">
          <h3>Review & decision</h3>
          {job.company?.cooling && (
            <p>Company paused until {displayDate(job.company.cooldown_until, timezone)}.</p>
          )}
          {state._workspace.snapshot && !client.hosted && !client.preview && canChangeReview && (
            <CompanySubmission key={app.id} app={app} />
          )}
          {!client.hosted &&
            !state._workspace.demo &&
            app.documents?.["resume.pdf"] && (
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
        {view === "activity" && reviewHistory}
        <Form
          key={reviewFormRevision}
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
                <button
                  type="button"
                  className="record-submission"
                  onClick={(event) =>
                    openDecision("submit", event.currentTarget)
                  }
                >
                  Record submission…
                </button>
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
                      ...(state._workspace.snapshot ? { occurred_at: text(data, "occurred_at") } : {}),
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
                  setReviewFormRevision((revision) => revision + 1);
                  router.replace(applicationHref(result, "activity"));
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
              {decision === "submit" && state._workspace.snapshot && (
                <Field label="Actual submission date" name="occurred_at" type="date" required />
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
        {view !== "activity" && reviewHistory}
      </div>
    </article>
  );
}
