"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Action, TextArea } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  AgentLauncher,
  AgentRunStatus,
  agentRunBlocksStart,
  useAgentRuns,
} from "@/features/applications/agent-application";
import { errorMessage } from "@/lib/format";
import type { AgentQueuePage, Job } from "@/lib/models";

function readKey(offset: number, revision: number) {
  return `${offset}:${revision}`;
}

export function useAgentQueue(
  enabled: boolean,
  offset: number,
  revision: number,
) {
  const { state, client } = useWorkspace();
  const [result, setResult] = useState<{
    key: string;
    page?: AgentQueuePage;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  const requestKey = readKey(offset, revision);
  const snapshotRevision = state._workspace.snapshot?.revision;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    client.action<AgentQueuePage>("agent-queue", { limit: 50, offset }).then(
      (result) => {
        if (active) {
          setResult({ key: requestKey, page: result });
        }
      },
      (problem) => {
        if (active) {
          setResult({ key: requestKey, error: errorMessage(problem) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [client, enabled, offset, requestKey, retry, snapshotRevision]);
  return {
    page: result?.key === requestKey ? result.page : undefined,
    error: result?.key === requestKey ? result.error : undefined,
    reload: () => {
      setResult(undefined);
      setRetry((value) => value + 1);
    },
  };
}

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
    <section className="agent-queue-tools" aria-label="Agent queue actions">
      <div className="actions">
        <strong role="status">{jobs.length} selected</strong>
        <Action run={copy} disabled={!jobs.length}>
          Copy agent instructions
        </Action>
      </div>
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
        <AgentLauncher
          jobs={containsActive || !runs ? [] : jobs}
          applicationIds={applicationIds}
          onStart={update}
          onStartBusy={onStartBusy}
          showReadiness
        />
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
      {!jobs.length && (
        <p className="muted">
          Select roles to copy instructions for another agent.{" "}
          <Link href="/discover/?view=all">Browse roles</Link>
        </p>
      )}
    </section>
  );
}
