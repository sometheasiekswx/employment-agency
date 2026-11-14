"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import { displayDate, errorMessage } from "@/lib/format";
import type {
  AgentCapabilities,
  AgentRun,
  ApplicationBlocker,
  Job,
  RequestData,
  RoleApplicationContext,
} from "@/lib/models";
import { ApplicationException } from "./application-exception";
import { FileLink } from "./file-link";

const stateLabels: Record<AgentRun["status"], string> = {
  queued: "Queued",
  preparing: "Preparing",
  applying: "Applying",
  needs_help: "Needs your help",
  interrupted: "Interrupted",
  stopping: "Stopping",
  stopped: "Stopped",
  uncertain: "Needs your help",
  record_pending: "Recording pending",
  submitted: "Submitted",
};

type StatusResult = { runs: AgentRun[] };

export function agentRunBlocksStart(run: AgentRun) {
  if (run.status === "submitted" || run.status === "stopped") return false;
  if (run.status === "interrupted") return run.can_resume || run.can_stop;
  return true;
}

export function useAgentRuns(jobId?: string, enabled = true) {
  const { client, refresh } = useWorkspace();
  const [runs, setRuns] = useState<AgentRun[]>();
  const [problem, setProblem] = useState("");
  const [reload, setReload] = useState(0);
  const completing = useRef("");
  const working = runs?.some((run) =>
    ["queued", "preparing", "applying", "stopping"].includes(run.status),
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let reading = false;
    const load = async () => {
      if (reading || !active || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const result = await client.action<StatusResult>(
          "agent-application-status",
          jobId ? { job_ids: [jobId] } : {},
        );
        if (!active) return;
        setRuns(result.runs);
        setProblem("");
        const submitted = result.runs
          .filter((run) => run.status === "submitted")
          .map(({ id }) => id)
          .sort()
          .join(",");
        if (submitted && submitted !== completing.current)
          void refresh().catch(() => {});
        completing.current = submitted;
      } catch (error) {
        if (active) setProblem(errorMessage(error));
      } finally {
        reading = false;
      }
    };
    const tick = () => {
      void load();
    };
    tick();
    const timer = window.setInterval(tick, working ? 1800 : 8000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [client, enabled, jobId, refresh, reload, working]);

  const update = (result: StatusResult) => {
    setRuns((records) => [
      ...(records || []).filter(
        (record) => !result.runs.some((run) => run.id === record.id),
      ),
      ...result.runs,
    ]);
    setReload((value) => value + 1);
  };
  return {
    runs,
    problem,
    update,
    retry: () => setReload((value) => value + 1),
  };
}

function AgentCapability({
  selection,
  render,
}: {
  selection: string;
  render: (capabilities: AgentCapabilities) => React.ReactNode;
}) {
  const { client } = useWorkspace();
  const [result, setResult] = useState<AgentCapabilities>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.visibilityState === "hidden") return;
      const ids = selection.split(",").filter(Boolean);
      client
        .action<AgentCapabilities>(
          "agent-capabilities",
          ids.length ? { job_ids: ids } : {},
        )
        .then(
          (data) => {
            if (active) {
              setResult(data);
              setError("");
            }
          },
          (problem) => {
            if (active) {
              setResult(undefined);
              setError(errorMessage(problem));
            }
          },
        );
    };
    read();
    const interval = window.setInterval(read, 15_000);
    document.addEventListener("visibilitychange", read);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", read);
    };
  }, [client, selection, retry]);
  if (error)
    return (
      <p className="agent-readiness" role="status">
        Agent availability could not be checked.{" "}
        <button
          type="button"
          className="secondary"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry agent connection
        </button>
      </p>
    );
  return result ? render(result) : null;
}

const preparable = ["version_required"];

