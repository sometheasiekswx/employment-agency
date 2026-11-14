"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import { TextArea } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { WorkspaceChangedError } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { ApplicationHandoff, Job, ResearchHandoff } from "@/lib/models";

type PromptResult = {
  text: string | null;
  blockers?: ApplicationHandoff["blockers"];
  scope?: string;
};

type CopyStatus =
  | { kind: "busy" | "copied" }
  | { kind: "blocked" | "manual"; result: PromptResult }
  | { kind: "error"; message: string };

async function copyPrompt(text: Promise<string>) {
  // WebKit requires the call to write to begin during the click, before
  // awaiting the handoff. Supply the validated prompt when it arrives.
  if (navigator.clipboard?.write && typeof ClipboardItem === "function") {
    const data = text.then(
      (value) => new Blob([value], { type: "text/plain" }),
    );
    // Clipboard access can fail before the browser consumes the data promise.
    void data.catch(() => {});
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": data }),
    ]);
  } else {
    const value = await text;
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
  }
}

function CopyAgentInstructions({
  contextKey,
  scope,
  announceScope,
  empty = false,
  read,
  jobs,
  onOpen,
}: {
  contextKey: string;
  scope: string;
  announceScope?: boolean;
  empty?: boolean;
  read: () => Promise<PromptResult>;
  jobs?: Map<string, Job>;
  onOpen?: (id: string) => boolean;
}) {
  const scopeId = useId();
  const titleId = useId();
  const dialogScopeId = useId();
  const feedbackId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const request = useRef(0);
  const [context, setContext] = useState({ key: contextKey });
  if (context.key !== contextKey) setContext({ key: contextKey });
  const [feedback, setFeedback] = useState<{
    context: typeof context;
    status: CopyStatus;
  }>();
  const status = feedback?.context === context ? feedback.status : undefined;
  const stale = Boolean(feedback && feedback.context !== context);
  const manual = status?.kind === "manual";
  const open = manual || status?.kind === "blocked" || status?.kind === "error";

  useLayoutEffect(
    () => () => {
      request.current++;
    },
    [context],
  );

  useLayoutEffect(() => {
    const element = dialog.current;
    const button = opener.current;
    if (!open || !element) return;
    element.showModal();
    closeButton.current?.focus();
    return () => {
      element.close();
      if (button?.isConnected && !button.disabled) button.focus();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (manual) {
      textarea.current?.focus();
      textarea.current?.select();
    }
  }, [manual]);

  function close() {
    request.current++;
    setFeedback(undefined);
  }

  async function copy() {
    if (empty || status?.kind === "busy") return;
    const generation = ++request.current;
    const report = (status: CopyStatus) => {
      if (request.current === generation) setFeedback({ context, status });
    };
    report({ kind: "busy" });
    const handoff = read();
    const copied = copyPrompt(
      handoff.then((result) => {
        if (
          request.current !== generation ||
          result.blockers?.length ||
          !result.text?.trim()
        ) {
          throw new Error("No current instructions to copy");
        }
        return result.text;
      }),
    ).then(
      () => true,
      () => false,
    );

    try {
      const result = await handoff;
      if (request.current !== generation) return;
      if (result.blockers?.length) {
        report({ kind: "blocked", result });
      } else if (!result.text?.trim()) {
        report({
          kind: "error",
          message: "Agent instructions could not be prepared. Try again.",
        });
      } else {
        report(
          (await copied) ? { kind: "copied" } : { kind: "manual", result },
        );
      }
    } catch (error) {
      report({ kind: "error", message: errorMessage(error) });
    }
  }

  const result =
    status?.kind === "blocked" || status?.kind === "manual"
      ? status.result
      : undefined;
  return (
    <div className="agent-instructions">
      <div className="agent-instructions-control">
        <button
          ref={opener}
          type="button"
          className="secondary"
          aria-describedby={scopeId}
          disabled={empty}
          aria-disabled={status?.kind === "busy" || undefined}
          onClick={() => void copy()}
        >
          <Copy size={15} aria-hidden="true" />
          Copy agent instructions
        </button>
        <span id={scopeId} aria-live={announceScope ? "polite" : undefined}>
          {scope}
        </span>
      </div>
      <div className="agent-instructions-feedback" role="status">
        {status?.kind === "busy"
          ? "Preparing instructions…"
          : status?.kind === "copied"
            ? "Agent instructions copied."
            : stale && feedback?.status.kind !== "copied"
              ? "The scope changed. Copy again to generate new instructions."
              : ""}
      </div>
      {open && (
        <dialog
          ref={dialog}
          className="agent-instructions-dialog"
          aria-labelledby={titleId}
          aria-describedby={dialogScopeId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <div>
              <h2 id={titleId}>Agent instructions</h2>
              <p id={dialogScopeId}>{result?.scope ?? scope}</p>
            </div>
            <button
              ref={closeButton}
              type="button"
              className="secondary agent-instructions-close"
              aria-label="Close agent instructions"
              onClick={close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {status?.kind === "error" && (
            <p className="error" role="alert">
              {status.message}
            </p>
          )}
          {status?.kind === "blocked" && (
            <div className="agent-instructions-blockers" role="alert">
              <p>
                Resolve these roles before copying application instructions.
              </p>
              <ul>
                {result?.blockers?.map(({ code, job_id: id, message }) => {
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
                          onClick={() => {
                            if (onOpen(id)) close();
                          }}
                        >
                          Open {job.title}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {manual && (
            <>
              <p id={feedbackId} className="error" role="alert">
                Clipboard access failed. Select the prompt and copy it manually.
              </p>
              <TextArea
                ref={textarea}
                label="Prompt"
                rows={10}
                spellCheck={false}
                readOnly
                aria-describedby={feedbackId}
                value={result?.text ?? ""}
              />
            </>
          )}
          <footer>
            <button type="button" disabled={empty} onClick={() => void copy()}>
              Retry
            </button>
          </footer>
        </dialog>
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

function applicationScope(count: number) {
  return count ? `All To apply (${count})` : "No roles in To apply";
}

export function ApplicationInstructions({
  pendingIds,
  jobs,
  onOpen,
}: {
  pendingIds: string[];
  jobs: Map<string, Job>;
  onOpen: (id: string) => boolean;
}) {
  const { client, state, profileId } = useWorkspace();
  const workspace = state._workspace;
  return (
    <CopyAgentInstructions
      contextKey={JSON.stringify([
        workspace.path,
        workspace.workspace_id,
        profileId,
        [...pendingIds].sort(),
      ])}
      scope={applicationScope(pendingIds.length)}
      announceScope
      empty={!pendingIds.length}
      jobs={jobs}
      onOpen={onOpen}
      read={async () => {
        const result = await client.action<ApplicationHandoff>(
          "application-handoff",
          { all_pending: true },
        );
        checkWorkspace(workspace, result);
        return { ...result, scope: applicationScope(result.job_ids.length) };
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
      contextKey={JSON.stringify([
        workspace.path,
        workspace.workspace_id,
        profileId,
      ])}
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
