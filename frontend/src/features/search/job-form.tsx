"use client";

import {
  Field,
  Form,
  Select,
  TextArea,
  text,
  values,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import type { Job } from "@/lib/models";
import { payPeriods } from "./profile-form";

export function JobForm({ job, onSaved }: { job?: Job; onSaved?: () => void }) {
  const { run } = useWorkspace();
  const salary = typeof job?.salary === "object" ? job.salary : {};
  return (
    <Form
      onSave={async (data) => {
        await run("job", {
          ...values(data),
          ...(job ? { id: job.id } : {}),
          requirements: text(data, "requirements")
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          salary: {
            min: Number(text(data, "salary_min")),
            max: Number(text(data, "salary_max")),
            currency: text(data, "salary_currency"),
            period: text(data, "salary_period"),
            basis: text(data, "salary_basis"),
          },
          expectation: {
            target: text(data, "expectation_target"),
            basis: text(data, "expectation_basis"),
            source: text(data, "expectation_source"),
            confidence: text(data, "expectation_confidence"),
          },
        });
        onSaved?.();
      }}
    >
      <Field
        label="Job title"
        name="title"
        defaultValue={job?.title}
        required
      />
      <Field label="Employer" name="employer" defaultValue={job?.employer} />
      <Field
        label="Exact location"
        name="location"
        defaultValue={job?.location}
      />
      <Field label="Source URL" name="url" type="url" defaultValue={job?.url} />
      <Field
        label="Recruiter email — if the advert requests email"
        name="email"
        type="email"
        defaultValue={job?.email}
      />
      <TextArea
        label="Paste the job advert"
        name="description"
        defaultValue={job?.description}
      />
      <TextArea
        label="Requirements — one per line, review extracted requirements yourself"
        name="requirements"
        defaultValue={job?.requirements?.join("\n")}
      />
      <Field
        label="Closing date — if stated"
        name="closes"
        defaultValue={job?.closes}
      />
      <Field
        label="Listing posted — exact or approximate, if stated"
        name="posted_at"
        defaultValue={job?.posted_at}
      />
      <Field
        label="Listing reposted — if stated"
        name="reposted_at"
        defaultValue={job?.reposted_at}
      />
      <Field
        label="Seniority — if stated"
        name="seniority"
        defaultValue={job?.seniority}
      />
      <Select
        label="Work arrangement"
        name="work_arrangement"
        defaultValue={job?.work_arrangement || "unknown"}
        options={[
          ["unknown", "Unknown"],
          ["onsite", "Onsite"],
          ["hybrid", "Hybrid"],
          ["remote", "Remote"],
        ]}
      />
      <Select
        label="Your eligibility for this specific job"
        name="eligibility"
        defaultValue={job?.eligibility || "unknown"}
        options={[
          ["unknown", "Needs confirmation"],
          ["confirmed", "Confirmed"],
          ["conflict", "Confirmed conflict"],
        ]}
      />
      <Select
        label="Sponsorship"
        name="sponsorship"
        defaultValue={job?.sponsorship || "unknown"}
        options={[
          ["unknown", "Unknown"],
          ["yes", "Available"],
          ["no", "Unavailable"],
        ]}
      />
      <Select
        label="Prior application"
        name="prior_application"
        defaultValue={job?.prior_application || "none"}
        options={[
          ["none", "None recorded"],
          ["submitted", "Already submitted"],
          ["rejected", "Previously rejected"],
        ]}
      />
      <Select
        label="Availability"
        name="availability"
        defaultValue={job?.availability || "unverified"}
        options={[
          ["unverified", "Not verified"],
          ["retrieved", "I checked the live vacancy"],
          ["closed", "Closed"],
        ]}
      />
      <details>
        <summary>Salary evidence and expectation</summary>
        <Field
          label="Advertised minimum"
          name="salary_min"
          type="number"
          step="any"
          defaultValue={salary.min || 0}
        />
        <Field
          label="Advertised maximum"
          name="salary_max"
          type="number"
          step="any"
          defaultValue={salary.max || 0}
        />
        <Field
          label="Currency"
          name="salary_currency"
          defaultValue={salary.currency || "USD"}
        />
        <Select
          label="Pay period"
          name="salary_period"
          options={payPeriods}
          defaultValue={salary.period || "month"}
        />
        <Select
          label="Pay basis"
          name="salary_basis"
          options={[
            ["unknown", "Unknown"],
            ["gross_base", "Gross base"],
          ]}
          defaultValue={salary.basis || "unknown"}
        />
        <Field
          label="Proposed expectation"
          name="expectation_target"
          defaultValue={job?.expectation?.target}
        />
        <TextArea
          label="Reason and evidence"
          name="expectation_basis"
          defaultValue={job?.expectation?.basis}
        />
        <Field
          label="Salary source URL"
          name="expectation_source"
          type="url"
          defaultValue={job?.expectation?.source}
        />
        <Select
          label="Confidence"
          name="expectation_confidence"
          options={[
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
          defaultValue={job?.expectation?.confidence || "low"}
        />
      </details>
      <button>Save job</button>
    </Form>
  );
}