export function AgentLauncher({
  jobs,
  applicationIds,
  onStart,
  showReadiness = false,
  onStartBusy,
}: {
  jobs: Job[];
  applicationIds?: Record<string, string>;
  onStart: (result: StatusResult) => void;
  showReadiness?: boolean;
  onStartBusy?: (busy: boolean) => void;
}) {
  const selection = jobs.map((job) => job.id).join(",");
  return (
    <AgentCapability
      key={selection}
      selection={selection}
      render={(capabilities) => {
        const unavailable = jobs
          .map((job) => ({
            job,
            status: capabilities.roles?.find((role) => role.job_id === job.id),
          }))
          .filter(({ status }) => status && !status.available);
        const ready =
          capabilities.available && jobs.length > 0 && !unavailable.length;
        return (
          <>
            {ready && (
              <AgentStart
                jobs={jobs}
                applicationIds={applicationIds}
                onStart={onStart}
                onStartBusy={onStartBusy}
              />
            )}
            {!ready &&
              (showReadiness ||
                (capabilities.available && unavailable.length > 0)) && (
                <div className="agent-readiness">
                  <p>
                    {capabilities.available
                      ? jobs.length
                        ? "A connected agent is unavailable for this selection."
                        : "A connected agent is available."
                      : capabilities.reason ||
                        "A connected agent is unavailable."}
                  </p>
                  {!capabilities.available && (
                    <p>
                      <a href="https://github.com/sometheasiekswx/employment-agency/blob/main/docs/apply-for-me.md#install-the-optional-local-connections" target="_blank" rel="noreferrer">Set up the connected agent</a>
                      {" "}or use Open application site to apply yourself.
                    </p>
                  )}
                  {unavailable.length > 0 && (
                    <ul>
                      {unavailable.map(({ job, status }) => (
                        <li key={job.id}>
                          {job.title} · {status?.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showReadiness && capabilities.channels && (
                    <details>
                      <summary>Application channel availability</summary>
                      <ul>
                        {Object.entries(capabilities.channels).map(
                          ([channel, status]) => (
                            <li key={channel}>
                              {channel === "email"
                                ? "Email"
                                : channel === "telegram"
                                  ? "Telegram"
                                  : "Website"}{" "}
                              ·{" "}
                              {status.reason ||
                                (status.available
                                  ? "Available"
                                  : "Unavailable")}
                            </li>
                          ),
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              )}
          </>
        );
      }}
    />
  );
}

function AgentStart({
  jobs,
  applicationIds,
  onStart,
  onStartBusy,
}: {
  jobs: Job[];
  applicationIds?: Record<string, string>;
  onStart: (result: StatusResult) => void;
  onStartBusy?: (busy: boolean) => void;
}) {
  const { client, profileId, refresh } = useWorkspace();
  const { canLeave } = useDraft();
  const description = useId();
  const [barriers, setBarriers] = useState<
    { job: Job; blocker: ApplicationBlocker }[]
  >([]);
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);
  const request = useRef<{ key: string; args: RequestData } | null>(null);
  const inFlight = useRef(false);
  const container = useRef<HTMLElement>(null);
  const single = jobs.length === 1;

  async function start(resolved = false) {
    if (inFlight.current || (!resolved && !canLeave())) return;
    inFlight.current = true;
    onStartBusy?.(true);
    setWorking(true);
    setProblem("");
    const surface = container.current;
    try {
      if (!request.current) {
        const ids = jobs.map((job) => job.id);
        const args = {
          job_ids: ids,
          ...(applicationIds && Object.keys(applicationIds).length
            ? { application_ids: applicationIds }
            : {}),
          ...(profileId ? { profile_id: profileId } : {}),
        };
        const { roles } = await client.action<{
          roles: RoleApplicationContext[];
        }>("application-context", args);
        const blocked = roles.flatMap((role) => {
          const blocker = role.blockers.find(
            ({ code }) => !preparable.includes(code),
          );
          return blocker ? [{ job: role.job, blocker }] : [];
        });
        const companies = new Map<string, RoleApplicationContext[]>();
        for (const role of roles) {
          if (!role.employer) continue;
          const matches = companies.get(role.employer.id) || [];
          matches.push(role);
          companies.set(role.employer.id, matches);
        }
        setBarriers(blocked);
        if (blocked.length) return;
        for (const sameCompany of companies.values()) {
          const { allowance } = sameCompany[0];
          const occupied = new Set(allowance.occupied || []);
          const vacancies = sameCompany.flatMap((role) => {
            const id = role.employer_link?.vacancy_id || role.job.company?.vacancy_id;
            return id ? [id] : [];
          });
          if (new Set(vacancies).size !== vacancies.length) {
            setProblem("Select one listing for each vacancy before starting.");
            return;
          }
          const newlyOccupied = vacancies.filter((vacancy) => !occupied.has(vacancy));
          if (newlyOccupied.length > allowance.remaining) {
            setProblem("Select roles within each company’s available application slots.");
            return;
          }
        }
        if (!surface?.isConnected || surface.closest("[hidden]")) return;
        request.current = { key: crypto.randomUUID(), args };
      }
      const result = await client
        .action<StatusResult>("agent-application-start", {
          ...request.current.args,
          request_key: request.current.key,
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
      request.current = null;
      onStart(result);
    } catch (error) {
      const message = errorMessage(error);
      const job = error instanceof ApiResponseError &&
        jobs.find(({ id }) => id === error.jobId);
      if (job && error instanceof ApiResponseError && error.code) {
        setBarriers([{ job, blocker: { code: error.code, message } }]);
        void refresh().catch(() => {});
      } else {
        setProblem(message);
      }
    } finally {
      inFlight.current = false;
      onStartBusy?.(false);
      setWorking(false);
    }
  }

  return (
    <section
      ref={container}
      className="agent-start"
      aria-label="Connected application"
    >
      <p id={description}>
        Starting authorizes your connected agent to prepare, share required
        documents and information, and submit{" "}
        {single ? (
          <>
            for <strong>{jobs[0].title}</strong> at {jobs[0].employer}.
          </>
        ) : (
          <>for these {jobs.length} selected roles.</>
        )}
      </p>
      {!single && (
        <ul className="agent-start-roles">
          {jobs.map((job) => (
            <li key={job.id}>
              {job.title} · {job.employer}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="secondary"
        aria-describedby={description}
        disabled={working}
        onClick={() => void start()}
      >
        {working
          ? "Checking selection…"
          : single
            ? "Apply for me"
            : "Start agent for selected roles"}
      </button>
      {problem && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {barriers.map(({ job, blocker }) => (
        <div key={job.id}>
          {!single && (
            <p>
              <strong>
                {job.title} · {job.employer}
              </strong>
            </p>
          )}
          <ApplicationException
            job={job}
            blocker={blocker}
            mode="agent"
            onResolved={async () => start(true)}
          />
        </div>
      ))}
    </section>
  );
}

export function AgentRunStatus({
  run,
  onUpdate,
}: {
  run: AgentRun;
  onUpdate: (result: StatusResult) => void;
}) {
  const { client, state } = useWorkspace();
  const heading = useId();
  const [outcome, setOutcome] = useState("");
  const submittedVersion = state.applications?.find(
    (application) =>
      application.id === run.document_application_id &&
      application.status === "submitted",
  );
  const submit = async (operation: string, args: RequestData = {}) =>
    onUpdate(
      await client.action<StatusResult>(`agent-application-${operation}`, {
        id: run.id,
        ...args,
      }),
    );
  return (
    <section className="agent-progress" aria-labelledby={heading}>
      <h3 id={heading}>Agent application</h3>
      <p role="status">
        <strong>{stateLabels[run.status]}</strong>
        {run.message && <> · {run.message}</>}
      </p>
      {run.occurred_at && (
        <p>
          {displayDate(run.occurred_at, state._workspace.timezone)} ·{" "}
          {run.receipt?.provider === "user-reconciliation"
            ? "Reported by you"
            : "Provider confirmation"}
        </p>
      )}
      {run.question && run.status === "needs_help" && (
        <Form
          key={run.question.id}
          onSave={(data) =>
            submit("answer", {
              question_id: run.question?.id,
              answer: text(data, "answer"),
            })
          }
        >
          <TextArea
            label={run.question.prompt}
            name="answer"
            rows={2}
            maxLength={2000}
            required
          />
          <button>Send answer to agent</button>
        </Form>
      )}
      {run.can_resolve && run.status === "uncertain" && (
        <Form
          onSave={(data) =>
            submit("resolve", {
              outcome: text(data, "outcome"),
              evidence: text(data, "evidence"),
              occurred_at: text(data, "occurred_at"),
              confirmed: true,
              ...(text(data, "outcome") === "confirmed" &&
              text(data, "documents_used") === "yes" &&
              run.can_associate_document &&
              run.application_id
                ? { document_application_id: run.application_id }
                : {}),
            })
          }
        >
          <Select
            label="Verified outcome"
            name="outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.currentTarget.value)}
            options={[
              ["", "Choose verified outcome"],
              ["confirmed", "I verified the submission"],
              ["not_sent", "I verified no submission occurred"],
            ]}
            required
          />
          <Field
            label={`Actual submission date and time, if submitted (${state._workspace.timezone})`}
            name="occurred_at"
            type="datetime-local"
            required={outcome === "confirmed"}
          />
          {outcome === "confirmed" &&
            run.can_associate_document &&
            run.application_id && (
              <Select
                label="Were the reserved documents submitted?"
                name="documents_used"
                options={[
                  ["", "Unknown"],
                  ["yes", "Yes, this exact version"],
                  ["no", "No"],
                ]}
              />
            )}
          <TextArea
            label="Confirmation evidence"
            name="evidence"
            rows={2}
            maxLength={2000}
            required
          />
          <button>Record verified outcome</button>
        </Form>
      )}
      {run.receipt && (
        <details>
          <summary>Confirmation evidence</summary>
          <pre>{JSON.stringify(run.receipt, null, 2)}</pre>
        </details>
      )}
      {run.status === "submitted" &&
        run.receipt &&
        (submittedVersion?.documents?.["resume.pdf"] ? (
          <div className="actions">
            <FileLink id={submittedVersion.id} name="resume.pdf" download>
              Download submitted CV
            </FileLink>
            {submittedVersion.documents["cover-letter.pdf"] && (
              <FileLink
                id={submittedVersion.id}
                name="cover-letter.pdf"
                download
              >
                Download submitted cover letter
              </FileLink>
            )}
          </div>
        ) : run.document_application_id === null ? (
          <p>Submitted document version unknown.</p>
        ) : null)}
      {(run.can_stop ||
        run.can_resume ||
        (run.can_resolve && run.status === "record_pending")) && (
        <div className="actions">
          {run.can_stop && <Action run={() => submit("stop")}>Stop</Action>}
          {run.can_resume && (
            <Action run={() => submit("resume")}>Resume</Action>
          )}
          {run.can_resolve && run.status === "record_pending" && (
            <Action run={() => submit("resolve", { outcome: "record" })}>
              Retry recording submission
            </Action>
          )}
        </div>
      )}
    </section>
  );
}

export function RoleAgentWork({
  job,
  applicationId,
  canStart,
}: {
  job: Job;
  applicationId?: string;
  canStart: boolean;
}) {
  const { runs, update, retry, problem } = useAgentRuns(job.id);
  const active = runs?.find(agentRunBlocksStart);
  const newest = active || runs?.[0];
  return (
    <>
      {newest && <AgentRunStatus run={newest} onUpdate={update} />}
      {problem && (
        <div role="alert">
          <p>{problem}</p>
          <button type="button" className="secondary" onClick={retry}>
            Retry agent progress
          </button>
        </div>
      )}
      {!active && runs && canStart && (
        <AgentLauncher
          jobs={[job]}
          applicationIds={
            applicationId ? { [job.id]: applicationId } : undefined
          }
          onStart={update}
        />
      )}
    </>
  );
}
