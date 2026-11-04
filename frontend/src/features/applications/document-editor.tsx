"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/workspace-provider";
import { useDraft } from "@/components/unsaved";
import { errorMessage } from "@/lib/format";
import type { Block, EditorDocument, RequestData } from "@/lib/models";

const styles = ["title", "contact", "heading", "bullet", "text"];

export function DocumentEditor({
  document,
  onClose,
  opener,
}: {
  document: EditorDocument;
  onClose: () => void;
  opener?: HTMLElement;
}) {
  const { client, refresh, notify } = useWorkspace();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [blocks, setBlocks] = useState<Block[]>(document.blocks || []);
  const [source, setSource] = useState(document.source || "");
  const [pdf, setPdf] = useState(document.pdf);
  const iframe = useRef<HTMLIFrameElement>(null);
  const previewLink = useRef<HTMLAnchorElement>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const editingFocus = useRef<HTMLElement | null>(null);
  const restoreEditingFocus = useRef(false);
  const { setDirty: markDraft } = useDraft();
  const keepEditing = () => {
    restoreEditingFocus.current = true;
    setConfirmClose(false);
  };
  const close = () => {
    if (busy) return;
    if (confirmClose) keepEditing();
    else if (dirty) {
      editingFocus.current = window.document
        .activeElement as HTMLElement | null;
      setConfirmClose(true);
    } else onClose();
  };

  useEffect(() => {
    const previous =
      opener || (window.document.activeElement as HTMLElement | null);
    dialog.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, [opener]);
  useEffect(() => {
    const bytes = Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    if (iframe.current) iframe.current.src = url;
    if (previewLink.current) previewLink.current.href = url;
    return () => URL.revokeObjectURL(url);
  }, [pdf]);
  useEffect(() => {
    markDraft(dirty || busy);
  }, [dirty, busy, markDraft]);
  useEffect(() => {
    if (confirmClose) keepEditingButton.current?.focus();
    else if (restoreEditingFocus.current) {
      restoreEditingFocus.current = false;
      const target = editingFocus.current;
      if (target?.isConnected) target.focus();
      else closeButton.current?.focus();
    }
  }, [confirmClose]);

  const changed = () => {
    setDirty(true);
    setStatus("Unsaved changes. Update preview to see them.");
  };
  const updateBlock = (index: number, part: 0 | 1, value: string) => {
    setBlocks((items) =>
      items.map((block, item) =>
        item === index
          ? part === 0
            ? [value, block[1]]
            : [block[0], value]
          : block,
      ),
    );
    changed();
  };
  const build = async (save: boolean) => {
    setBusy(true);
    setStatus(save ? "Saving a new draft…" : "Building preview…");
    const args: RequestData = {
      id: document.id,
      document: document.document,
      base: document.base,
      ...(document.mode === "tex" ? { source } : { blocks }),
    };
    try {
      if (save) {
        await client.action("save-document", args);
        await refresh();
        setDirty(false);
        markDraft(false);
        onClose();
        router.replace("/");
        notify("Saved as a new draft. The original application is preserved.");
      } else {
        const result = await client.action<{ pdf: string }>(
          "preview-document",
          args,
        );
        setPdf(result.pdf);
        setStatus("Preview updated. Changes are not saved yet.");
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={`document-editor${confirmClose ? " is-confirming" : ""}`}
      role={confirmClose ? "alertdialog" : undefined}
      aria-labelledby={
        confirmClose ? "editor-discard-title" : "document-editor-title"
      }
      aria-describedby={confirmClose ? "editor-discard-description" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        // Some platform close requests are not cancelable. Keep unreviewed
        // edits in the same modal instead of letting a native close hide them.
        if (dirty || busy) {
          dialog.current?.showModal();
          if (!busy) {
            setConfirmClose(true);
            keepEditingButton.current?.focus();
          }
        } else onClose();
      }}
    >
      {confirmClose && (
        <section className="editor-discard">
          <h2 id="editor-discard-title">Discard unsaved document edits?</h2>
          <p id="editor-discard-description">
            Your changes have not been saved. Keep editing to preserve them, or
            discard them and return to the application.
          </p>
          <div className="editor-discard-actions">
            <button ref={keepEditingButton} onClick={keepEditing}>
              Keep editing
            </button>
            <button
              className="editor-discard-confirm"
              onClick={() => {
                markDraft(false);
                onClose();
              }}
            >
              Discard changes
            </button>
          </div>
        </section>
      )}
      <div hidden={confirmClose}>
        <header>
          <h2 id="document-editor-title">
            {document.document === "resume" ? "CV" : "Cover letter"}
          </h2>
          <button ref={closeButton} disabled={busy} onClick={close} autoFocus>
            Close
          </button>
        </header>
        <p>
          {client.preview
            ? "Read-only fictional document preview. Download an example PDF or Word file from its application."
            : "Save creates a new draft application. The original and confirmed career facts stay unchanged. Review your wording before applying."}
        </p>
        <p role="status" className="editor-status">
          {status}
        </p>
        <div className="editor-columns">
          <section aria-label="Edit document">
            <fieldset disabled={busy}>
              {document.mode === "tex" ? (
                <>
                  <p>Edit LaTeX source to preserve your custom layout.</p>
                  <label>
                    LaTeX source
                    <textarea
                      className="tex-source"
                      aria-label="LaTeX source"
                      spellCheck={false}
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value);
                        changed();
                      }}
                    />
                  </label>
                </>
              ) : document.mode === "blocks" ? (
                <>
                  {blocks.map(([style, value], index) => (
                    <div className="edit-block" key={index}>
                      <label>
                        Style
                        <select
                          aria-label="Style"
                          value={style}
                          onChange={(event) =>
                            updateBlock(index, 0, event.target.value)
                          }
                        >
                          {styles.map((style) => (
                            <option key={style}>{style}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Text
                        <textarea
                          aria-label="Text"
                          rows={3}
                          value={value}
                          onChange={(event) =>
                            updateBlock(index, 1, event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="Remove text block"
                        onClick={() => {
                          setBlocks((items) =>
                            items.filter((_, item) => item !== index),
                          );
                          changed();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setBlocks((items) => [...items, ["text", ""]]);
                      changed();
                    }}
                  >
                    Add text block
                  </button>
                </>
              ) : (
                <p>{document.notice}</p>
              )}
            </fieldset>
          </section>
          <section aria-label="PDF preview">
            <a ref={previewLink} target="_blank" rel="noopener">
              Open preview in another tab
            </a>
            <iframe ref={iframe} title="Document PDF preview" />
          </section>
        </div>
        {document.mode !== "view" && (
          <footer>
            <button disabled={busy} onClick={() => build(false)}>
              Update preview
            </button>
            <button disabled={busy} onClick={() => build(true)}>
              Save as new draft
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
