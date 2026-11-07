"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Action, Field, Form, TextArea, text } from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { useWorkspace } from "@/components/workspace-provider";
import { requirementEvidence } from "@/features/discover/discovery";
import { downloadJson } from "@/lib/api";
import { advertisedSalary, safeUrl } from "@/lib/format";
import type { Fact, Job, RankedJob } from "@/lib/models";
import { RunForm } from "./runs";
import styles from "./search-results.module.css";

const jobsPerPage = 12;

function SearchMatchDetails({
  job,
  match,
  facts,
}: RankedJob & { facts: Fact[] }) {
  const evidence = requirementEvidence(match.evidence, facts);
  const preferences = Array.isArray(match.preferences)
    ? match.preferences.filter((item) => typeof item === "string")
    : [];
  const expectation = match.salary_expectation as Job["expectation"];
  return (
    <details className={styles.details}>
      <summary>Requirement evidence and job details</summary>
      <h4>Career evidence</h4>
      {evidence.length ? (
        <ul>
          {evidence.map(({ requirement, facts }, index) => (
            <li key={`${requirement}-${index}`}>
              <strong>{requirement}</strong>
              {facts.length ? (
                <ul>
                  {facts.map((fact) => (
                    <li key={fact.id}>{fact.text}</li>
                  ))}
                </ul>
              ) : (
                <p>No confirmed supporting evidence</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No structured requirements are available.</p>
      )}
      {preferences.length > 0 && (
        <>
          <h4>Profile preferences</h4>
          <ul>
            {preferences.map((preference) => (
              <li key={preference}>{preference}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Advertised pay</h4>
      <p>{advertisedSalary(job)}</p>
      {typeof expectation?.target === "string" && expectation.target && (
        <>
          <h4>Pay guidance</h4>
          <p>{expectation.target}</p>
          {typeof expectation.basis === "string" && <p>{expectation.basis}</p>}
        </>
      )}
      {job.description && (
        <>
          <h4>Listing description</h4>
          <p className={styles.description}>{job.description}</p>
        </>
      )}
    </details>
  );
}

export function SearchResults() {
  const { client, run, profileId, state } = useWorkspace();
  const { canLeave } = useDraft();
  const [ranking, setRanking] = useState<RankedJob[]>();
  const [showRun, setShowRun] = useState(false);
  const [filterInput, setFilterInput] = useState("");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(jobsPerPage);
  const rankTrigger = useRef<HTMLButtonElement>(null);
  const resultsSummary = useRef<HTMLParagraphElement>(null);
  const firstNewResult = useRef<HTMLHeadingElement>(null);
  const terms = query.split(/\s+/);
  const filtered = query
    ? (ranking ?? []).filter(({ job }) => {
        const searchable = [job.title, job.employer, job.location, job.city]
          .join(" ")
          .toLocaleLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
    : (ranking ?? []);
  const visibleRows = filtered.slice(0, visibleLimit);
  const nextCount = Math.min(jobsPerPage, filtered.length - visibleRows.length);

  const applyFilter = (value: string) => {
    const nextQuery = value.trim().toLocaleLowerCase();
    if (nextQuery === query || !canLeave()) return false;
    setQuery(nextQuery);
    setVisibleLimit(jobsPerPage);
    return true;
  };

  useLayoutEffect(() => {
    const trigger = rankTrigger.current;
    rankTrigger.current = null;
    if (
      !trigger ||
      (document.activeElement !== trigger &&
        document.activeElement !== document.body)
    )
      return;
    resultsSummary.current?.focus({ preventScroll: true });
    resultsSummary.current?.scrollIntoView?.({ block: "start" });
  }, [ranking]);
  useLayoutEffect(() => {
    if (visibleLimit <= jobsPerPage) return;
    firstNewResult.current?.focus({ preventScroll: true });
    firstNewResult.current?.scrollIntoView?.({ block: "start" });
  }, [visibleLimit]);

  const requireProfile = () => {
    if (!profileId) throw new Error("Save a search profile first.");
  };
  return (
    <section>
      <h2 id="rank-jobs" tabIndex={-1} className={styles.resultHeading}>
        Find your best matches
      </h2>
      <p>
        Evidence and constraints guide the ordering. Verify the full requirement
        before preparing an application.
      </p>
      <div className="actions">
        <Action
          previewAllowed
          className=""
          run={async (button) => {
            requireProfile();
            const rows = await client.action<RankedJob[]>("rank", {
              profile_id: profileId,
            });
            if (!canLeave()) return;
            rankTrigger.current = button;
            setRanking([...rows]);
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
      <div role="status">
        {ranking && (
          <p ref={resultsSummary} tabIndex={-1} className={styles.resultCount}>
            {ranking.length === 0
              ? "No saved jobs match this profile."
              : `${ranking.length} ${ranking.length === 1 ? "job" : "jobs"} ranked`}
          </p>
        )}
        {ranking?.length && query && filtered.length === 0 ? (
          <p className={styles.countDetail}>
            No ranked jobs match this filter.
          </p>
        ) : (ranking?.length && query) || nextCount > 0 ? (
          <p className={styles.countDetail}>
            Showing {visibleRows.length} of {filtered.length}
            {query ? " matching" : ""} {filtered.length === 1 ? "job" : "jobs"}
          </p>
        ) : null}
      </div>
      {Boolean(ranking?.length) && (
        <form
          role="search"
          aria-label="Ranked jobs"
          className={styles.filter}
          onSubmit={(event) => {
            event.preventDefault();
            if (applyFilter(filterInput))
              resultsSummary.current?.scrollIntoView?.({ block: "start" });
          }}
        >
          <Field
            label="Filter ranked jobs"
            name="ranked_query"
            type="search"
            placeholder="Role, firm, city"
            value={filterInput}
            onChange={(event) => setFilterInput(event.target.value)}
          />
          <button type="submit" className="secondary">
            Filter
          </button>
          {query && (
            <button
              type="button"
              className={`secondary ${styles.clearFilter}`}
              onClick={() => {
                if (applyFilter("")) {
                  setFilterInput("");
                  resultsSummary.current?.focus({ preventScroll: true });
                  resultsSummary.current?.scrollIntoView?.({ block: "start" });
                }
              }}
            >
              Clear filter
            </button>
          )}
        </form>
      )}
      {visibleRows.map(({ job, match }, index) => (
        <article key={job.id}>
          <h3
            ref={index === visibleLimit - jobsPerPage ? firstNewResult : null}
            tabIndex={-1}
            className={styles.resultHeading}
          >
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
          <SearchMatchDetails job={job} match={match} facts={state.facts} />
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
      {nextCount > 0 && (
        <button
          type="button"
          className="secondary"
          onClick={() => setVisibleLimit((limit) => limit + jobsPerPage)}
        >
          Show {nextCount} more {nextCount === 1 ? "job" : "jobs"}
        </button>
      )}
      {!ranking && (
        <p className="empty">
          Choose a search profile and rank your saved jobs.
        </p>
      )}
    </section>
  );
}
