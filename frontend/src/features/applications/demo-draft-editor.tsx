"use client";

import { useState } from "react";
import { Action, TextArea } from "@/components/controls";
import { downloadBlob } from "@/lib/api";
import { maxResumeLength } from "@/lib/demo-resume";
import type { DemoDocument, DemoDraftSession } from "@/lib/demo-drafts";

const documents = [
  ["resume", "CV"],
  ["coverLetter", "Cover letter"],
] as const;

export function DemoDraftEditor({
  id,
  session,
}: {
  id: string;
  session: DemoDraftSession;
}) {
  const [document, select] = useState<DemoDocument>("resume");
  const label = document === "resume" ? "CV" : "Cover letter";
  const download = async (format: "docx" | "pdf") => {
    const text = session.document(id, document)?.trim();
    if (!text) throw new Error("Add some draft text before downloading.");
    const { demoWordDocument, demoPdfDocument } =
      await import("@/lib/demo-draft-downloads");
    const file =
      format === "docx"
        ? await demoWordDocument(text)
        : await demoPdfDocument(text);
    downloadBlob(
      file,
      `${document === "resume" ? "cv" : "cover-letter"}-draft.${format}`,
    );
  };
  return (
    <section className="demo-draft-editor" aria-label="Edit demo draft">
      <div
        className="actions segmented-control"
        role="group"
        aria-label="Draft document"
      >
        {documents.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={document === key}
            onClick={() => select(key)}
          >
            {text}
          </button>
        ))}
      </div>
      <TextArea
        key={document}
        label={`${label} draft`}
        rows={11}
        defaultValue={session.document(id, document) ?? ""}
        maxLength={maxResumeLength + 2_000}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) =>
          session.editDocument(id, document, event.currentTarget.value)
        }
      />
      <div className="actions">
        <Action previewAllowed run={() => download("docx")}>
          Download Word
        </Action>
        <Action previewAllowed run={() => download("pdf")}>
          Download PDF
        </Action>
      </div>
      <p className="muted">
        Edits stay in this tab. Download a copy to keep it.
      </p>
    </section>
  );
}
