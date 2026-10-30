"use client";

import { useWorkspace } from "@/components/workspace-provider";
import {
  Action,
  Check,
  Field,
  Form,
  checked,
  values,
} from "@/components/controls";
import { FactForm } from "./fact-form";
import { MasterPanel } from "./master-panel";

export function CareerPage() {
  const { state, client, run, notify } = useWorkspace();
  const identity = state.identity;
  return (
    <>
      <MasterPanel />
      <div className="grid">
        <section>
          <h2>Your details</h2>
          <Form
            onSave={async (data) => {
              await run("identity", values(data));
            }}
          >
            <Field
              label="Name"
              name="name"
              defaultValue={identity.name}
              autoComplete="name"
            />
            <Field
              label="Email"
              name="email"
              type="email"
              defaultValue={identity.email}
              autoComplete="email"
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={identity.phone}
              autoComplete="tel"
            />
            <Field
              label="Current location / relocation statement"
              name="location"
              defaultValue={identity.location}
            />
            <Field
              label="Languages"
              name="languages"
              defaultValue={identity.languages}
            />
            <button>Save details</button>
          </Form>
        </section>
        <section>
          <h2>Build your career evidence</h2>
          <p>
            Import your master resume, then review extracted statements. Add
            experience that never made it onto your resume.
          </p>
          <Form
            onSave={async (data) => {
              const file = data.get("file");
              const limit = (client.hosted ? 2 : 10) * 1024 * 1024;
              if (!(file instanceof File) || !file.size || file.size > limit)
                throw new Error(
                  `Choose a file up to ${client.hosted ? 2 : 10} MB.`,
                );
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (let index = 0; index < bytes.length; index += 8192)
                binary += String.fromCharCode(
                  ...bytes.subarray(index, index + 8192),
                );
              const result = await run<{
                candidates: number;
                truncated?: boolean;
              }>(
                "import",
                {
                  name: file.name,
                  data: btoa(binary),
                  use_as_master: checked(data, "use_as_master"),
                },
                "",
              );
              notify(
                `${result.candidates} candidate facts imported; review before confirming.${result.truncated ? " Import truncated at 500 candidates." : ""}`,
              );
            }}
          >
            <Field
              label="Resume file"
              name="file"
              type="file"
              accept=".pdf,.docx,.tex,.txt,.md"
              required
            />
            <Check
              label="Use this file as my master resume"
              name="use_as_master"
              defaultChecked
            />
            <small>
              Up to {client.hosted ? 2 : 10} MB. Scanned files need OCR text.
              Imported TeX is never executed.
            </small>
            <button>Import for review</button>
          </Form>
          <details>
            <summary>Add experience or a skill</summary>
            <FactForm />
          </details>
        </section>
      </div>
      <section>
        <h2>
          Career facts{" "}
          <span className="pill">
            {
              state.facts.filter(
                (fact) => fact.confirmed && !fact.retired && !fact.conflict,
              ).length
            }{" "}
            confirmed
          </span>
        </h2>
        <p className="muted">
          Only confirmed, conflict-free facts are used. Editing resets
          confirmation. A shared conflict key identifies competing versions of a
          claim.
        </p>
        {state.facts
          .filter((fact) => !fact.retired)
          .map((fact) => (
            <div className="fact" key={fact.id}>
              <span className="pill">
                {fact.conflict
                  ? "Conflict — resolve before use"
                  : fact.confirmed
                    ? "Confirmed"
                    : "Needs your confirmation"}
              </span>
              <p>{fact.text}</p>
              <small>
                {[fact.association, fact.dates, fact.source?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              <div className="actions">
                {!fact.confirmed && !fact.conflict && (
                  <Action
                    run={async () => {
                      await run("confirm", { id: fact.id });
                    }}
                  >
                    Confirm
                  </Action>
                )}
                <Action
                  run={async () => {
                    await run("retire", { id: fact.id });
                  }}
                >
                  Retire
                </Action>
              </div>
              <details>
                <summary>Edit fact</summary>
                <FactForm fact={fact} />
              </details>
            </div>
          ))}
        {!state.facts.some((fact) => !fact.retired) && (
          <p className="empty">
            No career facts yet. Import a resume or add your first experience
            above.
          </p>
        )}
      </section>
    </>
  );
}
