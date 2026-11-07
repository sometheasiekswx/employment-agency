"use client";

import { useId } from "react";
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
  ["roles", "Target roles", "e.g. Engineer, Analyst"],
  ["locations", "Locations in priority order", "e.g. Toronto, Melbourne"],
  ["seniority", "Seniority levels", "e.g. Junior, Mid-level"],
  ["arrangements", "Work arrangements", "e.g. Remote, Hybrid"],
  ["exclude", "Employers, industries or keywords to exclude"],
  ["work_rights", "Confirmed work rights"],
] as const;
const matchFields = [
  ["roles", "Role"],
  ["locations", "Location"],
  ["seniority", "Seniority"],
  ["arrangements", "Work arrangement"],
] as const;
export const payPeriods = [
  ["month", "Monthly"],
  ["year", "Annual"],
  ["hour", "Hourly"],
] as const;

export function ProfileForm({ profile }: { profile?: Profile }) {
  const { run, selectProfile } = useWorkspace();
  const listHelpId = useId();
  const matchHelpId = useId();
  const hard = profile?.hard || ["roles", "locations"];
  return (
    <Form
      className="search-profile-form"
      onSave={async (data) => {
        const input: RequestData = {
          id: profile?.id || "",
          name: text(data, "name"),
          minimum: Number(text(data, "minimum")),
          currency: text(data, "currency"),
          period: text(data, "period"),
          template: text(data, "template"),
          hard: data.getAll("hard").map(String),
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
      <p className="search-profile-help" id={listHelpId}>
        Separate multiple entries with commas.
      </p>
      {listFields.map(([name, label, placeholder]) => (
        <Field
          key={name}
          name={name}
          label={label}
          placeholder={placeholder}
          aria-describedby={listHelpId}
          defaultValue={profile?.[name]?.join(", ")}
        />
      ))}
      <fieldset
        className="search-required-matches"
        aria-describedby={matchHelpId}
      >
        <legend>Required matches</legend>
        <p id={matchHelpId}>
          Recommended excludes listings with a known mismatch on a checked
          preference. Missing details remain marked for review.
        </p>
        <div className="search-match-options">
          {matchFields.map(([value, label]) => (
            <Check
              key={value}
              name="hard"
              value={value}
              label={label}
              defaultChecked={hard.includes(value)}
            />
          ))}
          {hard
            .filter((value) => !matchFields.some(([known]) => known === value))
            .map((value, index) => (
              <input
                key={`${value}-${index}`}
                type="hidden"
                name="hard"
                value={value}
              />
            ))}
        </div>
      </fieldset>
      <Check
        label="Require employer sponsorship"
        name="needs_sponsorship"
        defaultChecked={profile?.needs_sponsorship}
      />
      <div className="grid">
        <Field
          label="Private minimum base pay before tax"
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
