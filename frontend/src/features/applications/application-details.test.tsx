import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Application, Job } from "@/lib/models";
import { ApplicationDetails } from "./application-details";

const app: Application = {
  id: "fictional-draft",
  job_id: "fictional-role",
  title: "Engineer",
  employer: "Fictional Systems",
  status: "draft",
  comments: [],
};
const details = (salary?: Job["salary"]) => (
  <ApplicationDetails app={app} job={{ salary }} timezone="UTC" />
);

it("uses the readable advertised range and basis in application details", () => {
  render(
    details({
      min: 100000,
      max: 150000,
      currency: "AUD",
      period: "year",
      basis: "gross_base",
    }),
  );
  expect(screen.getByText("Advertised salary")).toBeInTheDocument();
  expect(
    screen.getByText("AUD 100,000–150,000 / year gross base"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/gross_base/)).not.toBeInTheDocument();
});

it.each([
  [undefined, "Salary not listed"],
  ["Competitive, plus bonus", "Competitive, plus bonus"],
] as const)("displays missing or free-text salary: %s", (salary, expected) => {
  render(details(salary));
  expect(screen.getByText(expected)).toBeInTheDocument();
});

it.each([
  {
    label: "legacy decision",
    submissionTime: null,
    expected: "4 Nov 2026",
    assumed: false,
  },
  {
    label: "actual date with assumed time",
    submissionTime: { at: "2026-11-01T13:00:00Z", assumed: true },
    expected: "2 Nov 2026",
    assumed: true,
  },
  {
    label: "verified timestamp",
    submissionTime: { at: "2026-11-01T13:00:00Z", assumed: false },
    expected: "2 Nov 2026",
    assumed: false,
  },
] as const)(
  "displays the $label in the workspace timezone",
  ({ submissionTime, expected, assumed }) => {
    render(
      <ApplicationDetails
        app={{
          ...app,
          status: "submitted",
          submitted_at: "2026-11-04",
          submission_time: submissionTime,
        }}
        job={{}}
        timezone="Australia/Melbourne"
      />,
    );
    const value = screen.getByText("Submitted", {
      selector: "dt",
    }).nextElementSibling;
    expect(value).toHaveTextContent(expected);
    expect(value?.textContent?.includes("(time assumed)")).toBe(assumed);
  },
);
