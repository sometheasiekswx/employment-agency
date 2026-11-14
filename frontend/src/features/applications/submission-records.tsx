"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Action,
  Field,
  Form,
  Select,
  TextArea,
  text,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  applicationHref,
  decisionDate,
  displayDate,
  errorMessage,
  safeUrl,
} from "@/lib/format";
import type { Application, Job, SubmissionAttempt } from "@/lib/models";
import { useManualAttempts } from "./company-submission";
import { FileLink } from "./file-link";

const channelNames: Record<string, string> = {
  manual: "Manual application",
  website: "Website",
  telegram: "Telegram",
  email: "Email",
  other: "Other",
  linkedin: "LinkedIn",
  gmail: "Gmail",
};

function Receipt({
  attempt,
  onUpdate,
}: {
  attempt: SubmissionAttempt;
  onUpdate?: (attempt: SubmissionAttempt) => void;
}) {
  const { state, client } = useWorkspace();
  const channel = attempt.submission_channel || attempt.channel;
  const destination =
    attempt.submission_destination ||
    attempt.binding.destination ||
    attempt.payload?.to ||
    attempt.payload?.url;
  const source = attempt.receipt?.source ?? attempt.receipt?.provider;
  const manual =
    attempt.channel === "manual" || source === "user-reconciliation";
  const fileId =
    attempt.document_application_id !== undefined
      ? attempt.document_application_id
      : attempt.application_id;
  const version = state.applications.find(
    (item) => item.id === fileId && item.status === "submitted",
  );
  const [editFollowUp, setEditFollowUp] = useState(false);
  const evidence = attempt.receipt?.evidence;
  return (
    <div className="application-receipt">
      <dl className="application-details">
        {attempt.occurred_at && (
          <div>
            <dt>Submitted</dt>
            <dd>
              {displayDate(attempt.occurred_at, state._workspace.timezone)}
            </dd>
          </div>
        )}
        <div>
          <dt>Channel</dt>
          <dd>{channelNames[channel] || channel}</dd>
        </div>
        {destination && (
          <div>
            <dt>Destination</dt>
            <dd>{destination}</dd>
          </div>
        )}
        <div>
          <dt>Record</dt>
          <dd>{manual ? "Reported by you" : "Provider confirmation"}</dd>
        </div>
      </dl>
      {typeof evidence === "string" && (
        <p className="application-receipt-evidence">{evidence}</p>
      )}
      {attempt.receipt && (!manual || typeof evidence !== "string") && (
        <details className="application-receipt-technical">
          <summary>Confirmation evidence</summary>
          <pre>{JSON.stringify(attempt.receipt, null, 2)}</pre>
        </details>
      )}
      {attempt.status === "confirmed" &&
        (version ? (
          <div className="actions">
            {version.documents?.["resume.pdf"] && (
              <FileLink id={version.id} name="resume.pdf" download>
                Download submitted CV
              </FileLink>
            )}
            {version.documents?.["cover-letter.pdf"] && (
              <FileLink id={version.id} name="cover-letter.pdf" download>
                Download submitted cover letter
              </FileLink>
            )}
          </div>
        ) : (
          <p>Submitted document version unknown.</p>
        ))}
      {attempt.follow_up && <p>Follow-up · {attempt.follow_up}</p>}
      {onUpdate &&
        attempt.self_apply_request &&
        attempt.status === "confirmed" &&
        (editFollowUp ? (
          <Form
            onSave={async (data) => {
              onUpdate(
                await client.action<SubmissionAttempt>(
                  "company-submission-follow-up",
                  {
                    id: attempt.id,
                    follow_up: text(data, "follow_up"),
                  },
                ),
              );
              setEditFollowUp(false);
            }}
          >
            <TextArea
              label="Pending supporting documents or follow-up"
              name="follow_up"
              maxLength={2000}
              rows={2}
              defaultValue={attempt.follow_up}
            />
            <button>Save follow-up</button>
          </Form>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => setEditFollowUp(true)}
          >
            {attempt.follow_up ? "Edit follow-up" : "Add follow-up"}
          </button>
        ))}
    </div>
  );
}

