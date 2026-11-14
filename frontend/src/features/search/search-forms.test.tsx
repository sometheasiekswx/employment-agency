import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftProvider } from "@/components/unsaved";
import { ProfileForm } from "./profile-form";
import { RunForm, Runs } from "./runs";
import { SearchResults } from "./search-results";
import type { Fact, Profile, RankedJob, Run } from "@/lib/models";

const fixture = vi.hoisted(() => ({
  run: vi.fn(),
  rank: vi.fn(),
  selectProfile: vi.fn(),
  facts: [] as Fact[],
  runs: [] as Run[],
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    run: fixture.run,
    client: { action: fixture.rank, hosted: false },
    profileId: "profile",
    selectProfile: fixture.selectProfile,
    state: { facts: fixture.facts, runs: fixture.runs },
  }),
}));
beforeEach(() => {
  fixture.run.mockReset().mockResolvedValue({ id: "saved-profile" });
  fixture.rank.mockReset();
  fixture.facts = [];
  fixture.runs = [];
});

const profile: Profile = {
  id: "profile",
  name: "Fixture",
  roles: [],
  locations: [],
  seniority: [],
  arrangements: [],
  hard: [],
  exclude: [],
  work_rights: [],
  needs_sponsorship: false,
  minimum: 0,
  currency: "USD",
  period: "month",
  template: "navy",
  include_stretch: false,
  include_unknown: false,
};

it("serializes profile lists, filters, compensation and explicit eligibility choices", async () => {
  render(<ProfileForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Profile name"), "Fixture engineering");
  await user.type(screen.getByLabelText("Target roles"), "Engineer, Analyst");
  await user.type(
    screen.getByLabelText("Locations in priority order"),
    "Toronto, Melbourne",
  );
  await user.clear(
    screen.getByLabelText("Private minimum base pay before tax"),
  );
  await user.type(
    screen.getByLabelText("Private minimum base pay before tax"),
    "3400",
  );
  await user.click(screen.getByLabelText("Require employer sponsorship"));
  await user.click(
    screen.getByLabelText("Include stretch roles with missing evidence"),
  );
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() =>
    expect(fixture.selectProfile).toHaveBeenCalledWith("saved-profile"),
  );
  expect(fixture.run).toHaveBeenCalledWith(
    "profile",
    expect.objectContaining({
      roles: ["Engineer", "Analyst"],
      locations: ["Toronto", "Melbourne"],
      hard: ["roles", "locations"],
      minimum: 3400,
      needs_sponsorship: true,
      include_stretch: true,
      include_unknown: false,
    }),
  );
});

it("updates required matches without dropping categories from older profiles", async () => {
  render(<ProfileForm profile={{ ...profile, hard: ["roles", "legacy"] }} />);
  const user = userEvent.setup();
  const role = screen.getByRole("checkbox", { name: "Role" });
  const location = screen.getByRole("checkbox", {
    name: "Location",
  });
  expect(role).toBeChecked();
  expect(location).not.toBeChecked();
  await user.click(role);
  await user.click(location);
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(fixture.run).toHaveBeenCalledWith(
    "profile",
    expect.objectContaining({ hard: ["locations", "legacy"] }),
  );
});

it("preserves pasted locations on separate lines as separate priorities", async () => {
  render(<ProfileForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Profile name"), "Multiple cities");
  await user.click(screen.getByLabelText("Locations in priority order"));
  await user.paste("Toronto\nMelbourne");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(fixture.run).toHaveBeenCalledWith("profile", expect.objectContaining({
    locations: ["Toronto", "Melbourne"],
  }));
});

it("sends the model, rates, approved budget and supported batch size without making a paid request", async () => {
  render(<RunForm />);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Maximum applications"));
  await user.type(screen.getByLabelText("Maximum applications"), "20");
  await user.selectOptions(screen.getByLabelText("Preparation mode"), "openai");
  await user.click(screen.getByText("OpenAI run configuration"));
  await user.type(screen.getByLabelText("Model ID"), "fixture-model");
  for (const label of [
    "Input USD per million tokens",
    "Output USD per million tokens",
    "Maximum run budget USD",
  ]) {
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), "1.25");
  }
  await user.click(
    screen.getByLabelText("I checked the rates and approve this run budget"),
  );
  await user.click(screen.getByRole("button", { name: "Start bounded run" }));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("run", {
      profile_id: "profile",
      count: 20,
      discover: true,
      mode: "openai",
      model: "fixture-model",
      input_per_million: 1.25,
      output_per_million: 1.25,
      budget: 1.25,
      approve_budget: true,
    }),
  );
});

it("renders run failures and connects cancel/resume to the correct run IDs", async () => {
  const base = {
    profile,
    packages: [],
    count: 5,
    reserved: 0,
    errors: [{ error: "Source failure" }],
  };
  fixture.runs = [
    { ...base, id: "running", status: "running" },
    { ...base, id: "paused", status: "paused" },
  ];
  render(<Runs />);
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel after current operation" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(fixture.run).toHaveBeenCalledWith("cancel", { id: "running" });
  expect(fixture.run).toHaveBeenCalledWith("resume", { id: "paused" });
  expect(screen.getAllByText(/Source failure/)).toHaveLength(2);
});

