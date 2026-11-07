"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

export function EditorPdfPreview({
  pdf,
  zoomed,
  readingText,
}: {
  pdf: string;
  zoomed: boolean;
  readingText: boolean;
}) {
  const [loaded, setLoaded] = useState<{
    source: string;
    document: PDFDocumentProxy;
  }>();
  const [loadFailed, setLoadFailed] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [rendered, setRendered] = useState<{
    document: PDFDocumentProxy;
    page: number;
    failed: boolean;
    text?: string;
  }>();
  const surface = useRef<HTMLDivElement>(null);
  const document = loaded?.source === pdf ? loaded.document : undefined;
  const ready =
    rendered?.document === document && rendered?.page === pageNumber;

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        if (!active) return;
        GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = getDocument({
          data: Uint8Array.from(atob(pdf), (character) =>
            character.charCodeAt(0),
          ),
          cMapUrl: "/pdfjs/cmaps/",
          disableFontFace: true,
          useSystemFonts: true,
          useWasm: false,
        });
        const loadedDocument = await task.promise;
        if (!active) return;
        setPageNumber(1);
        setLoaded({ source: pdf, document: loadedDocument });
      } catch {
        if (active) setLoadFailed(pdf);
      }
    }
    void load();
    return () => {
      active = false;
      void task?.destroy().catch(() => {});
    };
  }, [pdf]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let task: RenderTask | undefined;
    async function draw(loadedDocument: PDFDocumentProxy) {
      try {
        const page = await loadedDocument.getPage(pageNumber);
        if (!active) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: 1680 / Math.max(original.width, original.height),
        });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute(
          "aria-label",
          `PDF page ${pageNumber} of ${loadedDocument.numPages}`,
        );
        task = page.render({ canvas, viewport });
        await task.promise;
        const text = await page
          .getTextContent()
          .then(({ items }) =>
            items
              .map((item) =>
                "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
              )
              .join("")
              .trim(),
          )
          .catch(() => undefined);
        if (!active) return;
        surface.current?.replaceChildren(canvas);
        setRendered({
          document: loadedDocument,
          page: pageNumber,
          failed: false,
          text,
        });
      } catch {
        if (active)
          setRendered({
            document: loadedDocument,
            page: pageNumber,
            failed: true,
          });
      }
    }
    void draw(document);
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, pageNumber]);

  const failed = loadFailed === pdf || (ready && rendered?.failed);
  return (
    <div className="editor-rendered-pdf">
      {document && document.numPages > 1 && (
        <div
          className="editor-pdf-pagination"
          role="group"
          aria-label="PDF pages"
        >
          <button
            type="button"
            aria-label="Previous PDF page"
            aria-disabled={pageNumber === 1}
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span role="status">
            Page {pageNumber} of {document.numPages}
          </span>
          <button
            type="button"
            aria-label="Next PDF page"
            aria-disabled={pageNumber === document.numPages}
            onClick={() =>
              setPageNumber((page) => Math.min(document.numPages, page + 1))
            }
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
      {failed ? (
        <p role="status">
          The inline preview is unavailable. Download the PDF to read it.
        </p>
      ) : !ready ? (
        <p role="status">Loading PDF preview…</p>
      ) : null}
      <div
        ref={surface}
        className={`editor-pdf-page${zoomed ? " is-zoomed" : ""}`}
        tabIndex={zoomed && ready ? 0 : undefined}
        role={zoomed ? "region" : undefined}
        aria-label={zoomed ? "Zoomed PDF page" : undefined}
        hidden={!ready || failed || readingText}
      />
      {readingText && ready && !failed && (
        <div
          className="editor-pdf-reading"
          role="region"
          aria-label={`PDF text, page ${pageNumber}`}
        >
          {rendered?.text ||
            "No text could be extracted from this page. Choose View page to see the original layout."}
        </div>
      )}
    </div>
  );
}
