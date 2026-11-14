"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Action,
  Field,
  Form,
  Select,
  TextArea,
  text,
} from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { useWorkspace } from "@/components/workspace-provider";
import { ApiResponseError } from "@/lib/api";
import { displayDate, errorMessage, safeUrl } from "@/lib/format";
import type {
  Application,
  ApplicationBlocker,
  Job,
  RoleApplicationContext,
  SubmissionAttempt,
} from "@/lib/models";
import { ApplicationException } from "./application-exception";

const channels = [
  ["website", "Website"],
  ["telegram", "Telegram"],
  ["email", "Email"],
  ["other", "Other"],
] as const;

export function useManualAttempts(jobId: string, enabled = true) {
  const { client, state } = useWorkspace();
  const [records, setRecords] = useState<SubmissionAttempt[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const localUpdate = useRef(0);
  const revision = state._workspace.snapshot?.revision;
  const canRead =
    enabled &&
    Boolean(state._workspace.agent_queue) &&
    !client.hosted &&
    !client.preview;
  useEffect(() => {
    if (!canRead || !jobId) return;
    let active = true;
    const started = localUpdate.current;
    client
      .action<SubmissionAttempt[]>("company-submission-status", {
        job_id: jobId,
      })
      .then(
        (result) => {
          if (active && localUpdate.current === started) {
            setRecords(result);
            setError("");
          }
        },
        (problem) => {
          if (active && localUpdate.current === started)
            setError(errorMessage(problem));
        },
      );
    return () => {
      active = false;
    };
  }, [canRead, client, jobId, retry, revision]);
  return {
    records,
    error,
    reload: () => setRetry((value) => value + 1),
    update: (attempt: SubmissionAttempt) => {
      localUpdate.current++;
      setError("");
      setRecords((old) => [
        ...(old ?? []).filter((item) => item.id !== attempt.id),
        attempt,
      ]);
    },
  };
}

const preparationBlockers = [
  "master_changed",
  "profile_required",
  "preparation_blocked",
];

function createApplicationTab() {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

export function CompanySubmission({
  app,
  job,
  onRecord,
  visible = true,
  onIntegrityIssue,
  canStart = true,
}: {
  app: Application;
  job: Job;
  onRecord: (attempt: SubmissionAttempt) => void;
  onIntegrityIssue?: () => void;
  visible?: boolean;
  canStart?: boolean;
}) {
  const { client, refresh, state, profileId } = useWorkspace();
  const { canLeave } = useDraft();
  const status = useManualAttempts(job.id);
  const [blocker, setBlocker] = useState<ApplicationBlocker>();
  const [certifying, setCertifying] = useState<"confirmed" | "not_sent">();
  const [channel, setChannel] = useState<string>("website");
  const [reportNote, setReportNote] = useState("");
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  const [continuation, setContinuation] = useState<string>();
  const request = useRef<{
    key: string;
    destination?: string;
    listing_sha256?: string;
  } | null>(null);
  const inFlight = useRef(false);
  const container = useRef<HTMLElement>(null);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const completionOpener = useRef<HTMLButtonElement>(null);
  const attempt = status.records?.findLast((entry) =>
    ["handed_off", "unknown"].includes(entry.status),
  );
  const destination = safeUrl(attempt?.binding.destination);
  const boundVersion = state.applications.find(
    (entry) => entry.id === attempt?.application_id,
  );
  const canUseReservedVersion = Boolean(
    boundVersion || attempt?.application_id === app.id,
  );
  const hasDetails = Boolean(
    attempt || blocker || problem || status.error || reportNote,
  );

  useEffect(() => {
    if (certifying && visible)
      completionHeading.current?.focus({ preventScroll: true });
  }, [certifying, visible]);

  async function continueToSite(resolved = false) {
    if (inFlight.current || (!resolved && !canLeave())) return;
    inFlight.current = true;
    const tab = createApplicationTab();
    const surface = container.current;
    setWorking(true);
    setProblem("");
    setBlocker(undefined);
    setContinuation(undefined);
    let opened = false;
    try {
      function openReserved(reserved: SubmissionAttempt) {
        status.update(reserved);
        const href = safeUrl(reserved.binding.destination);
        if (reserved.status !== "handed_off" || !href) {
          request.current = null;
          setProblem("Check the recorded outcome before applying again.");
          return;
        }
        if (
          tab &&
          !tab.closed &&
          surface?.isConnected &&
          !surface.closest("[hidden]")
        ) {
          tab.location.replace(reserved.continue_url || href);
          opened = true;
        } else setContinuation(reserved.continue_url);
      }

      if (attempt?.status === "handed_off") {
        openReserved(
          await client.action<SubmissionAttempt>(
            "company-submission-continue",
            { id: attempt.id },
          ),
        );
        return;
      }
      const {
        roles: [context],
      } = await client.action<{ roles: RoleApplicationContext[] }>(
        "application-context",
        {
          job_ids: [job.id],
          application_ids: { [job.id]: app.id },
          ...(profileId ? { profile_id: profileId } : {}),
        },
      );
      const website = context.destinations.find(
        (entry) => entry.channel === "website",
      );
      const blocked = context.blockers.find(
        ({ code }) => !preparationBlockers.includes(code),
      );
      if (blocked) {
        const pending =
          blocked.code === "application_in_progress" &&
          (
            await client.action<SubmissionAttempt[]>(
              "company-submission-status",
              { job_id: job.id },
            )
          ).findLast(
            (entry) =>
              entry.status === "handed_off" && entry.application_id === app.id,
          );
        if (pending) {
          status.update(pending);
          openReserved(
            await client.action<SubmissionAttempt>(
              "company-submission-continue",
              { id: pending.id },
            ),
          );
        } else {
          status.reload();
          setBlocker(blocked);
        }
        return;
      }
      if (!website) {
        setBlocker({
          code: context.destinations.some((entry) => entry.required)
            ? "website_unavailable"
            : "destination_unverified",
          message: context.destinations.some((entry) => entry.required)
            ? "This role requires a different application channel."
            : "Verify the website where this vacancy accepts applications.",
        });
        return;
      }
      request.current ??= {
        key: crypto.randomUUID(),
        destination: website.value,
        listing_sha256: context.listing_sha256,
      };
      const reserved = await client
        .action<SubmissionAttempt>("self-application-start", {
          job_id: job.id,
          application_id: app.id,
          request_key: request.current.key,
          destination: request.current.destination,
          listing_sha256: request.current.listing_sha256,
        })
        .catch((error: unknown) => {
          if (
            error instanceof ApiResponseError &&
            error.status >= 400 &&
            error.status < 500
          )
            request.current = null;
          throw error;
        });
      openReserved(reserved);
      void refresh().catch(() => {});
    } catch (error) {
      setProblem(errorMessage(error));
      status.reload();
    } finally {
      if (!opened) tab?.close();
      inFlight.current = false;
      setWorking(false);
    }
  }

  async function record(data: FormData) {
    if (!attempt || !certifying) return;
    const selection = text(data, "documents_used");
    const result = await client.action<SubmissionAttempt>(
      "company-submission-resolve",
      {
        id: attempt.id,
        outcome: certifying,
        evidence: text(data, "evidence"),
        confirmed: true,
        ...(certifying === "confirmed"
          ? {
              occurred_at: text(data, "occurred_at"),
              submission_channel: channel,
              submission_destination: text(data, "destination"),
              ...(selection ? { documents_used: selection === "yes" } : {}),
              follow_up: text(data, "follow_up"),
            }
          : {}),
      },
    );
    status.update(result);
    if (result.status === "unknown") {
      setReportNote(
        result.note ||
          "Submission evidence saved. The record still needs reconciliation.",
      );
      return;
    }
    request.current = null;
    setContinuation(undefined);
    setCertifying(undefined);
    setReportNote(
      result.status === "not_sent" ? "Application slot released." : "",
    );
    if (result.status === "confirmed") onRecord(result);
    void refresh().catch(() => {});
  }

  async function reconcile() {
    if (!attempt || typeof attempt.receipt?.evidence !== "string") return;
    const result = await client.action<SubmissionAttempt>(
      "company-submission-resolve",
      {
        id: attempt.id,
        outcome: "confirmed",
        confirmed: true,
        evidence: attempt.receipt.evidence,
        occurred_at: attempt.occurred_at,
        submission_channel: attempt.submission_channel,
        submission_destination: attempt.submission_destination,
        documents_used: attempt.documents_used,
        follow_up: attempt.follow_up,
      },
    );
    status.update(result);
    if (result.status === "confirmed") onRecord(result);
    else setReportNote(result.note || "Recording is still pending.");
    void refresh().catch(() => {});
  }

  if (!canStart && !attempt && !status.error) return null;

  return (
    <section
      ref={container}
      className={`application-next-step${hasDetails ? " has-details" : ""}`}
      aria-label="Apply yourself"
    >
      {status.error && (
        <p role="alert">
          {status.error}{" "}
          <button type="button" onClick={status.reload}>
            Retry application status
          </button>
        </p>
      )}
      {canStart && !attempt && status.records && (
        <div className="actions">
          <button
            type="button"
            className="discover-primary"
            disabled={working}
            onClick={() => void continueToSite()}
          >
            {working ? "Checking application…" : "Open application site"}{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {problem && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {blocker && (
        <ApplicationException
          key={blocker.code}
          blocker={blocker}
          job={job}
          mode="self"
          onResolved={() => continueToSite(true)}
        />
      )}
      {blocker &&
        [
          "documents_changed",
          "facts_changed",
          "listing_changed",
          "version_required",
        ].includes(blocker.code) &&
        onIntegrityIssue && (
          <button
            type="button"
            className="secondary"
            onClick={onIntegrityIssue}
          >
            View document versions
          </button>
        )}
      {attempt?.status === "handed_off" && (
        <>
          {attempt.application_id !== app.id && (
            <p role="status">
              {boundVersion
                ? `Version from ${displayDate(boundVersion.created_at, state._workspace.timezone)} holds this application slot.`
                : "A different document version holds this application slot."}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="discover-primary"
              disabled={working || Boolean(certifying)}
              aria-expanded={certifying === "confirmed"}
              onClick={(event) => {
                completionOpener.current = event.currentTarget;
                setChannel(attempt.submission_channel || "website");
                setCertifying("confirmed");
              }}
            >
              I've applied
            </button>
            {canStart &&
              (continuation && !certifying ? (
                <a
                  className="button secondary"
                  href={continuation}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Continue to application site{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={working || Boolean(certifying)}
                  onClick={() => void continueToSite()}
                >
                  {working ? "Checking application…" : "Open application site"}{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              ))}
            <button
              type="button"
              className="secondary"
              disabled={working || Boolean(certifying)}
              onClick={(event) => {
                completionOpener.current = event.currentTarget;
                setCertifying("not_sent");
              }}
            >
              Close without submitting
            </button>
          </div>
        </>
      )}
      {certifying && attempt?.status === "handed_off" && (
        <section className="application-completion">
          <h4 ref={completionHeading} tabIndex={-1}>
            {certifying === "confirmed"
              ? "Record your submission"
              : "Confirm no submission"}
          </h4>
          <Form key={certifying} onSave={record}>
            {certifying === "confirmed" && (
              <>
                <Select
                  name="channel"
                  label="Application channel"
                  options={channels}
                  value={channel}
                  onChange={(event) => setChannel(event.currentTarget.value)}
                />
                <Field
                  key={channel}
                  label="Destination"
                  name="destination"
                  defaultValue={channel === "website" ? destination : ""}
                  maxLength={2000}
                  required
                />
                <Field
                  label={`Actual submission date and time (${state._workspace.timezone})`}
                  name="occurred_at"
                  type="datetime-local"
                  required
                />
                {attempt.self_apply_request && canUseReservedVersion && (
                  <Select
                    label="Did you use the reserved documents?"
                    name="documents_used"
                    options={[
                      ["", "Unknown"],
                      ["yes", "Yes, I used this exact version"],
                      ["no", "No, I used other documents"],
                    ]}
                  />
                )}
              </>
            )}
            <TextArea
              label="Confirmation evidence"
              name="evidence"
              maxLength={2000}
              rows={2}
              required
            />
            {certifying === "confirmed" && attempt.self_apply_request && (
              <details>
                <summary>Add follow-up</summary>
                <TextArea
                  label="Pending supporting documents or follow-up"
                  name="follow_up"
                  maxLength={2000}
                  rows={2}
                />
              </details>
            )}
            <div className="actions">
              <button type="submit" className="discover-primary">
                {certifying === "confirmed"
                  ? "Record submission"
                  : "Release application slot"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (canLeave()) {
                    setCertifying(undefined);
                    completionOpener.current?.focus();
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </Form>
        </section>
      )}
      {attempt?.status === "unknown" && (
        <>
          <p role="status">
            {attempt.note || "Submission recording needs reconciliation."}
          </p>
          {attempt.receipt && (
            <Action run={reconcile}>Retry recording submission</Action>
          )}
        </>
      )}
      {reportNote && <p role="status">{reportNote}</p>}
      {!status.records && !status.error && (
        <p role="status">Checking application status…</p>
      )}
    </section>
  );
}
