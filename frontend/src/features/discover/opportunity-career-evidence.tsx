"use client";

import { Check, CircleAlert, Link2, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Action, Form, TextArea, text } from "@/components/controls";
import type { Fact, Job } from "@/lib/models";
import type { RequirementEvidence } from "./discovery";
import "./opportunity-career-evidence.css";

type SaveEvidence = (requirement: string, details: string) => Promise<void>;

function EvidenceFacts({ facts }: { facts: Fact[] }) {
  return (
    <ul>
      {facts.map((fact) => (
        <li key={fact.id}>
          {fact.text}
          {fact.source?.name && <small>Source: {fact.source.name}</small>}
        </li>
      ))}
    </ul>
  );
}

function RequirementRow({
  item,
  onAddEvidence,
}: {
  item: RequirementEvidence;
  onAddEvidence?: SaveEvidence;
}) {
  const { requirement, facts, careerFacts, confirmedForJob } = item;
  const hasCareerEvidence = careerFacts.length > 0;
  const confirmed = hasCareerEvidence || confirmedForJob;
  const iconState = confirmed
    ? "confirmed"
    : facts.length
      ? "related"
      : "missing";
  const EvidenceIcon = confirmed ? Check : facts.length ? Link2 : CircleAlert;
  const editorId = useId();
  const add = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) editor.current?.querySelector("textarea")?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing && !saving && restoreFocus.current) {
      restoreFocus.current = false;
      add.current?.focus({ preventScroll: true });
    }
  }, [editing, saving]);

  const closeEditor = () => {
    restoreFocus.current = true;
    setDetails("");
    setEditing(false);
  };

  return (
    <div className="discover-evidence-row">
      <span
        className={`discover-evidence-mark ${iconState}`}
        aria-hidden="true"
      >
        <EvidenceIcon size={15} />
      </span>
      <div>
        <strong>{requirement}</strong>
        {!confirmed && !facts.length && <p>No confirmed supporting evidence</p>}
        {confirmedForJob && (
          <p className="discover-evidence-confirmed">
            Confirmed by you for this job.
          </p>
        )}
        {hasCareerEvidence && <EvidenceFacts facts={careerFacts} />}
        {facts.length > 0 && (
          <>
            <p>Verify the full requirement.</p>
            <details>
              <summary>
                Related evidence ({facts.length}{" "}
                {facts.length === 1 ? "fact" : "facts"})
              </summary>
              <EvidenceFacts facts={facts} />
            </details>
          </>
        )}
        {onAddEvidence && (
          <>
            <div className="discover-evidence-actions">
              {!hasCareerEvidence && !editing && (
                <Action
                  aria-label={
                    confirmedForJob
                      ? `Add skill to career evidence for ${requirement}`
                      : `I have this skill: ${requirement}`
                  }
                  keepContentWhileBusy
                  run={async (button) => {
                    await onAddEvidence(requirement, "");
                    if (
                      document.activeElement === button ||
                      document.activeElement === document.body
                    )
                      add.current?.focus({ preventScroll: true });
                  }}
                >
                  {confirmedForJob
                    ? "Add skill to career evidence"
                    : "I have this skill"}
                </Action>
              )}
              <button
                type="button"
                className="secondary"
                ref={add}
                aria-expanded={editing}
                aria-controls={editing ? editorId : undefined}
                aria-label={`${editing ? "Cancel evidence" : "Add evidence"} for ${requirement}`}
                disabled={saving}
                onClick={() => {
                  if (!editing) setEditing(true);
                  else if (
                    !details.trim() ||
                    window.confirm("Discard this evidence draft?")
                  )
                    closeEditor();
                }}
              >
                {editing ? "Cancel evidence" : "Add evidence"}
              </button>
            </div>
            {editing && (
              <div
                className="discover-evidence-editor"
                id={editorId}
                ref={editor}
              >
                <Form
                  onBusyChange={setSaving}
                  onSave={async (data) => {
                    const written = text(data, "details").trim();
                    if (!written)
                      throw new Error("Enter a supporting example.");
                    await onAddEvidence(requirement, written);
                    closeEditor();
                  }}
                >
                  <TextArea
                    label={`Supporting example for ${requirement}`}
                    name="details"
                    value={details}
                    onChange={(event) => setDetails(event.currentTarget.value)}
                    maxLength={2000}
                    required
                  />
                  <p>
                    Saving confirms this example as reusable career evidence.
                  </p>
                  <button type="submit">Save evidence</button>
                </Form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function OpportunityCareerEvidence({
  job,
  rows,
  assessmentAvailable,
  onAddEvidence,
}: {
  job: Job;
  rows: RequirementEvidence[];
  assessmentAvailable: boolean;
  onAddEvidence?: SaveEvidence;
}) {
  const sectionId = useId();

  return (
    <section className="discover-evidence-section" aria-labelledby={sectionId}>
      <h3 id={sectionId}>
        <Sparkles size={17} aria-hidden="true" /> Career evidence
      </h3>
      {!assessmentAvailable && (
        <p className="discover-explanation">
          Matching is unavailable in this view. Saved documents and decisions
          remain available.
        </p>
      )}
      {rows.length ? (
        rows.map((item) => (
          <RequirementRow
            key={`${job.id}:${item.requirement}`}
            item={item}
            onAddEvidence={
              job.requirements?.includes(item.requirement)
                ? onAddEvidence
                : undefined
            }
          />
        ))
      ) : (
        <p className="discover-explanation">
          Read the original listing and add any requirements in Search
          preferences.
        </p>
      )}
    </section>
  );
}
