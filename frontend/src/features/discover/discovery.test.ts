import { describe, expect, it } from "vitest";
import type { Fact, Job, RankedJob } from "@/lib/models";
import {
  advertisedSalary,
  filterOpportunities,
  groupOpportunities,
  remainingEvidenceGaps,
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

it("reconciles stale gaps with direct evidence, an exact skill, or a job-only confirmation", () => {
  const gaps = ["direct", "skill", "legacy", "partial", "retired"];
  const evidence = requirementEvidence(
    [{ requirement: "partial", fact_ids: ["partial-fact"] }],
    [
      fact("direct-fact"),
      fact("skill-fact"),
      fact("partial-fact"),
      fact("retired-fact", { retired: true }),
    ],
    {
      ...job,
      requirements: gaps,
      requirement_evidence: {
        direct: { fact_ids: ["direct-fact"] },
        legacy: { confirmed: true },
        retired: { fact_ids: ["retired-fact"] },
      },
      matched_skill_evidence: { skill: ["skill-fact"] },
    },
  );
  expect(remainingEvidenceGaps(gaps, evidence)).toEqual(["partial", "retired"]);
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

it("keeps conflict records available in All results and combines saved, text and city filters", () => {
  const saved = row("a", "Toronto", { saved: true });
  const conflict = row("b", "Berlin");
  const recommended = row("c", "Berlin");
  conflict.match.hard_conflicts = ["Confirmed eligibility conflict"];
  const rows = [saved, conflict, recommended];
  expect(
    filterOpportunities(
      rows,
      { query: "", location: "", view: "recommended" },
      [],
    ).map((item) => item.job.id),
  ).toEqual(["c"]);
  expect(
    filterOpportunities(
      rows,
      { query: "backend", location: "Toronto", view: "saved" },
      [],
    ),
  ).toEqual([saved]);
  expect(
    filterOpportunities(rows, { query: "", location: "", view: "all" }, []),
  ).toEqual([conflict, recommended]);
  expect(
    filterOpportunities(
      rows,
      { query: "", location: "", view: "applications" },
      [],
    ),
  ).toEqual(rows);
});

it("groups verified aliases across cities and keeps separate hiring employers with the same name", () => {
  const first = row("a", "Toronto", {
    employer: "Example Cloud",
    company: { id: "one", name: "Example Cloud", remaining: 2, cooling: false },
  });
  const other = row("b", "Toronto", {
    employer: "Example Cloud",
    company: { id: "two", name: "Example Cloud", remaining: 2, cooling: false },
  });
  const alias = row("c", "Berlin", {
    employer: "Example Cloud GmbH",
    company: first.job.company,
  });
  expect(groupOpportunities([first, other, alias]).map(group => ({
    name: group.name,
    ids: group.roles.map(({ job }) => job.id),
  }))).toEqual([
    { name: "Example Cloud", ids: ["a", "c"] },
    { name: "Example Cloud", ids: ["b"] },
  ]);
});
