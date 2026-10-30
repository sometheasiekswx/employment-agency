"use client";

import { useState } from "react";
import { Action, Form, TextArea, text } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { displayDate, safeUrl } from "@/lib/format";
import type { Application, EditorDocument, Job } from "@/lib/models";
import { FileLink } from "./file-link";
import { ApplicationDetails } from "./application-details";

const fileLabels = {
  "resume.pdf": "CV PDF",
  "cover-letter.pdf": "Cover letter PDF",
  "resume.docx": "Edit resume (Word)",
  "cover-letter.docx": "Edit cover letter (Word)",
  "resume.tex": "Resume LaTeX",
  "cover-letter.tex": "Cover letter LaTeX",
  "application.eml": "Email draft",
  "evidence.json": "Source evidence",
};

export function ApplicationCard({
  app,
  job,
  city,
  onEdit,
}: {
  app: Application;
  job: Partial<Job>;
  city: string;
  onEdit: (document: EditorDocument, opener: HTMLButtonElement) => void;
}) {
  const { state, client, run } = useWorkspace();
  const [comment, setComment] = useState("");
  const timezone = state._workspace.timezone;
  const files = Object.entries(fileLabels).filter(
    ([file]) => app.documents?.[file],
  );
  return (
    <article className="dossier" data-application-id={app.id}>
      <div className="destination-label">
        <span>{city}</span>
        <span>Application dossier</span>
      </div>
      <h2>{app.title}</h2>
      <p>
        {app.employer} <span className="pill">{app.status}</span>
      </p>
      {app.fit_summary && <p className="fit-summary">{app.fit_summary}</p>}
      {Boolean(app.warnings?.length) && (
        <p className="warning">{app.warnings?.join(" · ")}</p>
      )}
      <ApplicationDetails app={app} job={job} timezone={timezone} />
      <div className="editor-actions">
        {(["resume", "cover-letter"] as const)
          .filter((document) => app.documents?.[`${document}.pdf`])
          .map((document) => (
            <Action
              key={document}
              run={async (button) => {
                onEdit(
                  await client.action<EditorDocument>("document-editor", {
                    id: app.id,
                    document,
                  }),
                  button,
                );
              }}
            >
              View / edit {document === "resume" ? "CV" : "cover letter"}
            </Action>
          ))}
      </div>
      <div className="actions">
        {files.slice(0, 2).map(([file, label]) => (
          <FileLink key={file} id={app.id} name={file}>
            {label}
          </FileLink>
        ))}
      </div>
      {files.length > 2 && (
        <details>
          <summary>Supporting files & source evidence</summary>
          <div className="actions">
            {files.slice(2).map(([file, label]) => (
              <FileLink key={file} id={app.id} name={file}>
                {label}
              </FileLink>
            ))}
          </div>
        </details>
      )}
      {Boolean(app.file_changes?.length) && (
        <div className="error">
          <p>
            Files changed on disk: {app.file_changes?.join(", ")}. The verified
            original is preserved for recovery.
          </p>
          <Action
            run={async () => {
              await run("adopt-edits", { id: app.id });
            }}
          >
            Validate edits as a new draft
          </Action>
        </div>
      )}
      {app.migration_warning && (
        <p className="error">{app.migration_warning}</p>
      )}
      {safeUrl(job.url) && (
        <p>
          <a href={safeUrl(job.url)} target="_blank" rel="noopener noreferrer">
            Open application listing
          </a>
        </p>
      )}
      <Form
        onSave={async (data, submitter) => {
          const status =
            submitter?.name === "status" ? submitter.value : undefined;
          if (!status && !text(data, "comment").trim())
            throw new Error("Enter a comment to save.");
          await run("review", {
            id: app.id,
            comment: text(data, "comment"),
            ...(status ? { status } : {}),
          });
          setComment("");
        }}
      >
        <TextArea
          label="Comments"
          name="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <div className="actions">
          {app.status !== "submitted" && (
            <>
              {app.status !== "reviewed" && (
                <button name="status" value="reviewed">
                  Reviewed
                </button>
              )}
              {app.status !== "rejected" ? (
                <button name="status" value="rejected">
                  Reject
                </button>
              ) : (
                <button name="status" value="draft">
                  Return to Active
                </button>
              )}
              <button name="status" value="submitted">
                Submitted
              </button>
            </>
          )}
          <button>Save comment</button>
        </div>
      </Form>
      {app.comments.length > 0 && (
        <details>
          <summary>Review history ({app.comments.length})</summary>
          {app.comments.map((item, index) => (
            <p key={index}>
              <small>
                {displayDate(item.at, timezone)} ·{" "}
                {item.kind === "comment" ? "Comment" : item.status}
              </small>
              <br />
              {item.text}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}
