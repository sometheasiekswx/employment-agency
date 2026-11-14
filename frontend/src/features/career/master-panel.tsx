"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Action, Check, Form, checked } from "@/components/controls";
import type { MasterProposal } from "@/lib/models";

type ReviewProposal = Omit<MasterProposal, "conflicts"> & {
  conflicts: {
    candidate_index: number;
    fact_id: string;
    existing_dates: string;
  }[];
};

export function MasterPanel({ focusRequest = 0 }: { focusRequest?: number }) {
  const { state, client, run } = useWorkspace();
  const master = state._master;
  const [proposal, setProposal] = useState<ReviewProposal>();
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const hasSelectedConflict = proposal?.conflicts.some(
    (conflict) => !excluded.has(conflict.candidate_index),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusRequest) heading.current?.focus();
  }, [focusRequest]);
  if (!master.exists)
    return (
      <section className="secondary-panel career-master-panel">
        <h2 id="master-resume" tabIndex={-1} ref={heading}>
          Master resume
        </h2>
        <p>
          Import a resume below or place it at <code>{master.path}</code> in
          your workspace.
        </p>
      </section>
    );
  return (
    <section className="secondary-panel career-master-panel">
      <h2 id="master-resume" tabIndex={-1} ref={heading}>
        Master resume
      </h2>
      <p>
        <code>{master.path}</code> ·{" "}
        {master.changed
          ? "Changes need your review before generating applications."
          : "Up to date with your confirmed source."}
      </p>
      <Action
        run={async () => {
          setProposal(await client.action<ReviewProposal>("master-propose"));
          setExcluded(new Set());
        }}
      >
        Review master changes
      </Action>
      {proposal && proposal.sha256 === master.sha256 && (
        <details open>
          <summary>Review master changes</summary>
          <details>
            <summary>Source changes</summary>
            <pre>{proposal.diff}</pre>
          </details>
          <h3>Proposed contact details</h3>
          {Object.values(proposal.identity).some(Boolean) ? (
            <dl>
              {Object.entries(proposal.identity)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p>
              No contact detail changes were proposed. Check{" "}
              <a href="#career-details">Your details</a> before preparing an
              application.
            </p>
          )}
          <Form
            key={proposal.sha256}
            onSave={async (data) => {
              if (!checked(data, "confirmed"))
                throw new Error("Review and confirm the master changes first.");
              await run("master-accept", {
                sha256: proposal.sha256,
                confirmed: true,
                selected_candidates: proposal.candidates.flatMap((_, index) =>
                  excluded.has(index) ? [] : [index],
                ),
              });
              setProposal(undefined);
            }}
          >
            <fieldset>
              <legend>Proposed career facts</legend>
              <p>
                Keep the statements you can confirm. Uncheck headings, names or
                other lines you do not want used as career evidence.
              </p>
              {hasSelectedConflict && (
                <p>
                  Exclude the marked facts or resolve the conflicting dates in
                  your supplementary facts before confirming.
                </p>
              )}
              {proposal.candidates.map((fact, index) => {
                const conflicts = proposal.conflicts.filter(
                  (conflict) => conflict.candidate_index === index,
                );
                return (
                  <div key={index}>
                    <Check
                      label={[fact.text, fact.association, fact.dates]
                        .filter(Boolean)
                        .join(" — ")}
                      checked={!excluded.has(index)}
                      aria-describedby={
                        conflicts.length
                          ? `master-conflict-${index}`
                          : undefined
                      }
                      onChange={(event) => {
                        const next = new Set(excluded);
                        if (event.currentTarget.checked) next.delete(index);
                        else next.add(index);
                        setExcluded(next);
                      }}
                    />
                    {conflicts.length > 0 && (
                      <div id={`master-conflict-${index}`}>
                        {conflicts.map((conflict) => (
                          <p key={conflict.fact_id}>
                            Dates conflict with{" "}
                            <a href={`#career-fact-${conflict.fact_id}`}>
                              a supplementary fact
                            </a>{" "}
                            ({conflict.existing_dates}).
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {proposal.candidates.length === 0 && (
                <p>No career facts were proposed.</p>
              )}
            </fieldset>
            <p>
              Supplementary facts remain. Previous master-derived facts are
              retired with their history preserved.
            </p>
            <Check
              name="confirmed"
              label="I reviewed the master changes and confirm the selected facts"
            />
            <button className="positive" disabled={hasSelectedConflict}>
              Confirm master updates
            </button>
          </Form>
        </details>
      )}
    </section>
  );
}
