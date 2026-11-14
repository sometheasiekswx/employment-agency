import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Job, Salary } from "@/lib/models";
import { JobForm } from "./job-form";

const fixture = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({ run: fixture.run, profileId: "fictional-profile" }),
}));

beforeEach(() => {
  fixture.run.mockReset().mockResolvedValue({ id: "fictional-job" });
});

const job: Job = {
  id: "fictional-job",
  title: "Software Engineer",
  employer: "Fictional Systems",
  description: "Develop internal web applications.",
};

it.each([
  [false, "jobs"],
  [true, "to-apply"],
])("links a saved role to its assessment with saved=%s", async (saved, view) => {
  fixture.run.mockResolvedValue({ ...job, saved });
  render(<JobForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Job title"), job.title);
  await user.click(screen.getByRole("button", { name: "Save job" }));
  const link = await screen.findByRole("link", { name: "View saved role" });
  const destination = new URL(link.getAttribute("href")!, "http://127.0.0.1");
  expect(destination.pathname.replace(/\/$/, "")).toBe("/discover");
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    view,
    opportunity: "fictional-job",
    assessment_profile: "fictional-profile",
  });
});

it.each<Salary>([
  { min: 500, max: 1000, currency: "", period: "", basis: "gross_base" },
  {
    min: 500,
    max: 1000,
    currency: "USD",
    period: "",
    basis: "Negotiable; pay period not stated",
  },
  { min: 0, max: 0, currency: "", period: "unknown", basis: "" },
  { min: 1500, max: 2000, currency: "NZD", period: "fortnight", basis: "net" },
])(
  "preserves advertised salary evidence during an unrelated edit: %j",
  async (salary) => {
    render(<JobForm job={{ ...job, salary }} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Job title"));
    await user.type(
      screen.getByLabelText("Job title"),
      "Senior Software Engineer",
    );
    await user.click(screen.getByRole("button", { name: "Save job" }));
    await waitFor(() =>
      expect(fixture.run).toHaveBeenCalledWith(
        "job",
        expect.objectContaining({ title: "Senior Software Engineer", salary }),
      ),
    );
  },
);

it("lets the user explicitly supply or clear salary metadata", async () => {
  render(<JobForm job={{ ...job, salary: { min: 500, max: 1000 } }} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Salary evidence and expectation"));
  await user.type(screen.getByLabelText("Currency"), "EUR");
  await user.selectOptions(screen.getByLabelText("Pay period"), "year");
  await user.selectOptions(screen.getByLabelText("Pay basis"), "gross_base");
  await user.click(screen.getByRole("button", { name: "Save job" }));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenLastCalledWith(
      "job",
      expect.objectContaining({
        salary: {
          min: 500,
          max: 1000,
          currency: "EUR",
          period: "year",
          basis: "gross_base",
        },
      }),
    ),
  );
  await user.clear(screen.getByLabelText("Currency"));
  await user.selectOptions(screen.getByLabelText("Pay period"), "");
  await user.selectOptions(screen.getByLabelText("Pay basis"), "");
  await user.click(screen.getByRole("button", { name: "Save job" }));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenLastCalledWith(
      "job",
      expect.objectContaining({
        salary: { min: 500, max: 1000, currency: "", period: "", basis: "" },
      }),
    ),
  );
});

it("starts a new job with unstated salary metadata", () => {
  render(<JobForm />);
  expect(screen.getByLabelText("Currency")).toHaveValue("");
  expect(screen.getByLabelText("Pay period")).toHaveValue("");
  expect(screen.getByLabelText("Pay basis")).toHaveValue("");
});

it.each<Partial<Job>>([
  { availability: "open" },
  { availability: "expired" },
  { availability: "" },
  { work_arrangement: "Remote" },
  { work_arrangement: "Flexible office attendance" },
  { work_arrangement: "" },
  { expectation: { target: "", basis: "", source: "", confidence: "" } },
  {
    expectation: {
      target: "",
      basis: "",
      source: "",
      confidence: "Unconfirmed estimate",
    },
  },
])(
  "preserves imported job metadata during an unrelated edit: %j",
  async (metadata) => {
    render(<JobForm job={{ ...job, ...metadata }} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Job title"));
    await user.type(
      screen.getByLabelText("Job title"),
      "Senior Software Engineer",
    );
    await user.click(screen.getByRole("button", { name: "Save job" }));
    await waitFor(() =>
      expect(fixture.run).toHaveBeenCalledWith(
        "job",
        expect.objectContaining(metadata),
      ),
    );
  },
);

it("lets the user explicitly replace imported availability and arrangement", async () => {
  render(
    <JobForm
      job={{ ...job, availability: "open", work_arrangement: "Remote" }}
    />,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Availability"), "closed");
  await user.selectOptions(screen.getByLabelText("Work arrangement"), "onsite");
  await user.click(screen.getByRole("button", { name: "Save job" }));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith(
      "job",
      expect.objectContaining({
        availability: "closed",
        work_arrangement: "onsite",
      }),
    ),
  );
});