export function SubmissionRecord({
  job,
  application,
  active,
  recent,
}: {
  job: Job;
  application?: Application;
  active: boolean;
  recent?: SubmissionAttempt;
}) {
  const { state, client } = useWorkspace();
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const manual = useManualAttempts(job.id, active);
  const receiptId = active ? recent?.id : undefined;
  useLayoutEffect(() => {
    if (!receiptId) return;
    const scroller = title.current?.closest<HTMLElement>(
      ".discover-inspector-body",
    );
    if (scroller) scroller.scrollTop = 0;
    title.current?.focus({ preventScroll: true });
  }, [receiptId]);
  const matchesRecord = (item: SubmissionAttempt) =>
    item.status === "confirmed" &&
    (application?.status !== "submitted" ||
      (item.document_application_id === undefined
        ? item.application_id
        : item.document_application_id) === application.id);
  const shown =
    manual.records?.findLast(matchesRecord) ||
    (recent && matchesRecord(recent) ? recent : undefined);
  if (!active) return null;
  const recordedAt =
    application?.submission_time?.at ||
    (application && decisionDate(application, "submitted")) ||
    job.submission_time?.at;
  return (
    <section className="submission-summary" aria-labelledby={heading}>
      <h3 id={heading} ref={title} tabIndex={-1}>
        {client.preview ? "Sample submission" : "Submission record"}
      </h3>
      {shown ? (
        <Receipt attempt={shown} onUpdate={manual.update} />
      ) : (
        <>
          <p>
            {recordedAt && (
              <>
                {displayDate(recordedAt, state._workspace.timezone)}
                {(application?.submission_time?.assumed ||
                  job.submission_time?.assumed) &&
                  " (time assumed)"}
                .{" "}
              </>
            )}
            {client.preview
              ? "Fictional example documents."
              : application?.status === "submitted"
                ? "Recorded submission."
                : "Submitted document version unknown."}
          </p>
          {application?.status === "submitted" && !client.preview && (
            <details className="application-receipt-technical">
              <summary>Recorded evidence</summary>
              {application.comments
                .filter((event) => event.status === "submitted" && event.text)
                .map((event, index) => (
                  <p key={index}>{event.text}</p>
                ))}
            </details>
          )}
        </>
      )}
      {manual.error && (
        <p role="alert">
          {manual.error}{" "}
          <button type="button" onClick={manual.reload}>
            Retry submission record
          </button>
        </p>
      )}
      {!application && (
        <Link
          href={`/history/?${new URLSearchParams({ role: job.title, employer: job.employer })}`}
        >
          View application history
        </Link>
      )}
    </section>
  );
}

export function PreviousSubmissionAttempts({
  jobId,
  application,
}: {
  jobId: string;
  application: Application;
}) {
  const { client, state, refresh } = useWorkspace();
  const [attempts, setAttempts] = useState<SubmissionAttempt[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (client.preview || client.hosted || state._workspace.demo) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshAfterRead = retry > 0;
    const load = async () => {
      try {
        const result = await client.action<{ attempts: SubmissionAttempt[] }>(
          "apply-status",
        );
        if (!active) return;
        const records =
          result?.attempts?.filter(
            (item) =>
              item.binding.job_id === jobId &&
              ["gmail", "linkedin"].includes(item.channel),
          ) ?? [];
        setAttempts(records);
        if (
          records.some(
            (item) => item.status === "cancelling" && !item.can_retry_cancel,
          )
        ) {
          refreshAfterRead = true;
          timer = setTimeout(() => void load(), 1000);
        } else if (refreshAfterRead) {
          void refresh().catch(() => {});
        }
      } catch (problem) {
        if (active) setError(errorMessage(problem));
      }
    };
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, state._workspace.demo, jobId, retry, refresh]);
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <button
          type="button"
          onClick={() => {
            setError("");
            setRetry((value) => value + 1);
          }}
        >
          Retry submission history
        </button>
      </p>
    );
  if (!attempts?.length) return null;
  const action = async (
    operation: string,
    attempt: SubmissionAttempt,
    data = {},
  ) => {
    await client.action(operation, { id: attempt.id, ...data });
    setRetry((value) => value + 1);
  };
  return (
    <section aria-label="Previous submission attempts">
      <details
        className="application-attempt-history"
        open={attempts.some((item) => item.status === "confirmed") || undefined}
      >
        <summary>Submission attempt history ({attempts.length})</summary>
        {[...attempts].reverse().map((attempt) => {
          const version = state.applications.find(
            (item) => item.id === attempt.application_id,
          );
          const href = safeUrl(attempt.payload?.url);
          return (
            <section key={attempt.id} className="application-attempt">
              <p>
                <strong>
                  {channelNames[attempt.channel] || attempt.channel}
                </strong>{" "}
                · {attempt.status.replaceAll("_", " ")}
              </p>
              {attempt.note && <p>{attempt.note}</p>}
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  Open recorded destination
                </a>
              )}
              {version && version.id !== application.id && (
                <p>
                  <Link href={applicationHref(version)}>
                    View attempt documents
                  </Link>
                </p>
              )}
              {attempt.receipt && <Receipt attempt={attempt} />}
              {[
                "preparing",
                "awaiting_approval",
                "needs_user",
                "failed",
              ].includes(attempt.status) && (
                <Action run={() => action("apply-cancel", attempt)}>
                  Cancel previous attempt
                </Action>
              )}
              {attempt.status === "cancelling" && attempt.can_retry_cancel && (
                <Action run={() => action("apply-cancel", attempt)}>
                  Retry cancellation
                </Action>
              )}
              {attempt.status === "unknown" && (
                <Form
                  onSave={(data) =>
                    action("apply-resolve", attempt, {
                      outcome: text(data, "outcome"),
                      evidence: text(data, "evidence"),
                      ...(state._workspace.snapshot
                        ? { occurred_at: text(data, "occurred_at") }
                        : {}),
                    })
                  }
                >
                  <Select
                    label="Verified outcome"
                    name="outcome"
                    options={[
                      ["confirmed", "I verified the submission"],
                      ["not_sent", "I verified it was not submitted"],
                    ]}
                  />
                  <TextArea
                    label="Evidence checked"
                    name="evidence"
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                  {state._workspace.snapshot && (
                    <Field
                      label={`Actual submission date and time, if submitted (${state._workspace.timezone})`}
                      type="datetime-local"
                      name="occurred_at"
                    />
                  )}
                  <button>Record verified outcome</button>
                </Form>
              )}
            </section>
          );
        })}
      </details>
    </section>
  );
}
