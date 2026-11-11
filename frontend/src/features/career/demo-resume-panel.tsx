"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Field, Form, TextArea } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { maxResumeLength, readDemoResume } from "@/lib/demo-resume";
import type { DemoDraftSession } from "@/lib/demo-drafts";

export function DemoResumePanel({ session }: { session: DemoDraftSession }) {
  const { notify } = useWorkspace();
  const [review, setReview] = useState("");
  const [usingOwn, setUsingOwn] = useState(session.usingVisitorResume);
  const [revision, setRevision] = useState(0);
  const reviewArea = useRef<HTMLTextAreaElement>(null);
  return (
    <section className="secondary-panel demo-resume-panel">
      <div className="secondary-section-heading">
        <h2 id="import-resume" tabIndex={-1}>
          Résumé for new drafts
        </h2>
        <FileText size={18} aria-hidden="true" />
      </div>
      <p>
        {usingOwn
          ? "New drafts use the résumé you reviewed in this tab."
          : "New drafts use the demo résumé. You can use your own file below."}
      </p>
      <div className="actions">
        {session.demoResume?.pdf && (
          <a
            className="button secondary"
            href={session.demoResume.pdf}
            target="_blank"
            rel="noopener noreferrer"
          >
            View demo master PDF
          </a>
        )}
        {usingOwn && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              session.useDemoResume();
              setUsingOwn(false);
              setReview("");
              notify("New drafts will use the demo résumé.");
            }}
          >
            Use demo résumé
          </button>
        )}
      </div>
      <Form
        previewAllowed
        onSave={async (data) => {
          const file = data.get("file");
          if (!(file instanceof File)) throw new Error("Choose a résumé file.");
          setReview(await readDemoResume(file));
          setRevision((value) => value + 1);
          // The review form is revealed after reading succeeds.
          requestAnimationFrame(() => reviewArea.current?.focus());
        }}
      >
        <Field
          label="Your résumé file"
          name="file"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          required
        />
        <small>
          PDF with selectable text, Word (.docx), or plain text, up to 10 MB.
          The file stays in this tab.
        </small>
        <button type="submit">Read résumé</button>
      </Form>
      {review && (
        <Form
          key={revision}
          previewAllowed
          onSave={async (data) => {
            session.useResume(String(data.get("resume") ?? ""));
            setUsingOwn(true);
            setReview("");
            notify("Your résumé is ready for drafts in this tab.");
          }}
        >
          <label>
            Review extracted résumé text
            <textarea
              name="resume"
              rows={10}
              defaultValue={review}
              autoComplete="off"
              spellCheck={false}
              maxLength={maxResumeLength}
              ref={reviewArea}
              required
            />
          </label>
          <button type="submit">Use this résumé</button>
        </Form>
      )}
      {!review && usingOwn && (
        <details>
          <summary>Review your résumé</summary>
          <Form
            previewAllowed
            onSave={async (data) => {
              session.useResume(String(data.get("resume") ?? ""));
              notify("Résumé updated for new drafts.");
            }}
          >
            <TextArea
              label="Résumé text"
              name="resume"
              rows={10}
              defaultValue={session.resume}
              maxLength={maxResumeLength}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button type="submit">Update résumé</button>
          </Form>
        </details>
      )}
    </section>
  );
}
