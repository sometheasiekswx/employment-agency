"use client";

import {
  AgentLauncher,
  AgentRunStatus,
  agentRunBlocksStart,
  useAgentRuns,
} from "@/features/applications/agent-application";
import type { Job } from "@/lib/models";
import { ApplicationInstructions } from "./agent-instructions";

export function AgentQueueTools({
  jobs,
  selection,
  pendingCount,
  applicationIds,
  pending,
  onNavigate,
  onStartBusy,
  onClearSelection,
}: {
  jobs: Job[];
  selection: string[];
  pendingCount: number;
  applicationIds: Record<string, string>;
  pending: Map<string, Job>;
  onNavigate: (id: string) => void;
  onStartBusy: (busy: boolean) => void;
  onClearSelection: () => void;
}) {
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
      <ApplicationInstructions
        selection={selection}
        pendingCount={pendingCount}
        jobs={pending}
        onOpen={onNavigate}
        onClearSelection={onClearSelection}
      />
      {selection.length !== jobs.length && (
        <p>
          Some selected roles have left To apply.{" "}
          <button type="button" className="secondary" onClick={onClearSelection}>
            Clear selection
          </button>
        </p>
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