it("announces completed ranking, focuses the count and shows readable confirmed evidence", async () => {
  fixture.facts = [
    { id: "fact-internal-37", text: "Built a Python API", confirmed: true },
    {
      id: "fact-retired-52",
      text: "Retired claim",
      confirmed: true,
      retired: true,
    },
  ];
  const rows: RankedJob[] = [
    {
      job: {
        id: "job",
        title: "Engineer",
        employer: "Fixture Labs",
        description: "Maintain internal services.",
        salary: { min: 90000, currency: "AUD", period: "year" },
      },
      match: {
        eligible_for_preparation: true,
        hard_conflicts: [],
        unknowns: [],
        gaps: [],
        evidence: [
          { requirement: "Python", fact_ids: ["fact-internal-37"] },
          { requirement: "Kubernetes", fact_ids: ["fact-retired-52"] },
        ],
        preferences: ["arrangements outside preferences"],
        salary_expectation: { target: "Confirm the advertised band" },
      },
    },
  ];
  fixture.rank.mockResolvedValue(rows);
  render(<SearchResults />);
  const user = userEvent.setup();
  const rank = screen.getByRole("button", { name: "Rank saved jobs" });
  rank.focus();
  await user.keyboard("{Enter}");
  const count = await screen.findByText("1 job ranked");
  expect(screen.getByRole("status")).toContainElement(count);
  expect(count).toHaveFocus();
  expect(fixture.rank).toHaveBeenCalledWith("rank", { profile_id: "profile" });

  await user.click(screen.getByText("Requirement evidence and job details"));
  expect(screen.getByText("Built a Python API")).toBeVisible();
  expect(screen.getByText("No confirmed supporting evidence")).toBeVisible();
  expect(screen.getByText("AUD From 90,000 / year")).toBeVisible();
  expect(screen.getByText("Confirm the advertised band")).toBeVisible();
  expect(screen.getByText("Maintain internal services.")).toBeVisible();
  expect(screen.queryByText(/fact-internal-37|Retired claim/)).toBeNull();
});

it("keeps focus with the user when a pending ranking completes", async () => {
  let resolveRanking!: (rows: RankedJob[]) => void;
  fixture.rank.mockImplementation(
    () =>
      new Promise<RankedJob[]>((resolve) => {
        resolveRanking = resolve;
      }),
  );
  render(<SearchResults />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rank saved jobs" }));
  const nextAction = screen.getByRole("button", { name: "Start a run" });
  nextAction.focus();
  resolveRanking([]);
  const empty = await screen.findByText("No saved jobs match this profile.");
  expect(screen.getByRole("status")).toContainElement(empty);
  expect(nextAction).toHaveFocus();
});

it("filters the entire ranking and progressively reveals jobs in rank order", async () => {
  const match: RankedJob["match"] = {
    eligible_for_preparation: true,
    hard_conflicts: [],
    unknowns: [],
    gaps: [],
    evidence: [],
    preferences: [],
    salary_expectation: {},
  };
  fixture.rank.mockResolvedValue(
    Array.from({ length: 25 }, (_, index) => ({
      job: {
        id: `job-${index + 1}`,
        title: `Engineer ${index + 1}`,
        employer: index === 24 ? "Future Reach" : "Fixture Labs",
        location: index === 24 ? "Melbourne" : "Toronto",
      },
      match,
    })),
  );
  render(<SearchResults />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rank saved jobs" }));
  expect(await screen.findByText("25 jobs ranked")).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Showing 12 of 25 jobs");
  expect(screen.getAllByRole("article")).toHaveLength(12);

  const filter = screen.getByRole("searchbox", { name: "Filter ranked jobs" });
  await user.type(filter, "FUTURE REACH Melbourne{Enter}");
  expect(screen.getByRole("status")).toHaveTextContent("25 jobs ranked");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Showing 1 of 1 matching job",
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "Engineer 25 · Future Reach" }),
  ).toBeVisible();
  expect(filter).toHaveFocus();

  await user.clear(filter);
  await user.type(filter, "not a match{Enter}");
  expect(screen.getByRole("status")).toHaveTextContent(
    "No ranked jobs match this filter.",
  );
  expect(screen.queryByRole("article")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(screen.getByText("25 jobs ranked")).toHaveFocus();
  expect(screen.getAllByRole("article")).toHaveLength(12);
  const showMore = screen.getByRole("button", { name: "Show 12 more jobs" });
  showMore.focus();
  await user.keyboard("{Enter}");
  expect(screen.getAllByRole("article")).toHaveLength(24);
  expect(
    screen.getByRole("heading", { name: "Engineer 13 · Fixture Labs" }),
  ).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Show 1 more job" }));
  expect(screen.getAllByRole("article")).toHaveLength(25);
  expect(
    screen.getByRole("heading", { name: "Engineer 25 · Future Reach" }),
  ).toHaveFocus();
  expect(screen.queryByRole("button", { name: /Show .* more job/ })).toBeNull();
});

it("keeps an unsaved agent selection when the user cancels filtering", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    fixture.rank.mockResolvedValue([
      {
        job: { id: "job", title: "Engineer", employer: "Fixture Labs" },
        match: {
          eligible_for_preparation: true,
          hard_conflicts: [],
          unknowns: [],
          gaps: [],
          evidence: [],
          preferences: [],
          salary_expectation: {},
        },
      },
    ] satisfies RankedJob[]);
    render(
      <DraftProvider>
        <SearchResults />
      </DraftProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rank saved jobs" }));
    const result = await screen.findByRole("article");
    await user.click(within(result).getByText("Import agent fact selection"));
    const selection = within(result).getByRole("textbox", {
      name: "JSON response containing fact_ids",
    });
    await user.type(selection, "unsaved text");
    await user.type(
      screen.getByRole("searchbox", { name: "Filter ranked jobs" }),
      "Dublin{Enter}",
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(selection).toHaveValue("unsaved text");
    expect(result).toBeVisible();
  } finally {
    confirm.mockRestore();
  }
});
