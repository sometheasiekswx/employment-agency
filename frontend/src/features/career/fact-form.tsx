"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { Field, Form, TextArea, values } from "@/components/controls";
import type { Fact } from "@/lib/models";

export function FactForm({ fact }: { fact?: Fact }) {
  const { run } = useWorkspace();
  return (
    <Form
      onSave={async (data) => {
        await run("fact", { ...values(data), id: fact?.id || "" });
      }}
    >
      <TextArea
        label="Statement"
        name="text"
        defaultValue={fact?.text}
        required
      />
      <Field
        label="Category (experience, skill, education…)"
        name="category"
        defaultValue={fact?.category || "experience"}
      />
      <Field
        label="Employer or project — leave blank if unknown"
        name="association"
        defaultValue={fact?.association}
      />
      <Field label="Dates" name="dates" defaultValue={fact?.dates} />
      <Field
        label="Conflict key — optional"
        name="claim_key"
        defaultValue={fact?.claim_key}
      />
      <button>Save for confirmation</button>
    </Form>
  );
}
