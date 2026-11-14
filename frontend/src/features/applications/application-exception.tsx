"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Field, Form, Select, TextArea, checked, text } from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { useWorkspace } from "@/components/workspace-provider";
import { ApiResponseError } from "@/lib/api";
import { displayDate, errorMessage, safeUrl } from "@/lib/format";
import type { ApplicationBlocker, Job, RequestData } from "@/lib/models";

type Employer = { id: string; name: string; aliases?: string[] };
type Company = {
  job_id?: string;
  published_alias?: string;
  published_alias_proof?: string;
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
  correctEmployer = false,
  existingEmployerId,
  publishedAlias,
  checking,
}: {
  company: Company;
  job: Job;
  onSubmit: (data: RequestData) => Promise<void>;
  correctEmployer?: boolean;
  existingEmployerId?: string;
  publishedAlias?: { name: string; proof: string };
  checking?: boolean;
}) {
  const { state } = useWorkspace();
  const [employer, setEmployer] = useState(existingEmployerId || "");
  const selectedEmployer = company.employers.find(({ id }) => id === employer);
  const aliasLabel = publishedAlias?.name.trim().replace(/\s+/g, " ").toLowerCase();
  const canRecordAlias =
    selectedEmployer &&
    aliasLabel &&
    ![selectedEmployer.name, ...(selectedEmployer.aliases || [])].some(
      (name) => name.trim().replace(/\s+/g, " ").toLowerCase() === aliasLabel,
    );
  const otherListings = state.jobs.filter(
    (listing) =>
      listing.id !== job.id &&
      listing.company?.id === employer &&
      listing.hiring_employer_verified,
  );
  return (
    <Form
      onSave={async (data) => {
        const alias = canRecordAlias && publishedAlias && checked(data, "record_alias")
          ? {
              published_alias: publishedAlias.name,
              published_alias_proof: publishedAlias.proof,
            }
          : undefined;
        await onSubmit({
          job_id: job.id,
          employer_id: employer,
          name: text(data, "name"),
          requisition: text(data, "requisition"),
          same_job_id: text(data, "same_job_id"),
          ...(correctEmployer ? { replace_employer: true } : {}),
          record_alias: Boolean(alias),
          ...alias,
          confirmed: true,
        });
      }}
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
      {canRecordAlias && publishedAlias && (
        <div key={`${employer}:${publishedAlias.proof}`}>
          <Check
            name="record_alias"
            label={`The published hiring name “${publishedAlias.name}” is a verified alias of ${selectedEmployer.name}.`}
          />
          <p className="muted">
            Check only if the listing names the hiring employer itself. Leave it
            unchecked for recruiter or agency labels.
          </p>
        </div>
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
      {otherListings.length > 0 && (
        <Select
          key={employer}
          label="Same vacancy as (optional)"
          name="same_job_id"
          options={[
            ["", "A different vacancy"],
            ...otherListings.map(({ id, title }) => [id, title] as const),
          ]}
        />
      )}
      <button disabled={checking}>Confirm employer</button>
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
  const { client, profileId, refresh, state } = useWorkspace();
  const [lookup, setLookup] = useState<{ company: Company; key: string; scope: string }>();
  const [lookupError, setLookupError] = useState<{ key: string; message: string }>();
  const [retry, setRetry] = useState(0);
  const listing = state.jobs.find(({ id }) => id === job.id) ?? job;
  const listingProof = listing.published_alias_proof;
  const scope = JSON.stringify([state._workspace.path, state._workspace.workspace_id, job.id]);
  const requestKey = JSON.stringify([scope, profileId, listingProof, retry]);
  const company = lookup?.scope === scope ? lookup.company : undefined;
  const checking = lookup?.key !== requestKey;
  const proofChanged =
    !checking && company?.job_id === job.id &&
    company.published_alias_proof !== listingProof;
  const error = lookupError?.key === requestKey
    ? lookupError.message
    : proofChanged
      ? "The listing changed. Reload its employer information."
      : "";
  const publishedAlias =
    !checking &&
    !proofChanged &&
    company?.job_id === job.id &&
    company.published_alias &&
    company.published_alias_proof
      ? { name: company.published_alias, proof: company.published_alias_proof }
      : undefined;
  useEffect(() => {
    let active = true;
    client
      .action<Company>("company-roles", {
        job_id: job.id,
        profile_id: profileId,
      })
      .then(
        (result) => {
          if (active) {
            setLookup({ company: result, key: requestKey, scope });
          }
        },
        (problem) => {
          if (active) setLookupError({ key: requestKey, message: errorMessage(problem) });
        },
      );
    return () => {
      active = false;
    };
  }, [client, job.id, profileId, requestKey, scope]);

  const recheckEmployer = () => {
    setRetry((value) => value + 1);
    void refresh().catch(() => {
      // The workspace already shows refresh failures.
    });
  };

  const resolve = async (operation: string, data: RequestData) => {
    try {
      await client.action(operation, data);
    } catch (problem) {
      if (problem instanceof ApiResponseError && problem.code === "employer_alias_changed")
        recheckEmployer();
      throw problem;
    }
    await onResolved();
    setRetry((value) => value + 1);
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
            onClick={recheckEmployer}
          >
            Retry employer check
          </button>
        </>
      ) : checking ? (
        <p role="status">Checking employer history…</p>
      ) : null}
      {company && ["employer_unresolved", "employer_evidence_conflict", "duplicate_vacancy"].includes(blocker.code) && (
        <ConfirmEmployer
          company={company}
          job={job}
          existingEmployerId={company.employer?.id}
          correctEmployer={blocker.code === "employer_evidence_conflict"}
          publishedAlias={publishedAlias}
          checking={checking || proofChanged}
          onSubmit={(data) => resolve("company-map", data)}
        />
      )}
      {company && blocker.code === "company_history_unresolved" && (
        <>
          {unresolved.length === 0 && (
            <p>Reopen this role to check the latest employer history.</p>
          )}
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
                      id: item.job_id,
                      title: item.title,
                      employer: job.employer,
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
              {item.history_id && !company.linked_listings.length && (
                <p>Confirm the earlier listing’s hiring employer before linking this submission.</p>
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

export function canResolveCompanyBlocker(blocker?: ApplicationBlocker) {
  return Boolean(
    blocker && [
      "employer_unresolved",
      "employer_evidence_conflict",
      "company_history_unresolved",
      "duplicate_vacancy",
    ].includes(blocker.code),
  );
}

export function companyBlockerMessage(
  blocker: ApplicationBlocker,
  job: Job,
  timezone: string,
) {
  return blocker.code === "company_paused" && job.company?.cooldown_until
    ? `Company paused until ${displayDate(job.company.cooldown_until, timezone)}.`
    : blocker.message;
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
  mode: "self" | "agent" | "pending";
}) {
  const { client, state } = useWorkspace();
  const { canLeave } = useDraft();
  const company = canResolveCompanyBlocker(blocker);
  const destination = mode !== "pending" && blocker.code === "destination_unverified";
  const narrowQueue = ["company_queue_overflow", "company_slots_used"].includes(blocker.code);
  const listing = safeUrl(job.url);
  return (
    <section className="application-exception" aria-label="Application allowance">
      <p role="status">{companyBlockerMessage(blocker, job, state._workspace.timezone)}</p>
      {narrowQueue && (
        <Link href={`/discover/?${new URLSearchParams({
          view: "to-apply",
          q: job.company?.name || job.employer,
        })}`} onNavigate={(event) => { if (!canLeave()) event.preventDefault(); }}>
          Review this company in To apply
        </Link>
      )}
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
    </section>
  );
}
