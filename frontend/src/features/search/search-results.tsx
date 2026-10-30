"use client";

import { useState } from "react";
import { Action, Form, Json, TextArea, text } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { downloadJson } from "@/lib/api";
import { safeUrl } from "@/lib/format";
import type { RankedJob } from "@/lib/models";
import { RunForm } from "./runs";

export function SearchResults() {
  const { client, run, profileId } = useWorkspace();
  const [ranking, setRanking] = useState<RankedJob[]>();
  const [showRun, setShowRun] = useState(false);
  const requireProfile = () => {
    if (!profileId) throw new Error("Save a search profile first.");
  };
  return (
    <section>
      <h2>Find your best matches</h2>
      <p>
        Evidence and constraints guide the ordering. Related words do not prove
        that a requirement is met.
      </p>
      <div className="actions">
        <Action
          className=""
          run={async () => {
            requireProfile();
            setRanking(
              await client.action<RankedJob[]>("rank", {
                profile_id: profileId,
              }),
            );
          }}
        >
          Rank saved jobs
        </Action>
        {!client.hosted && (
          <button onClick={() => setShowRun((value) => !value)}>
            Start a run
          </button>
        )}
      </div>
      {showRun && !client.hosted && <RunForm />}
      {ranking?.map(({ job, match }) => (
        <article key={job.id}>
          <h3>
            {job.title} · {job.employer}
          </h3>
          <p>
            {job.location}{" "}
            <span className="pill">
              {match.eligible_for_preparation
                ? "Can prepare for review"
                : "Not in automatic batch"}
            </span>
          </p>
          {match.hard_conflicts.length > 0 && (
            <p className="error">{match.hard_conflicts.join("; ")}</p>
          )}
          {match.unknowns.length > 0 && (
            <p className="warning">{match.unknowns.join("; ")}</p>
          )}
          {match.gaps.length > 0 && (
            <p>Missing evidence: {match.gaps.join("; ")}</p>
          )}
          <details>
            <summary>Requirement evidence and job details</summary>
            <Json
              value={{
                requirements: match.evidence,
                preferences: match.preferences,
                salary: job.salary,
                expectation: match.salary_expectation,
                description: job.description,
              }}
            />
          </details>
          {safeUrl(job.url) && (
            <a
              href={safeUrl(job.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original listing
            </a>
          )}
          <div className="actions">
            <Action
              disabled={!match.eligible_for_preparation}
              run={async () => {
                requireProfile();
                await run("local-package", {
                  profile_id: profileId,
                  job_id: job.id,
                });
              }}
            >
              {client.hosted
                ? "Prepare application"
                : "Prepare a new local version"}
            </Action>
            {!client.hosted && (
              <Action
                run={async () => {
                  downloadJson(
                    "agent-handoff.json",
                    await client.action("handoff", { job_id: job.id }),
                  );
                }}
              >
                Download agent handoff
              </Action>
            )}
          </div>
          {!client.hosted && (
            <details>
              <summary>Import agent fact selection</summary>
              <Form
                onSave={async (data) => {
                  requireProfile();
                  await run("agent-package", {
                    profile_id: profileId,
                    job_id: job.id,
                    selection: JSON.parse(text(data, "selection")),
                  });
                }}
              >
                <TextArea
                  label="JSON response containing fact_ids"
                  name="selection"
                  required
                />
                <button>Prepare from selected facts</button>
              </Form>
            </details>
          )}
        </article>
      ))}
      {!ranking && (
        <p className="empty">
          Choose a search profile and rank your saved jobs.
        </p>
      )}
      {ranking?.length === 0 && <p>No saved jobs match this profile.</p>}
    </section>
  );
}
