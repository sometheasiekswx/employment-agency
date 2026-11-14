"use client";

import { useRef } from "react";
import {
  AgentLauncher,
  AgentRunStatus,
  agentRunBlocksStart,
  useAgentRuns,
} from "@/features/applications/agent-application";
import type { Job } from "@/lib/models";
import { ApplicationInstructions } from "./agent-instructions";

export function AgentQueueTools({
  selecting,
  starting,
  onToggleSelection,
  jobs,
  selection,
  pendingIds,
  applicationIds,
  pending,
  onNavigate,
  onStartBusy,
  onClearSelection,
}: {
  selecting: boolean;
  starting: boolean;
  onToggleSelection: () => void;
  jobs: Job[];
  selection: string[];
  pendingIds: string[];
  applicationIds: Record<string, string>;
  pending: Map<string, Job>;
  onNavigate: (id: string) => boolean;
  onStartBusy: (busy: boolean) => void;
  onClearSelection: () => void;
}) {
  const selectionToggle = useRef<HTMLButtonElement>(null);
  const { runs, update, problem, retry } = useAgentRuns();
  const openRuns =
    runs?.filter((run) => !["submitted", "stopped"].includes(run.status)) ?? [];
  const activeIds = new Set(
    openRuns.filter(agentRunBlocksStart).map(({ job_id }) => job_id),
  );
  const containsActive = jobs.some(({ id }) => activeIds.has(id));

  return (
    <section
      className="agent-queue-tools"
      aria-label="Agent actions for To apply"
    >
      <div className="agent-queue-toolbar">
        <div className="agent-selection-tools">
          <button
            ref={selectionToggle}
            type="button"
            className="secondary"
            disabled={starting || (!selecting && !pendingIds.length)}
            onClick={onToggleSelection}
          >
            {selecting ? "Done" : "Select"}
          </button>
          {selecting && selection.length > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={starting}
              onClick={() => {
                onClearSelection();
                selectionToggle.current?.focus();
              }}
            >
              Clear selection
            </button>
          )}
        </div>
        <ApplicationInstructions
          selecting={selecting}
          selection={selection}
          pendingIds={pendingIds}
          selectedPendingIds={jobs.map(({ id }) => id)}
          jobs={pending}
          onOpen={onNavigate}
          onClearSelection={onClearSelection}
        />
      </div>
      {selection.length !== jobs.length && (
        <p>Some selected roles have left To apply.</p>
      )}
      {problem ? (
        <p role="alert">
          {problem}{" "}
          <button type="button" onClick={retry}>
            Retry agent progress
          </button>
        </p>
      ) : (
        jobs.length > 0 &&
        selection.length === jobs.length &&
        jobs.length <= 100 &&
        !containsActive &&
        runs && (
          <AgentLauncher
            jobs={jobs}
            applicationIds={applicationIds}
            onStart={update}
            onStartBusy={onStartBusy}
            showReadiness
          />
        )
      )}
      {jobs.length > 100 && (
        <p>Select up to 100 roles to start a connected agent.</p>
      )}
      {containsActive && <p>Open running roles below to see progress.</p>}
      {openRuns.length > 0 && (
        <details className="agent-queue-progress">
          <summary>Agent work in progress ({openRuns.length})</summary>
          {openRuns.map((run) => {
            const job = pending.get(run.job_id);
            return (
              <div className="agent-queue-role" key={run.id}>
                {job && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onNavigate(job.id)}
                  >
                    Open {job.title} at {job.employer}
                  </button>
                )}
                <AgentRunStatus run={run} onUpdate={update} />
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
}
