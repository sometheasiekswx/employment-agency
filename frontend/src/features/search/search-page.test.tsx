import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DraftProvider } from "@/components/unsaved";
import { SearchPage } from "./search-page";

const run = vi.hoisted(() => vi.fn());
const action = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const testClient = { hosted: false, action };
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: { profiles: [], jobs: [], sources: [], _workspace: { path: "fixture" } },
    client: testClient,
    profileId: "",
    selectProfile: vi.fn(),
    run,
  }),
}));
vi.mock("./profile-form", () => ({ ProfileForm: () => null }));
vi.mock("./job-form", () => ({ JobForm: () => null }));
vi.mock("./search-results", () => ({ SearchResults: () => null }));
vi.mock("./runs", () => ({ Runs: () => null }));

beforeEach(() => {
  window.history.replaceState(null, "", "/search/");
  run.mockReset();
});

it("focuses the import heading for a direct Add opportunities route", () => {
  window.history.replaceState(null, "", "/search/#add-opportunity");
  render(<SearchPage />);
  expect(
    screen.getByRole("heading", { name: "Add an opportunity" }),
  ).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "Import URL" }),
  ).toBeInTheDocument();
  expect(run).not.toHaveBeenCalled();
});

it("focuses the anchor within a mounted search page without replacing dirty form input", () => {
  render(
    <DraftProvider>
      <SearchPage />
    </DraftProvider>,
  );
  const input = screen.getByLabelText(
    "Job URL with JobPosting structured data",
  );
  fireEvent.change(input, {
    target: { value: "https://example.com/jobs/unsaved" },
  });
  window.history.replaceState(null, "", "/search/#add-opportunity");
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(
    screen.getByRole("heading", { name: "Add an opportunity" }),
  ).toHaveFocus();
  expect(input).toHaveValue("https://example.com/jobs/unsaved");
  expect(run).not.toHaveBeenCalled();
});
