"use client";

import {
  Check,
  Field,
  Form,
  Select,
  checked,
  text,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { splitList } from "@/lib/format";
import type { Profile, RequestData } from "@/lib/models";

const listFields = [
  ["roles", "Roles, comma separated"],
  ["locations", "Locations, highest priority first"],
  ["seniority", "Seniority levels"],
  ["arrangements", "Work arrangements"],
  ["hard", "Hard filter categories: roles, locations, seniority, arrangements"],
  ["exclude", "Exclude employers, industries or keywords"],
  ["work_rights", "Confirmed work rights (context for your review)"],
] as const;
export const payPeriods = [
  ["month", "Monthly"],
  ["year", "Annual"],
  ["hour", "Hourly"],
] as const;

export function ProfileForm({ profile }: { profile?: Profile }) {
  const { run, selectProfile } = useWorkspace();
  return (
    <Form
      onSave={async (data) => {
        const input: RequestData = {
          id: profile?.id || "",
          name: text(data, "name"),
          minimum: Number(text(data, "minimum")),
          currency: text(data, "currency"),
          period: text(data, "period"),
          template: text(data, "template"),
        };
        for (const [key] of listFields) input[key] = splitList(text(data, key));
        for (const key of [
          "needs_sponsorship",
          "include_stretch",
          "include_unknown",
        ])
          input[key] = checked(data, key);
        const saved = await run<Profile>("profile", input);
        selectProfile(saved.id);
      }}
    >
      <Field
        label="Profile name"
        name="name"
        defaultValue={profile?.name}
        required
      />
      {listFields.map(([name, label]) => (
        <Field
          key={name}
          name={name}
          label={label}
          defaultValue={(
            profile?.[name] || (name === "hard" ? ["roles", "locations"] : [])
          ).join(", ")}
        />
      ))}
      <Check
        label="Require employer sponsorship"
        name="needs_sponsorship"
        defaultChecked={profile?.needs_sponsorship}
      />
      <div className="grid">
        <Field
          label="Private minimum gross base"
          name="minimum"
          type="number"
          min="0"
          step="any"
          defaultValue={profile?.minimum || 0}
        />
        <Field
          label="Currency"
          name="currency"
          defaultValue={profile?.currency || "USD"}
        />
      </div>
      <Select
        label="Pay period"
        name="period"
        options={payPeriods}
        defaultValue={profile?.period || "month"}
      />
      <Select
        label="Document style"
        name="template"
        options={[
          ["navy", "Navy"],
          ["plain", "Plain"],
        ]}
        defaultValue={profile?.template || "navy"}
      />
      <Check
        label="Include stretch roles with missing evidence"
        name="include_stretch"
        defaultChecked={profile?.include_stretch}
      />
      <Check
        label="Prepare drafts when eligibility or other checks need confirmation"
        name="include_unknown"
        defaultChecked={profile?.include_unknown}
      />
      <button>Save profile</button>
    </Form>
  );
}
