"use client";

import { useEffect, useState } from "react";
import { Field, Form, Select, TextArea, text } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { displayDate, errorMessage, safeUrl } from "@/lib/format";
import type { ApplicationBlocker, Job, RequestData } from "@/lib/models";

type Employer = { id: string; name: string };
type Company = {
  employer: Employer | null;
  employers: Employer[];
  linked_listings: Pick<Job, "id" | "title">[];
  status: {
    unresolved?: {
      job_id?: string;
      history_id?: string;
      title: string;
      reason: string;
      date?: string;
    }[];
  };
};

function ConfirmEmployer({
  company,
  job,
  onSubmit,
}: {
  company: Company;
  job: Job;
  onSubmit: (data: RequestData) => Promise<void>;
}) {
  const [employer, setEmployer] = useState("");
  return (
    <Form
      onSave={async (data) =>
        onSubmit({
          job_id: job.id,
          employer_id: employer,
          name: text(data, "name"),
          requisition: text(data, "requisition"),
          confirmed: true,
        })
      }
    >
      {company.employers.length > 0 && (
        <Select
          label="Hiring employer"
          value={employer}
          options={[
            ["", "Enter a company"],
            ...company.employers.map(({ id, name }) => [id, name] as const),
          ]}
          onChange={(event) => setEmployer(event.currentTarget.value)}
        />
      )}
      {!employer && (
        <Field
          label="Hiring employer name"
          name="name"
          required
          maxLength={300}
        />
      )}
      <Field
        label="Requisition ID (optional)"
        name="requisition"
        maxLength={200}
      />
      <button>Confirm employer</button>
    </Form>
  );
}

function submissionTime(data: FormData) {
  const date = text(data, "date");
  const time = text(data, "time");
  return time ? `${date}T${time}` : date;
}

function CompanyException({
  job,
  blocker,
  onResolved,
}: {
  job: Job;
  blocker: ApplicationBlocker;
  onResolved: () => Promise<void>;
}) {
  const { client, profileId, state } = useWorkspace();
  const [company, setCompany] = useState<Company>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    client
      .action<Company>("company-roles", {
        job_id: job.id,
        profile_id: profileId,
      })
      .then(
        (result) => {
          if (active) setCompany(result);
        },
        (problem) => {
          if (active) setError(errorMessage(problem));
        },
      );
    return () => {
      active = false;
    };
  }, [client, job.id, profileId, retry]);

  const resolve = async (operation: string, data: RequestData) => {
    await client.action(operation, data);
    await onResolved();
  };
  const unresolved = company?.status.unresolved ?? [];
  const timezone = state._workspace.timezone;
  return (
    <>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Retry employer check
          </button>
        </>
      ) : !company ? (
        <p role="status">Checking employer history…</p>
      ) : null}
      {company && blocker.code === "employer_unresolved" && (
        <ConfirmEmployer
          company={company}
          job={job}
          onSubmit={(data) => resolve("company-map", data)}
        />
      )}
      {company && blocker.code === "company_history_unresolved" && (
        <>
          {unresolved.map((item, index) => (
            <div
              className="application-exception-question"
              key={item.job_id || item.history_id || index}
            >
              <p>
                <strong>{item.title}</strong> · {item.reason}
              </p>
              {item.date && (
                <p>Recorded date {displayDate(item.date, timezone)}</p>
              )}
              {item.job_id && item.reason === "Confirm the employer" && (
                <ConfirmEmployer
                  job={
                    state.jobs.find((entry) => entry.id === item.job_id) ?? {
                      ...job,
                      id: item.job_id,
                    }
                  }
                  company={company}
                  onSubmit={(data) => resolve("company-map", data)}
                />
              )}
              {item.job_id && item.reason === "Confirm the submission date" && (
                <Form
                  onSave={(data) =>
                    resolve("company-map", {
                      job_id: item.job_id,
                      employer_id: company.employer?.id,
                      submitted_on: submissionTime(data),
                      confirmed: true,
                    })
                  }
                >
                  <Field
                    label="Actual submission date"
                    name="date"
                    type="date"
                    required
                  />
                  <Field
                    label={`Time if known (${timezone})`}
                    name="time"
                    type="time"
                  />
                  <button>Confirm submission date</button>
                </Form>
              )}
              {item.history_id && company.linked_listings.length > 0 && (
                <Form
                  onSave={(data) =>
                    resolve("company-history-link", {
                      history_id: item.history_id,
                      job_id: text(data, "job_id"),
                      occurred_at: submissionTime(data),
                      confirmed: true,
                    })
                  }
                >
                  <Select
                    label="Original listing"
                    name="job_id"
                    required
                    options={[
                      ["", "Choose a listing"],
                      ...company.linked_listings.map(
                        ({ id, title }) => [id, title] as const,
                      ),
                    ]}
                  />
                  <Field
                    label="Actual submission date"
                    name="date"
                    type="date"
                    required
                  />
                  <Field
                    label={`Time if known (${timezone})`}
                    name="time"
                    type="time"
                  />
                  <button>Link recorded submission</button>
                </Form>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

export function ApplicationException({
  blocker,
  job,
  onResolved,
  mode,
}: {
  blocker: ApplicationBlocker;
  job: Job;
  onResolved: () => Promise<void>;
  mode: "self" | "agent";
}) {
  const { client } = useWorkspace();
  const company = [
    "employer_unresolved",
    "company_history_unresolved",
  ].includes(blocker.code);
  const destination = blocker.code === "destination_unverified";
  const listing = safeUrl(job.url);
  return (
    <div className="application-exception">
      <p role="status">{blocker.message}</p>
      {company && (
        <CompanyException
          key={blocker.code}
          job={job}
          blocker={blocker}
          onResolved={onResolved}
        />
      )}
      {destination && (
        <Form
          onSave={async (data) => {
            await client.action("application-destination", {
              job_id: job.id,
              channel: mode === "self" ? "website" : text(data, "channel"),
              value: text(data, "destination"),
              source_url: text(data, "source"),
              evidence: text(data, "evidence"),
              confirmed: true,
            });
            await onResolved();
          }}
        >
          {mode === "agent" && (
            <Select
              label="Application channel"
              name="channel"
              options={[
                ["website", "Website"],
                ["telegram", "Telegram"],
                ["email", "Email"],
              ]}
            />
          )}
          <Field
            label={
              mode === "self"
                ? "Application website URL"
                : "Verified application destination"
            }
            name="destination"
            required
          />
          <Field
            label="Source URL"
            name="source"
            type="url"
            defaultValue={listing}
            required
          />
          <TextArea
            label="Source evidence"
            name="evidence"
            rows={2}
            maxLength={2000}
            required
          />
          <button>Confirm application destination</button>
        </Form>
      )}
    </div>
  );
}
