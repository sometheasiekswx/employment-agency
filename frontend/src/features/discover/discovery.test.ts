import { describe, expect, it } from "vitest";
import type { Application, Fact, Job, RankedJob } from "@/lib/models";
import { applicationHref } from "@/lib/format";
import {
  advertisedSalary,
  applicationsByJob,
  filterOpportunities,
  groupOpportunities,
  requirementEvidence,
} from "./discovery";

const fact = (id: string, extra: Partial<Fact> = {}): Fact => ({
  id,
  text: "Python application work",
  confirmed: true,
  ...extra,
});
const job: Job = {
  id: "job-a",
  title: "Backend Engineer",
  employer: "Fictional Studio",
  location: "Toronto",
  salary: { min: 0, max: 0 },
};
const row = (
  id: string,
  city: string,
  extra: Partial<Job> = {},
): RankedJob => ({
  job: { ...job, id, location: city, ...extra },
  match: {
    eligible_for_preparation: true,
    hard_conflicts: [],
    unknowns: [],
    gaps: [],
    evidence: [],
    preferences: [],
    salary_expectation: {},
  },
});

it("only exposes confirmed, active and conflict-free fact IDs as evidence", () => {
  const evidence = requirementEvidence(
    [
      {
        requirement: "Python",
        fact_ids: ["valid", "retired", "conflict", "unconfirmed", "invented"],
        assessment: "Related text",
      },
    ],
    [
      fact("valid"),
      fact("retired", { retired: true }),
      fact("conflict", { conflict: true }),
      fact("unconfirmed", { confirmed: false }),
    ],
  );
  expect(evidence[0].facts.map((item) => item.id)).toEqual(["valid"]);
  expect(requirementEvidence({ arbitrary: "untrusted" }, [])).toEqual([]);
});

describe("advertised salary", () => {
  it("shows absent zero defaults as unknown rather than a zero salary", () => {
    expect(advertisedSalary(job)).toBe("Salary not listed");
    expect(
      advertisedSalary({ ...job, salary: { min: NaN, max: Infinity } }),
    ).toBe("Salary not listed");
    expect(advertisedSalary(job, { missing: "" })).toBe("");
    expect(
      advertisedSalary({ salary: "Salary not listed" }, { missing: "" }),
    ).toBe("");
  });
  it("retains a real single bound without inventing the missing bound", () => {
    expect(
      advertisedSalary({
        ...job,
        salary: { min: 0, max: 120000, currency: "CAD", period: "year" },
      }),
    ).toBe("CAD Up to 120,000 / year");
    expect(advertisedSalary({ ...job, salary: { min: 80000, max: 0 } })).toBe(
      "From 80,000",
    );
  });
});

it("preserves the submitted snapshot even when a later draft exists", () => {
  const app = (
    id: string,
    status: Application["status"],
    date: string,
  ): Application => ({
    id,
    job_id: job.id,
    title: job.title,
    employer: job.employer,
    status,
    created_at: date,
    comments: [],
  });
  const sent = app("exact-submitted-version", "submitted", "2026-10-21");
  const selected = applicationsByJob([
    sent,
    app("later-draft", "draft", "2026-10-22"),
  ]).get(job.id)!;
  expect(selected.id).toBe(sent.id);
  expect(applicationHref(selected)).toBe(
    "/?section=submitted&application=exact-submitted-version",
  );
});

it("keeps conflict records available in All results and combines saved, text and city filters", () => {
  const saved = row("a", "Toronto", { saved: true });
  const conflict = row("b", "Berlin");
  conflict.match.hard_conflicts = ["Confirmed eligibility conflict"];
  const rows = [saved, conflict];
  expect(
    filterOpportunities(
      rows,
      { query: "", location: "", view: "recommended" },
      [],
    ).map((item) => item.job.id),
  ).toEqual(["a"]);
  expect(
    filterOpportunities(
      rows,
      { query: "backend", location: "Toronto", view: "saved" },
      [],
    ),
  ).toEqual([saved]);
  expect(
    filterOpportunities(rows, { query: "", location: "", view: "all" }, []),
  ).toHaveLength(2);
  expect(
    groupOpportunities(rows, ["Berlin", "Toronto"]).map(([city]) => city),
  ).toEqual(["Berlin", "Toronto"]);
});
