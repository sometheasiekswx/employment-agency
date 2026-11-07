"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  ZoomIn,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { useDraft } from "@/components/unsaved";
import { applicationHref, errorMessage, isConnectionError } from "@/lib/format";
import type {
  Application,
  Block,
  EditorDocument,
  RequestData,
} from "@/lib/models";
import { EditorPdfPreview } from "./editor-pdf-preview";
import "./editor-navigation.css";

const styles = [
  ["title", "Title"],
  ["contact", "Contact details"],
  ["heading", "Section heading"],
  ["bullet", "Bullet point"],
  ["text", "Paragraph"],
] as const;

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
  const pathname = usePathname();
  const params = useSearchParams();
  const dialog = useRef<HTMLDialogElement>(null);
  const [blocks, setBlocks] = useState<Block[]>(document.blocks || []);
  const [source, setSource] = useState(document.source || "");
  const [pdf, setPdf] = useState(document.pdf);
  const [zoomed, setZoomed] = useState(false);
  const [readingText, setReadingText] = useState(false);
  const [compact, setCompact] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("preview");
  const [blockIndex, setBlockIndex] = useState(0);
  const blockFields = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingBlock = useRef<number | null>(null);
  const paneTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const navigationId = useId();
  const previewLink = useRef<HTMLAnchorElement>(null);
  const downloadLink = useRef<HTMLAnchorElement>(null);
  // WebKit can block the native blob PDF tab under the app's framing policy.
  const canOpenNativeTab =
    typeof navigator === "undefined" ||
    navigator.vendor !== "Apple Computer, Inc.";
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const editingFocus = useRef<HTMLElement | null>(null);
  const restoreEditingFocus = useRef(false);
  const { setDirty: markDraft, canLeaveOtherDrafts } = useDraft();
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
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return;
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (pendingBlock.current === null) return;
    const target = blockFields.current[pendingBlock.current];
    pendingBlock.current = null;
    target?.scrollIntoView?.({ block: "center", behavior: "instant" });
    target?.focus({ preventScroll: true });
  }, [pane, blockIndex, blocks]);
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
    if (previewLink.current) previewLink.current.href = url;
    if (downloadLink.current) downloadLink.current.href = url;
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
  const moveBlock = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= blocks.length) return;
    pendingBlock.current = destination;
    setBlockIndex(destination);
    setBlocks((items) => {
      const next = [...items];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    changed();
  };
  const build = async (save: boolean) => {
    if (
      save &&
      !canLeaveOtherDrafts(
        "Save this new document version and discard the unsaved Activity changes? Choose Cancel to keep both drafts.",
      )
    )
      return;
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
        const application = await client.action<Application>(
          "save-document",
          args,
        );
        await refresh();
        let href = applicationHref(application);
        if (pathname === "/discover/" || pathname === "/discover") {
          const next = new URLSearchParams(params?.toString());
          next.set("application", application.id);
          next.set("panel", "documents");
          if (
            next.get("view") === "applications" &&
            ["submitted", "rejected"].includes(next.get("section") || "")
          )
            next.set("section", "active");
          href = `/discover/?${next}`;
        }
        setDirty(false);
        markDraft(false);
        onClose();
        router.replace(href, { scroll: false });
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
      setStatus(
        isConnectionError(error)
          ? `Your edits are still in this editor. Check your connection and that the app is running, then try ${save ? "Save as new draft" : "Update preview"} again.`
          : errorMessage(error),
      );
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
      <div className="document-editor-content" hidden={confirmClose}>
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
            ? "Read-only example. Download PDF or Word files from Documents."
            : "Save as a new draft. Your original stays unchanged."}
        </p>
        <p role="status" className="editor-status">
          {status}
        </p>
        {document.mode === "view" && <p>{document.notice}</p>}
        {document.mode !== "view" && (
          <div className="editor-navigation">
            {compact && (
              <div
                role="tablist"
                aria-label="Document view"
                className="editor-pane-tabs"
              >
                {(["edit", "preview"] as const).map((name, index) => (
                  <button
                    key={name}
                    ref={(button) => {
                      paneTabs.current[index] = button;
                    }}
                    type="button"
                    role="tab"
                    id={`${navigationId}-${name}-tab`}
                    aria-controls={`${navigationId}-${name}-panel`}
                    aria-selected={pane === name}
                    tabIndex={pane === name ? 0 : -1}
                    onClick={() => setPane(name)}
                    onKeyDown={(event) => {
                      let next: number;
                      if (
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowRight"
                      )
                        next = 1 - index;
                      else if (event.key === "Home") next = 0;
                      else if (event.key === "End") next = 1;
                      else return;
                      event.preventDefault();
                      setPane(next === 0 ? "edit" : "preview");
                      paneTabs.current[next]?.focus();
                    }}
                  >
                    {name === "edit" ? "Edit" : "Preview"}
                  </button>
                ))}
              </div>
            )}
            {document.mode === "blocks" && (
              <label
                className="editor-section-jump"
                hidden={compact && pane !== "edit"}
              >
                Document section
                <select
                  value={blocks.length ? blockIndex : ""}
                  disabled={busy || !blocks.length}
                  onChange={(event) => {
                    const index = Number(event.target.value);
                    pendingBlock.current = index;
                    setBlockIndex(index);
                    setPane("edit");
                  }}
                >
                  {!blocks.length && <option value="">No text sections</option>}
                  {blocks.map(([, value], index) => {
                    const text = value.replace(/\s+/g, " ").trim();
                    return (
                      <option key={index} value={index}>
                        Section {index + 1} ·{" "}
                        {text
                          ? `${text.slice(0, 64)}${text.length > 64 ? "…" : ""}`
                          : "Empty section"}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>
        )}
        <div
          className={`editor-columns${document.mode === "view" ? " is-read-only" : ""}`}
        >
          <section
            id={`${navigationId}-edit-panel`}
            role={compact ? "tabpanel" : undefined}
            aria-label={compact ? undefined : "Edit document"}
            aria-labelledby={compact ? `${navigationId}-edit-tab` : undefined}
            hidden={document.mode === "view" || (compact && pane !== "edit")}
          >
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
                        Text format
                        <select
                          aria-label="Text format"
                          value={style}
                          onChange={(event) =>
                            updateBlock(index, 0, event.target.value)
                          }
                        >
                          {styles.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Text
                        <textarea
                          ref={(field) => {
                            blockFields.current[index] = field;
                          }}
                          aria-label="Text"
                          rows={3}
                          value={value}
                          onFocus={() => setBlockIndex(index)}
                          onChange={(event) =>
                            updateBlock(index, 1, event.target.value)
                          }
                        />
                      </label>
                      <div className="editor-section-actions">
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move up section ${index + 1}`}
                          disabled={index === 0}
                          onClick={() => moveBlock(index, -1)}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                          Move up
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move down section ${index + 1}`}
                          disabled={index === blocks.length - 1}
                          onClick={() => moveBlock(index, 1)}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                          Move down
                        </button>
                        <button
                          type="button"
                          aria-label="Remove text section"
                          onClick={() => {
                            const next = Math.max(
                              0,
                              Math.min(index, blocks.length - 2),
                            );
                            pendingBlock.current = next;
                            setBlockIndex(next);
                            setBlocks((items) =>
                              items.filter((_, item) => item !== index),
                            );
                            changed();
                          }}
                        >
                          Remove text section
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      pendingBlock.current = blocks.length;
                      setBlockIndex(blocks.length);
                      setBlocks((items) => [...items, ["text", ""]]);
                      changed();
                    }}
                  >
                    Add text section
                  </button>
                </>
              ) : null}
            </fieldset>
          </section>
          <section
            className="editor-pdf-pane"
            id={`${navigationId}-preview-panel`}
            role={compact && document.mode !== "view" ? "tabpanel" : undefined}
            aria-label={
              compact && document.mode !== "view" ? undefined : "PDF preview"
            }
            aria-labelledby={
              compact && document.mode !== "view"
                ? `${navigationId}-preview-tab`
                : undefined
            }
            hidden={document.mode !== "view" && compact && pane !== "preview"}
          >
            <div className="editor-pdf-actions">
              <a
                ref={downloadLink}
                className="button secondary editor-pdf-file-action"
                aria-label="Download PDF"
                title="Download PDF"
                download={
                  document.document === "resume" ? "cv.pdf" : "cover-letter.pdf"
                }
              >
                <Download aria-hidden="true" />
                <span>Download PDF</span>
              </a>
              {canOpenNativeTab && (
                <a
                  ref={previewLink}
                  target="_blank"
                  rel="noopener"
                  className="button secondary editor-pdf-file-action"
                  aria-label="Open in new tab"
                  title="Open in new tab"
                >
                  <ExternalLink aria-hidden="true" />
                  <span>Open in new tab</span>
                </a>
              )}
              <button
                type="button"
                className="secondary editor-pdf-zoom"
                aria-label="Zoom PDF"
                aria-pressed={zoomed}
                disabled={readingText}
                title={zoomed ? "Fit PDF to width" : "Zoom PDF"}
                onClick={() => setZoomed(!zoomed)}
              >
                <ZoomIn aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setReadingText(!readingText)}
              >
                {readingText ? "View page" : "Read text"}
              </button>
            </div>
            <EditorPdfPreview
              pdf={pdf}
              zoomed={zoomed}
              readingText={readingText}
            />
          </section>
        </div>
        {document.mode !== "view" && (
          <footer>
            <button disabled={busy} onClick={() => build(false)}>
              Update preview
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => build(true)}
            >
              Save as new draft
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
