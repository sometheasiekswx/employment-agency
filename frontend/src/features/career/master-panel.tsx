"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Action, Check, Form, Json, checked } from "@/components/controls";
import type { MasterProposal } from "@/lib/models";

export function MasterPanel() {
  const { state, client, run } = useWorkspace();
  const master = state._master;
  const [proposal, setProposal] = useState<MasterProposal>();
  if (!master.exists)
    return (
      <section>
        <h2>Master resume</h2>
        <p>
          Import a resume below or place it at <code>{master.path}</code> in
          your workspace.
        </p>
      </section>
    );
  return (
    <section>
      <h2>Master resume</h2>
      <p>
        <code>{master.path}</code> ·{" "}
        {master.changed
          ? "Changes need your review before generating applications."
          : "Up to date with your confirmed source."}
      </p>
      <Action
        run={async () => {
          setProposal(await client.action<MasterProposal>("master-propose"));
        }}
      >
        Review master changes
      </Action>
      {proposal && proposal.sha256 === master.sha256 && (
        <details open>
          <summary>Review master changes</summary>
          <pre>{proposal.diff}</pre>
          {proposal.conflicts.length > 0 && (
            <>
              <h3>Conflicting supplementary facts</h3>
              <p>Correct or retire conflicting facts before confirming.</p>
              <Json value={proposal.conflicts} />
            </>
          )}
          <h3>Proposed contact details</h3>
          <Json value={proposal.identity} />
          <h3>Proposed career facts</h3>
          <ul>
            {proposal.candidates.map((fact, index) => (
              <li key={fact.id || index}>
                {[fact.text, fact.association, fact.dates]
                  .filter(Boolean)
                  .join(" — ")}
              </li>
            ))}
          </ul>
          <p>
            Supplementary facts remain. Previous master-derived facts are
            retired with their history preserved.
          </p>
          <Form
            onSave={async (data) => {
              if (!checked(data, "confirmed"))
                throw new Error("Review and confirm the proposed facts first.");
              await run("master-accept", {
                sha256: proposal.sha256,
                confirmed: true,
              });
              setProposal(undefined);
            }}
          >
            <Check
              name="confirmed"
              label="I reviewed these master changes and confirm the proposed facts"
            />
            <button className="positive">Confirm master updates</button>
          </Form>
        </details>
      )}
    </section>
  );
}
