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
  [{ min: 100000 }, "From 100,000"],
  [{ max: 150000, currency: "CAD" }, "CAD Up to 150,000"],
  [{ min: 0, max: 0 }, "Salary not listed"],
  [undefined, "Salary not listed"],
  ["Competitive, plus bonus", "Competitive, plus bonus"],
] as const)(
  "keeps partial or missing salary data truthful: %s",
  (salary, expected) => {
    render(details(salary));
    expect(screen.getByText(expected)).toBeInTheDocument();
  },
);
