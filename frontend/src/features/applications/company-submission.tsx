"use client";

import { useState } from "react";
import { Action, Check, Field, Form, TextArea, checked, text } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { safeUrl } from "@/lib/format";
import type { Application } from "@/lib/models";

type Handoff = {
  id: string;
  fingerprint: string;
  status?: string;
  binding: { destination: string; documents: { path: string; sha256: string }[] };
};

export function CompanySubmission({ app }: { app: Application }) {
  const { client, refresh, state } = useWorkspace();
  const [attempt, setAttempt] = useState<Handoff>();

  async function review() {
    const records = await client.action<Handoff[]>("company-submission-status", { application_id: app.id });
    setAttempt(records.find((record) => record.status === "handed_off") ??
      await client.action<Handoff>("company-submission-review", { application_id: app.id }));
  }

  const destination = safeUrl(attempt?.binding.destination);
  return (
    <details className="application-company-handoff">
      <summary>Apply yourself with a reserved slot</summary>
      {!attempt && <Action run={review}>Review documents and destination</Action>}
      {attempt && (
        <>
          <ul>{attempt.binding.documents.map((file) => <li key={file.path}>{file.path.split("/").at(-1)}</li>)}</ul>
          {destination && <p>{destination}</p>}
          {attempt.status === "handed_off" ? (
            <>
              {destination && <a href={destination} target="_blank" rel="noopener noreferrer">Open application site</a>}
              <Form onSave={async (data) => {
                setAttempt(await client.action<Handoff>("company-submission-resolve", {
                  id: attempt.id, outcome: text(data, "outcome"),
                  occurred_at: text(data, "occurred_at"), evidence: text(data, "evidence"),
                  confirmed: checked(data, "confirmed"),
                }));
                await refresh();
              }}>
                <label>
                  Verified outcome
                  <select name="outcome">
                    <option value="confirmed">Submitted</option>
                    <option value="not_sent">Verified no submission</option>
                  </select>
                </label>
                <Field
                  label={`Actual submission date and time, if submitted (${state._workspace.timezone})`}
                  name="occurred_at"
                  type="datetime-local"
                />
                <TextArea label="Evidence checked" name="evidence" required />
                <Check label="I verified this outcome" name="confirmed" required />
                <button>Record outcome</button>
              </Form>
            </>
          ) : attempt.status ? <p role="status">Outcome recorded.</p> : (
            <Form onSave={async (data) => {
              setAttempt(await client.action<Handoff>("company-submission-reserve", {
                id: attempt.id, fingerprint: attempt.fingerprint,
                application_id: app.id, approved: checked(data, "approved"),
              }));
              await refresh();
            }}>
              <Check label="I approve these documents and this destination" name="approved" required />
              <button>Reserve application slot</button>
            </Form>
          )}
        </>
      )}
    </details>
  );
}
