import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MasterPanel } from "./master-panel";

const fixture = vi.hoisted(() => ({
  state: {
    _master: {
      exists: true,
      changed: true,
      path: "master/main.txt",
      sha256: "current",
    },
  },
  client: { action: vi.fn() },
  run: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => fixture,
}));

it("confirms the selected facts and excludes a conflicting resume line", async () => {
  fixture.client.action.mockResolvedValue({
    sha256: "current",
    diff: "Source changes",
    candidates: [{ text: "Morgan Finch" }, { text: "Built integrations." }],
    conflicts: [
      {
        candidate_index: 0,
        fact_id: "supplemental-fact",
        statement: "Morgan Finch",
        existing_dates: "2021–2024",
        proposed_dates: "2020–2024",
      },
    ],
    identity: {},
  });
  fixture.run.mockResolvedValue({});
  render(<MasterPanel />);
  fireEvent.click(
    screen.getByRole("button", { name: "Review master changes" }),
  );
  const name = await screen.findByRole("checkbox", { name: "Morgan Finch" });
  expect(name).toBeChecked();
  expect(screen.getByText(/exclude the marked facts/i)).toBeVisible();
  fireEvent.click(name);
  expect(
    screen.queryByText(/exclude the marked facts/i),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/no contact detail changes were proposed/i),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I reviewed the master changes/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm master updates" }),
  );
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("master-accept", {
      sha256: "current",
      confirmed: true,
      selected_candidates: [1],
    }),
  );
});
