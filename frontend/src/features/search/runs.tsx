"use client";

import {
  Action,
  Check,
  Field,
  Form,
  Json,
  Select,
  checked,
  text,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";

export function RunForm() {
  const { run, profileId } = useWorkspace();
  return (
    <Form
      onSave={async (data) => {
        if (!profileId) throw new Error("Save a search profile first.");
        await run("run", {
          profile_id: profileId,
          count: Number(text(data, "count")),
          discover: checked(data, "discover"),
          mode: text(data, "mode"),
          model: text(data, "model"),
          input_per_million: Number(text(data, "input_per_million")),
          output_per_million: Number(text(data, "output_per_million")),
          budget: Number(text(data, "budget")),
          approve_budget: checked(data, "approve_budget"),
        });
      }}
    >
      <Field
        label="Maximum applications"
        name="count"
        type="number"
        min="1"
        max="20"
        defaultValue="5"
      />
      <Check
        label="Refresh configured live sources first"
        name="discover"
        defaultChecked
      />
      <Select
        label="Preparation mode"
        name="mode"
        options={[
          ["local", "Local fact-based templates — no AI cost"],
          ["openai", "OpenAI fact selection — paid API"],
        ]}
      />
      <details>
        <summary>OpenAI run configuration</summary>
        <p>
          Grant consent in Settings and set OPENAI_API_KEY in the launcher
          environment. Enter current pricing and approve a budget. Reservations
          are estimates, not a billing guarantee; also set provider-side limits.
        </p>
        <Field label="Model ID" name="model" />
        <Field
          label="Input USD per million tokens"
          name="input_per_million"
          type="number"
          min="0"
          step="any"
          defaultValue="0"
        />
        <Field
          label="Output USD per million tokens"
          name="output_per_million"
          type="number"
          min="0"
          step="any"
          defaultValue="0"
        />
        <Field
          label="Maximum run budget USD"
          name="budget"
          type="number"
          min="0"
          step="any"
          defaultValue="0"
        />
        <Check
          label="I checked the rates and approve this run budget"
          name="approve_budget"
        />
      </details>
      <button>Start bounded run</button>
    </Form>
  );
}

export function Runs() {
  const { state, run } = useWorkspace();
  return (
    <section>
      <h2>Runs</h2>
      <div id="runs">
        {state.runs.map((item) => (
          <div key={item.id}>
            <p>
              <strong>{item.profile.name}</strong> · {item.status} ·{" "}
              {item.packages.length}/{item.count} packages
              <br />
              <small>
                {item.note} Reserved: ${item.reserved.toFixed(4)}
              </small>
            </p>
            {item.errors.length > 0 && (
              <Json className="error" value={item.errors} />
            )}
            <div className="actions">
              {item.status === "running" ? (
                <Action
                  run={async () => {
                    await run("cancel", { id: item.id });
                  }}
                >
                  Cancel after current operation
                </Action>
              ) : (
                ["paused", "failed", "cancelled"].includes(item.status) && (
                  <Action
                    run={async () => {
                      await run("resume", { id: item.id });
                    }}
                  >
                    Resume
                  </Action>
                )
              )}
            </div>
          </div>
        ))}
        {!state.runs.length && <p>No runs yet.</p>}
      </div>
    </section>
  );
}
