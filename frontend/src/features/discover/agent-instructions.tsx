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

type PromptEditor = {
  context: { key: string };
  result?: PromptResult;
  text: string;
  error?: string;
};

function CopyAgentInstructions({
  contextKey,
  scope,
  announceScope,
  empty = false,
  read,
  jobs,
  onOpen,
  onClearSelection,
}: {
  contextKey: string;
  scope: string;
  announceScope?: boolean;
  empty?: boolean;
  read: () => Promise<PromptResult>;
  jobs?: Map<string, Job>;
  onOpen?: (id: string) => boolean;
  onClearSelection?: () => void;
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
  // A new object also distinguishes a return to an earlier context.
  const [context, setContext] = useState({ key: contextKey });
  if (context.key !== contextKey) setContext({ key: contextKey });
  const [editor, setEditor] = useState<PromptEditor>();
  const [clipboard, setClipboard] = useState<"busy" | "copied" | "denied">();
  const open = Boolean(editor);
  const stale = Boolean(editor && editor.context !== context);

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

  function close() {
    request.current++;
    setEditor(undefined);
  }

  async function generate() {
    const generation = ++request.current;
    setEditor({ context, text: "" });
    setClipboard(undefined);
    try {
      const result = await read();
      if (request.current !== generation) return;
      if (!result.text && !result.blockers?.length) {
        throw new Error("Agent instructions could not be prepared. Try again.");
      }
      setEditor({
        context,
        result,
        text: result.blockers?.length ? "" : (result.text ?? ""),
      });
    } catch (error) {
      if (request.current === generation) {
        setEditor({ context, text: "", error: errorMessage(error) });
      }
    }
  }

  async function copy() {
    if (!editor || stale || !editor.text.trim() || clipboard === "busy") return;
    const generation = ++request.current;
    setClipboard("busy");
    try {
      await navigator.clipboard.writeText(editor.text);
      if (request.current === generation) setClipboard("copied");
    } catch {
      if (request.current !== generation) return;
      setClipboard("denied");
      textarea.current?.focus();
      textarea.current?.select();
    }
  }

  const blockers = editor?.result?.blockers ?? [];
  return (
    <div className="agent-instructions">
      <div className="agent-instructions-control">
        <button
          ref={opener}
          type="button"
          className="secondary"
          aria-describedby={scopeId}
          aria-haspopup="dialog"
          disabled={empty}
          onClick={() => void generate()}
        >
          <Copy size={15} aria-hidden="true" />
          Copy agent instructions
        </button>
        <span id={scopeId} aria-live={announceScope ? "polite" : undefined}>
          {scope}
        </span>
      </div>
      {editor && (
        <dialog
          ref={dialog}
          className="agent-instructions-dialog"
          aria-labelledby={titleId}
          aria-describedby={dialogScopeId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={(event) => {
            if (!event.currentTarget.open) close();
          }}
        >
          <header>
            <div>
              <h2 id={titleId}>Agent instructions</h2>
              <p id={dialogScopeId}>{editor.result?.scope ?? scope}</p>
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
          {stale ? (
            <p role="status">
              The scope changed. Refresh to generate new instructions.
            </p>
          ) : editor.error ? (
            <p className="error" role="alert">
              {editor.error}
            </p>
          ) : !editor.result ? (
            <p role="status">Preparing instructions…</p>
          ) : (
            blockers.length > 0 && (
              <div className="agent-instructions-blockers" role="alert">
                <p>
                  Resolve these roles before copying application instructions.
                </p>
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
                {onClearSelection &&
                  blockers.some(({ code }) => code === "role_not_pending") && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        onClearSelection();
                        close();
                      }}
                    >
                      Clear selection
                    </button>
                  )}
              </div>
            )
          )}
          {editor.result?.text && !blockers.length && (
            <TextArea
              ref={textarea}
              label="Prompt"
              rows={10}
              spellCheck={false}
              readOnly={stale || clipboard === "busy"}
              aria-describedby={
                !stale && clipboard === "denied" ? feedbackId : undefined
              }
              value={editor.text}
              onChange={(event) => {
                setEditor({ ...editor, text: event.currentTarget.value });
                setClipboard(undefined);
              }}
            />
          )}
          {!stale && clipboard === "denied" && (
            <p id={feedbackId} className="error" role="alert">
              Clipboard access failed. Select the prompt and copy it manually.
            </p>
          )}
          {!stale && clipboard === "copied" && (
            <p role="status">Agent instructions copied.</p>
          )}
          {stale || editor.error || blockers.length > 0 ? (
            <footer>
              <button
                type="button"
                disabled={empty}
                onClick={() => void generate()}
              >
                {stale ? "Refresh instructions" : "Retry"}
              </button>
            </footer>
          ) : (
            editor.result?.text &&
            !blockers.length && (
              <footer>
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    clipboard === "busy" || editor.text === editor.result.text
                  }
                  onClick={() => {
                    setEditor({ ...editor, text: editor.result?.text ?? "" });
                    setClipboard(undefined);
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={clipboard === "busy" || !editor.text.trim()}
                  onClick={() => void copy()}
                >
                  <Copy size={15} aria-hidden="true" />
                  Copy
                </button>
              </footer>
            )
          )}
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

export function ApplicationInstructions({
  selecting,
  selection,
  pendingIds,
  selectedPendingIds,
  jobs,
  onOpen,
  onClearSelection,
}: {
  selecting: boolean;
  selection: string[];
  pendingIds: string[];
  selectedPendingIds: string[];
  jobs: Map<string, Job>;
  onOpen: (id: string) => boolean;
  onClearSelection: () => void;
}) {
  const { client, state, profileId } = useWorkspace();
  const workspace = state._workspace;
  const count = selection.length || pendingIds.length;
  const allScope = (size: number) =>
    size ? `All To apply (${size})` : "No roles in To apply";
  const scope = selection.length
    ? `${count} selected ${count === 1 ? "role" : "roles"}`
    : allScope(count);
  return (
    <CopyAgentInstructions
      contextKey={JSON.stringify([
        workspace.path,
        workspace.workspace_id,
        profileId,
        selection,
        selection.length ? selectedPendingIds : [...pendingIds].sort(),
      ])}
      scope={
        selection.length
          ? `${count} selected`
          : selecting
            ? `0 selected · ${scope}`
            : scope
      }
      announceScope
      empty={!count}
      jobs={jobs}
      onOpen={onOpen}
      onClearSelection={selection.length ? onClearSelection : undefined}
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
        return {
          ...result,
          scope: selection.length ? scope : allScope(result.job_ids.length),
        };
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
