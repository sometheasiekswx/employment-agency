"use client";

import {
  AgentRunStatus,
  useAgentRuns,
} from "@/features/applications/agent-application";
import type { Job } from "@/lib/models";

export function AgentQueueProgress({
  jobs,
  onNavigate,
}: {
  jobs: Map<string, Job>;
  onNavigate: (id: string) => boolean;
}) {
  const { runs, update, problem, retry } = useAgentRuns();
  const openRuns =
    runs?.filter((run) => !["submitted", "stopped"].includes(run.status)) ?? [];

  return (
    <>
      {problem && (
        <p role="alert" className="agent-queue-progress">
          {problem}{" "}
          <button type="button" onClick={retry}>
            Retry agent progress
          </button>
        </p>
      )}
      {openRuns.length > 0 && (
        <details className="agent-queue-progress">
          <summary>Agent work in progress ({openRuns.length})</summary>
          {openRuns.map((run) => {
            const job = jobs.get(run.job_id);
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
    </>
  );
}
