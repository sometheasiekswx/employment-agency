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
  const { setDirty: markDraft } = useDraft();
  const close = () => {
    if (busy || (dirty && !window.confirm("Discard unsaved document edits?")))
      return;
    onClose();
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
      className="document-editor"
      aria-labelledby="document-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="document-editor-title">
          {document.document === "resume" ? "CV" : "Cover letter"}
        </h2>
        <button disabled={busy} onClick={close} autoFocus>
          Close
        </button>
      </header>
      <p>
        Save creates a new draft application. The original and confirmed career
        facts stay unchanged. Review your wording before applying.
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
    </dialog>
  );
}
