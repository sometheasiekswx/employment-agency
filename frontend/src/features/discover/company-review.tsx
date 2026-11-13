"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Action, Field, Form, text } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { displayDate, errorMessage } from "@/lib/format";
import type { Job, RankedJob, RequestData, WorkspaceState } from "@/lib/models";
import { requirementEvidence } from "./discovery";

type Employer = { id: string; name: string };
type HistoryQuestion = { job_id?: string; history_id?: string; title: string; reason: string; date?: string };
type Company = {
  employer: Employer | null;
  employers: Employer[];
  sources: WorkspaceState["sources"];
  available_sources: WorkspaceState["sources"];
  candidates: Pick<Job, "id" | "title" | "employer">[];
  linked_listings: Pick<Job, "id" | "title">[];
  status: {
    remaining: number;
    cooling: boolean;
    cooldown_until?: string;
    cooldown_time_assumed?: boolean;
    review_needed: boolean;
    unresolved?: HistoryQuestion[];
    used?: string[];
    over_limit?: number;
  };
  roles: RankedJob[];
};

function historicalSubmissionTime(data: FormData, field: string) {
  const date = text(data, field);
  const time = text(data, "submitted_time");
  return date && time ? `${date}T${time}` : date;
}

export function CompanyReview({ job }: { job: Job }) {
  const { client, profileId, refresh, state } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState<Company>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const contentId = useId();
  const status = company?.status;
  const employer = company?.employer;
  const timezone = state._workspace.timezone;

  async function load(checkSources = false) {
    setBusy(true);
    setError("");
    try {
      setCompany(await client.action<Company>("company-roles", {
        job_id: job.id, profile_id: profileId, refresh: checkSources,
      }));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function change(operation: string, data: RequestData) {
    await client.action(operation, data);
    await refresh();
    await load();
  }

  async function map(data: FormData, jobId: string) {
    await change("company-map", {
      job_id: jobId, confirmed: true,
      employer_id: employer?.id || text(data, "employer_id"),
      name: text(data, "name"),
      requisition: text(data, "requisition"),
      same_job_id: text(data, "same_job_id"),
      source_id: text(data, "source_id"),
      submitted_on: historicalSubmissionTime(data, "submitted_on"),
    });
  }

  return (
    <section className="discover-evidence-section">
      {job.company?.cooling && !open && (
        <p>Company paused until {displayDate(job.company.cooldown_until, timezone)}.</p>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        Compare roles at this company
      </button>
      {open && (
        <div id={contentId} aria-busy={busy}>
          {busy && <p role="status">Checking company roles…</p>}
          {error && <p role="alert">{error}</p>}
          {company && status && (
            <>
              {employer && (
                <>
                  <h3>{employer.name}</h3>
                  <p role="status">
                    {status.cooling
                      ? `Paused until ${displayDate(status.cooldown_until, timezone)}${status.cooldown_time_assumed ? " (submission time assumed)" : ""}`
                      : status.review_needed
                        ? "Review the earlier applications before choosing another role."
                        : `${status.remaining} application ${status.remaining === 1 ? "slot" : "slots"} available`}
                  </p>
                  {!!status.over_limit && <p>Additional submissions are recorded in the application history.</p>}
                  {status.remaining === 1 && status.used?.length === 1 && (
                    <Action run={() => change("company-pause", { job_id: job.id })}>Pause this company</Action>
                  )}
                </>
              )}
              {(!employer || company.available_sources.length > 0) && (
                <details open={!employer || undefined}>
                  <summary>{employer ? "Company sources" : "Confirm the hiring employer"}</summary>
                  <Form onSave={(data) => map(data, job.id)}>
                    {!employer && (
                      <>
                        {company.employers.length > 0 && (
                          <label>
                            Existing hiring employer
                            <select name="employer_id">
                              <option value="">Add a company</option>
                              {company.employers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                          </label>
                        )}
                        <Field label="Hiring employer name" name="name" defaultValue={job.employer} />
                        <Field label="Employer requisition ID (optional)" name="requisition" />
                      </>
                    )}
                    {company.available_sources.length > 0 && (
                      <label>
                        Verified careers board (optional)
                        <select name="source_id">
                          <option value="">Choose a board</option>
                          {company.available_sources.map((source) => (
                            <option key={source.id} value={source.id}>{source.board} · {source.kind}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button>{employer ? "Confirm source ownership" : "Confirm employer"}</button>
                  </Form>
                </details>
              )}
              {employer && company.candidates.length > 0 && (
                <details>
                  <summary>Listings to verify ({company.candidates.length})</summary>
                  <Form onSave={(data) => map(data, text(data, "job_id"))}>
                    <label>
                      Listing for this employer
                      <select name="job_id" required>
                        {company.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.employer}</option>
                        ))}
                      </select>
                    </label>
                    <Field label="Employer requisition ID (optional)" name="requisition" />
                    <label>
                      Same vacancy as (optional)
                      <select name="same_job_id">
                        <option value="">A different vacancy</option>
                        {company.linked_listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}
                      </select>
                    </label>
                    <button>Confirm this listing belongs to {employer.name}</button>
                  </Form>
                </details>
              )}
              {!!status.unresolved?.length && (
                <details open>
                  <summary>Review earlier applications ({status.unresolved.length})</summary>
                  {status.unresolved.map((item) => (
                    <div key={item.job_id || item.history_id}>
                      <p>{item.title} · {item.reason}</p>
                      {item.reason === "Confirm the submission date" && item.job_id && (
                        <Form onSave={(data) => map(data, item.job_id!)}>
                          <Field label="Actual submission date" name="submitted_on" type="date" required />
                          <Field label={`Time if known (${timezone})`} name="submitted_time" type="time" />
                          <button>Confirm submission date</button>
                        </Form>
                      )}
                      {item.history_id && (
                        <Form onSave={(data) => change("company-history-link", {
                          history_id: item.history_id, job_id: text(data, "job_id"),
                          occurred_at: historicalSubmissionTime(data, "occurred_at"), confirmed: true,
                        })}>
                          <label>
                            Original listing
                            <select name="job_id" required>
                              {company.linked_listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}
                            </select>
                          </label>
                          <Field label="Actual submission date" name="occurred_at" type="date" required />
                          <Field label={`Time if known (${timezone})`} name="submitted_time" type="time" />
                          <button>Link recorded submission</button>
                        </Form>
                      )}
                    </div>
                  ))}
                </details>
              )}
              {employer && !status.cooling && (
                <>
                  {company.sources.length ? (
                    <>
                      <ul>{company.sources.map((source) => (
                        <li key={source.id}>
                          {source.board} · {source.status}{source.checked_at ? ` · ${displayDate(source.checked_at, timezone)}` : ""}
                        </li>
                      ))}</ul>
                      <button type="button" disabled={busy} onClick={() => void load(true)}>Check company careers boards</button>
                    </>
                  ) : <p className="muted">Showing confirmed listings already in this workspace.</p>}
                  {company.roles.length === 0 ? <p>No matching open roles found.</p> : (
                    <Form onSave={async () => {
                      const result = await client.action<{ job_ids: string[] }>("company-selection", {
                        job_id: job.id, profile_id: profileId, job_ids: selection,
                      });
                      setSelected(result.job_ids);
                    }}>
                      <ul>
                        {company.roles.map(({ job: role, match }) => (
                          <li key={role.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selection.includes(role.id)}
                                disabled={!selection.includes(role.id) && selection.length >= status.remaining}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setSelection((previous) => checked ? [...previous, role.id] : previous.filter((id) => id !== role.id));
                                  setSelected([]);
                                }}
                              />
                              {role.title}{role.location ? ` · ${role.location}` : ""}
                            </label>
                            {requirementEvidence(match.evidence, state.facts, role)
                              .filter((item) => item.facts.length || item.careerFacts.length)
                              .map((item) => <p key={item.requirement}>Evidence matches {item.requirement}</p>)}
                            {match.gaps.length > 0 && <p>Evidence to check · {match.gaps.join(", ")}</p>}
                            {match.unknowns.length > 0 && <p>{match.unknowns.join(" · ")}</p>}
                            {selected.includes(role.id) && (
                              <Link href={`/discover/?${new URLSearchParams({
                                view: role.saved ? "saved" : "all", opportunity: role.id, assessment_profile: profileId,
                              })}`}>Open selected role</Link>
                            )}
                          </li>
                        ))}
                      </ul>
                      <button disabled={!selection.length || selection.length > status.remaining}>Confirm shortlist</button>
                    </Form>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
