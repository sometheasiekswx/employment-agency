"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { TextArea } from "@/components/controls";
import { useNotifications } from "@/components/notification-center";
import { useWorkspace } from "@/components/workspace-provider";
import { WorkspaceChangedError } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { ApplicationHandoff, Job, ResearchHandoff } from "@/lib/models";

type CopyResult = {
  text: string | null;
  blockers?: ApplicationHandoff["blockers"];
};

function CopyAgentInstructions({
  label,
  scope,
  empty = false,
  read,
  jobs,
  onOpen,
  onClearSelection,
}: {
  label: string;
  scope: string;
  empty?: boolean;
  read: () => Promise<CopyResult>;
  jobs?: Map<string, Job>;
  onOpen?: (id: string) => void;
  onClearSelection?: () => void;
}) {
  const { notify } = useNotifications();
  const scopeId = useId();
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [manualCopy, setManualCopy] = useState("");
  const [blockers, setBlockers] = useState<ApplicationHandoff["blockers"]>([]);
  const [problem, setProblem] = useState("");
  useLayoutEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  async function copy() {
    if (busy) return;
    const generation = ++request.current;
    setBusy(true);
    setProblem("");
    setManualCopy("");
    setBlockers([]);
    try {
      const result = await read();
      if (request.current !== generation) return;
      if (!result.text || result.blockers?.length) {
        setBlockers(result.blockers ?? []);
        if (!result.blockers?.length)
          setProblem("Agent instructions could not be prepared. Try again.");
        return;
      }
      try {
        await navigator.clipboard.writeText(result.text);
        if (request.current === generation)
          notify("Agent instructions copied.");
      } catch {
        if (request.current === generation) setManualCopy(result.text);
      }
    } catch (error) {
      if (request.current !== generation) return;
      const message = errorMessage(error);
      setProblem(message);
      notify(message, "error");
    } finally {
      if (request.current === generation) setBusy(false);
    }
  }

  return (
    <div className="agent-instructions">
      <div className="agent-instructions-control">
        <button
          type="button"
          className="secondary"
          aria-label={label}
          aria-describedby={scopeId}
          aria-busy={busy}
          disabled={empty || busy}
          onClick={() => void copy()}
        >
          <Copy size={15} aria-hidden="true" />
          Copy agent instructions
        </button>
        <span id={scopeId}>{scope}</span>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {blockers.length > 0 && (
        <div className="agent-instructions-blockers" role="alert">
          <p>Resolve these roles before copying application instructions.</p>
          <ul>
            {blockers.map(({ code, job_id: id, message }) => {
              const job = id ? jobs?.get(id) : undefined;
              return (
                <li key={JSON.stringify([id, code])}>
                  {job && (
                    <strong>
                      {job.title} · {job.employer}.{" "}
                    </strong>
                  )}
                  {message}{" "}
                  {id && job && onOpen && code !== "role_not_pending" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onOpen(id)}
                    >
                      Open {job.title}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {onClearSelection &&
            blockers.some(({ code }) => code === "role_not_pending") && (
              <button
                type="button"
                className="secondary"
                onClick={onClearSelection}
              >
                Clear selection
              </button>
            )}
        </div>
      )}
      {manualCopy && (
        <TextArea
          label="Select and copy the agent instructions"
          readOnly
          rows={6}
          value={manualCopy}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}

function checkWorkspace(
  workspace: { path: string; workspace_id?: string },
  result: { workspace: string; workspace_id: string },
) {
  if (
    result.workspace !== workspace.path ||
    (workspace.workspace_id && result.workspace_id !== workspace.workspace_id)
  )
    throw new WorkspaceChangedError();
}

export function ApplicationInstructions({
  selection,
  pendingCount,
  jobs,
  onOpen,
  onClearSelection,
}: {
  selection: string[];
  pendingCount: number;
  jobs: Map<string, Job>;
  onOpen: (id: string) => void;
  onClearSelection: () => void;
}) {
  const { client, state } = useWorkspace();
  const workspace = state._workspace;
  const count = selection.length || pendingCount;
  return (
    <CopyAgentInstructions
      key={JSON.stringify([workspace.path, workspace.workspace_id, selection])}
      label="Copy agent instructions"
      scope={
        selection.length
          ? `${count} selected`
          : count
            ? `All To apply (${count})`
            : "No roles in To apply"
      }
      empty={!count}
      jobs={jobs}
      onOpen={onOpen}
      onClearSelection={onClearSelection}
      read={async () => {
        const result = await client.action<ApplicationHandoff>(
          "application-handoff",
          selection.length ? { job_ids: selection } : { all_pending: true },
        );
        checkWorkspace(workspace, result);
        if (
          result.text &&
          selection.length &&
          (result.job_ids.length !== selection.length ||
            selection.some((id) => !result.job_ids.includes(id)))
        )
          throw new Error(
            "The returned roles do not match your selection. Try again.",
          );
        return result;
      }}
    />
  );
}

export function ResearchInstructions() {
  const { client, state, profileId } = useWorkspace();
  const workspace = state._workspace;
  const profile = state.profiles.find(({ id }) => id === profileId);
  return (
    <CopyAgentInstructions
      key={JSON.stringify([workspace.path, workspace.workspace_id, profileId])}
      label="Copy agent instructions for job research"
      scope={
        profile
          ? `Find 5 more companies · ${profile.name}`
          : "Find 5 more companies"
      }
      read={async () => {
        const result = await client.action<ResearchHandoff>(
          "research-handoff",
          profileId ? { profile_id: profileId } : {},
        );
        checkWorkspace(workspace, result);
        if (profileId !== (result.profile_id || ""))
          throw new WorkspaceChangedError();
        return result;
      }}
    />
  );
}
