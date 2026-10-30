import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "./profile-form";
import { RunForm, Runs } from "./runs";
import type { Profile, Run } from "@/lib/models";

const fixture = vi.hoisted(() => ({
  run: vi.fn(),
  selectProfile: vi.fn(),
  runs: [] as Run[],
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    run: fixture.run,
    profileId: "profile",
    selectProfile: fixture.selectProfile,
    state: { runs: fixture.runs },
  }),
}));
beforeEach(() => {
  fixture.run.mockReset().mockResolvedValue({ id: "saved-profile" });
  fixture.runs = [];
});

it("serializes profile lists, filters, compensation and explicit eligibility choices", async () => {
  render(<ProfileForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Profile name"), "Fixture engineering");
  await user.type(
    screen.getByLabelText("Roles, comma separated"),
    "Engineer, Analyst",
  );
  await user.type(
    screen.getByLabelText("Locations, highest priority first"),
    "Toronto, Melbourne",
  );
  await user.clear(screen.getByLabelText("Private minimum gross base"));
  await user.type(screen.getByLabelText("Private minimum gross base"), "3400");
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
