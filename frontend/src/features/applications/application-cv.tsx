"use client";

import { useId, useState, type ReactNode } from "react";
import { ScanText } from "lucide-react";
import { Action } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { downloadBlob } from "@/lib/api";
import type { Application } from "@/lib/models";
import { ApplicationPdf } from "./application-pdf";
import { DemoDraftEditor } from "./demo-draft-editor";
import { FileLink } from "./file-link";

export function ApplicationCv({
  app,
  active,
  onEdit,
  children,
}: {
  app: Application;
  active: boolean;
  onEdit: (opener: HTMLButtonElement) => Promise<void>;
  children?: ReactNode;
}) {
  const { client } = useWorkspace();
  const heading = useId();
  const [readingText, setReadingText] = useState(false);
  const [editingDemo, setEditingDemo] = useState(false);
  const [hasOpened, setHasOpened] = useState(active);
  if (active && !hasOpened) setHasOpened(true);
  const demo = app.demo_draft ? client.demoDrafts : undefined;
  const hasPdf = Boolean(app.documents?.["resume.pdf"]);

  return (
    <section
      className="application-cv"
      aria-labelledby={heading}
      hidden={!active}
    >
      <div className="application-document-toolbar">
        <h3 id={heading} tabIndex={-1}>
          CV
        </h3>
        <div className="actions">
          {hasPdf && (
            <>
              <FileLink id={app.id} name="resume.pdf" download>
                Download CV
              </FileLink>
              {!client.preview && <Action run={onEdit}>Edit CV</Action>}
              <button
                type="button"
                className="secondary application-cv-reading"
                aria-label={readingText ? "View page" : "Read text"}
                onClick={() => setReadingText((value) => !value)}
              >
                <ScanText size={17} aria-hidden="true" />
                <span>{readingText ? "View page" : "Read text"}</span>
              </button>
            </>
          )}
          {demo && (
            <>
              <Action
                previewAllowed
                run={async () => {
                  const cv = demo.document(app.id, "resume");
                  if (!cv?.trim())
                    throw new Error("Add some draft text before downloading.");
                  const { demoPdfDocument } =
                    await import("@/lib/demo-draft-downloads");
                  downloadBlob(await demoPdfDocument(cv), "cv-draft.pdf");
                }}
              >
                Download CV
              </Action>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingDemo(!editingDemo)}
              >
                {editingDemo ? "View CV" : "Edit CV"}
              </button>
            </>
          )}
        </div>
      </div>
      {children}
      {demo ? (
        editingDemo ? (
          <DemoDraftEditor id={app.id} session={demo} />
        ) : (
          <div className="application-demo-cv">
            {demo.document(app.id, "resume")}
          </div>
        )
      ) : hasPdf ? (
        hasOpened && (
          <ApplicationPdf
            id={app.id}
            name="resume.pdf"
            readingText={readingText}
          />
        )
      ) : (
        <p className="muted">The CV file is unavailable for this record.</p>
      )}
    </section>
  );
}
