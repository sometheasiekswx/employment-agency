"use client";

import { useState } from "react";
import { Action, TextArea } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  AgentLauncher,
  AgentRunStatus,
  agentRunBlocksStart,
  useAgentRuns,
} from "@/features/applications/agent-application";
import type { Job } from "@/lib/models";

export function AgentQueueTools({
  jobs,
  applicationIds,
  pending,
  onNavigate,
  onStartBusy,
}: {
  jobs: Job[];
  applicationIds: Record<string, string>;
  pending: Map<string, Job>;
  onNavigate: (id: string) => void;
  onStartBusy: (busy: boolean) => void;
}) {
  const { client } = useWorkspace();
  const { runs, update, problem, retry } = useAgentRuns();
  const [handoff, setHandoff] = useState<{
    selection: string;
    text: string;
    copied: boolean;
  }>();
  const ids = jobs.map(({ id }) => id);
  const selection = ids.join(",");
  const currentHandoff = handoff?.selection === selection ? handoff : undefined;
  const openRuns =
    runs?.filter((run) => !["submitted", "stopped"].includes(run.status)) ?? [];
  const activeIds = new Set(
    openRuns.filter(agentRunBlocksStart).map(({ job_id }) => job_id),
  );
  const containsActive = jobs.some(({ id }) => activeIds.has(id));

  async function copy() {
    setHandoff(undefined);
    const { text } = await client.action<{ text: string }>(
      "application-handoff",
      {
        job_ids: ids,
      },
    );
    try {
      await navigator.clipboard.writeText(text);
      setHandoff({ selection, text, copied: true });
    } catch {
      setHandoff({ selection, text, copied: false });
    }
  }

  return (
    <section
      className="agent-queue-tools"
      aria-label="Agent actions for To apply"
    >
      {jobs.length > 0 ? (
        <div className="actions">
          <strong role="status">{jobs.length} selected</strong>
          <Action run={copy}>Copy agent instructions</Action>
        </div>
      ) : (
        <p className="muted" role="status">
          Open a job to apply yourself, or select jobs for your agent.
        </p>
      )}
      {currentHandoff?.copied && (
        <p role="status">Agent instructions copied.</p>
      )}
      {currentHandoff && !currentHandoff.copied && (
        <TextArea
          label="Select and copy the agent instructions"
          readOnly
          rows={6}
          value={currentHandoff.text}
          onFocus={(event) => event.currentTarget.select()}
        />
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
