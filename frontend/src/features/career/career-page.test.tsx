import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Fact, WorkspaceState } from "@/lib/models";
import { CareerPage } from "./career-page";

const fixture = vi.hoisted(() => ({
  state: {} as WorkspaceState,
  client: { hosted: false, preview: false },
  run: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => fixture,
}));

const evidence = (): Fact => ({
  id: "fixture-python",
  text: "Built Python reporting tools for an internal team.",
  category: "experience",
  association: "Example Workshop",
  dates: "2024–2025",
  confirmed: true,
  source: { name: "Fictional source resume.txt", at: "2026-10-20T09:00:00Z" },
});
const activeFact = () => document.getElementById("career-fact-fixture-python")!;
const retiredDisclosure = () =>
  screen.getByText(/^Retired facts \(/).closest("details")!;

beforeEach(() => {
  fixture.client.preview = false;
  fixture.run.mockReset().mockResolvedValue({});
  fixture.notify.mockReset();
  fixture.state = {
    identity: { name: "Fictional Candidate" },
    facts: [
      evidence(),
      {
        ...evidence(),
        id: "older-fixture",
        text: "An older sourced statement.",
        retired: true,
        confirmed: false,
      },
    ],
    profiles: [],
    jobs: [],
    applications: [],
    sources: [],
    runs: [],
    consents: {},
    _master: { exists: false, changed: false, path: "master.txt" },
    _workspace: {
      path: "/fictional-workspace",
      label: "Fictional",
      master: "master.txt",
      master_template: false,
      timezone: "UTC",
      preferred_locations: [],
      setup_complete: true,
    },
  };
});
afterEach(() => vi.unstubAllEnvs());

it("requires inline retirement confirmation and restores trigger focus on Cancel without mutating", async () => {
  render(<CareerPage />);
  const retire = within(activeFact()).getByRole("button", { name: "Retire" });
  retire.focus();
  fireEvent.click(retire);
  const heading = await screen.findByRole("heading", {
    name: "Retire this career fact?",
  });
  expect(heading).toHaveFocus();
  expect(
    screen.getByText(/restore it later.*confirmation/i),
  ).toBeInTheDocument();
  expect(fixture.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByRole("heading", { name: "Retire this career fact?" }),
  ).not.toBeInTheDocument();
  expect(retire).toHaveFocus();
  expect(fixture.run).not.toHaveBeenCalled();
});

it("waits for confirmed retirement and committed fact state before opening and focusing recovery", async () => {
  let finish!: () => void;
  fixture.run.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<CareerPage />);
  fireEvent.click(within(activeFact()).getByRole("button", { name: "Retire" }));
  fireEvent.click(screen.getByRole("button", { name: "Retire fact" }));
  expect(fixture.run).toHaveBeenCalledWith(
    "retire",
    { id: "fixture-python" },
    "Career fact retired. You can restore it from Retired facts.",
  );
  expect(
    within(activeFact()).getByRole("button", { name: "Retire" }),
  ).toBeDisabled();
  expect(retiredDisclosure()).not.toHaveAttribute("open");
  await act(async () => finish());
  expect(retiredDisclosure()).not.toHaveAttribute("open");
  fixture.state = {
    ...fixture.state,
    facts: fixture.state.facts.map((fact) =>
      fact.id === "fixture-python"
        ? { ...fact, retired: true, confirmed: false }
        : fact,
    ),
  };
  rerender(<CareerPage />);
  await waitFor(() => expect(retiredDisclosure()).toHaveAttribute("open"));
  expect(screen.getByText("Retired facts (2)")).toHaveFocus();
  expect(
    document.getElementById("career-fact-fixture-python"),
  ).not.toBeInTheDocument();
  const recovery = within(retiredDisclosure());
  expect(recovery.getByText(evidence().text)).toBeInTheDocument();
  expect(
    recovery.getAllByText(/Example Workshop.*Fictional source resume.txt/),
  ).toHaveLength(2);
  expect(fixture.state.facts[0].source).toEqual(evidence().source);
});

it("restores a fact for reconfirmation and focuses it only after the active record is rendered", async () => {
  fixture.state.facts[0] = { ...evidence(), retired: true, confirmed: false };
  const { rerender } = render(<CareerPage />);
  fireEvent.click(screen.getByText("Retired facts (2)"));
  const restore = within(retiredDisclosure()).getAllByRole("button", {
    name: "Restore",
  })[0];
  restore.focus();
  fireEvent.click(restore);
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith(
      "restore-fact",
      { id: "fixture-python" },
      "Career fact restored. Review and confirm it before use.",
    ),
  );
  expect(
    document.getElementById("career-fact-fixture-python"),
  ).not.toBeInTheDocument();
  fixture.state = {
    ...fixture.state,
    facts: fixture.state.facts.map((fact) =>
      fact.id === "fixture-python"
        ? { ...fact, retired: false, confirmed: false }
        : fact,
    ),
  };
  rerender(<CareerPage />);
  await waitFor(() => expect(activeFact()).toHaveFocus());
  expect(activeFact()).toHaveAttribute("tabindex", "-1");
  expect(
    within(activeFact()).getByText("Needs your confirmation"),
  ).toBeInTheDocument();
  expect(
    within(activeFact()).getByText(evidence().text, { selector: "p" }),
  ).toBeInTheDocument();
  expect(
    within(activeFact()).getByText(
      /Example Workshop.*Fictional source resume.txt/,
    ),
  ).toBeInTheDocument();
  expect(fixture.state.facts[0]).toEqual({
    ...evidence(),
    retired: false,
    confirmed: false,
  });
  expect(fixture.run).toHaveBeenCalledTimes(1);
});

it("keeps a failed retirement recoverable without scheduling a success focus", async () => {
  fixture.run.mockRejectedValueOnce(
    new Error("The fact could not be retired."),
  );
  const { rerender } = render(<CareerPage />);
  const retire = within(activeFact()).getByRole("button", { name: "Retire" });
  fireEvent.click(retire);
  fireEvent.click(screen.getByRole("button", { name: "Retire fact" }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("The fact could not be retired.");
  await waitFor(() => expect(error).toHaveFocus());
  fixture.state = {
    ...fixture.state,
    facts: fixture.state.facts.map((fact) => ({ ...fact })),
  };
  rerender(<CareerPage />);
  expect(error).toHaveFocus();
  expect(retiredDisclosure()).not.toHaveAttribute("open");
  expect(screen.getByRole("button", { name: "Retire fact" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(retire).toHaveFocus();
});

it("keeps a failed restoration in retired facts and does not move focus on later refreshes", async () => {
  fixture.run.mockRejectedValueOnce(
    new Error("The fact could not be restored."),
  );
  const { rerender } = render(<CareerPage />);
  fireEvent.click(screen.getByText("Retired facts (1)"));
  const restore = within(retiredDisclosure()).getByRole("button", {
    name: "Restore",
  });
  restore.focus();
  fireEvent.click(restore);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The fact could not be restored.",
  );
  await waitFor(() => expect(restore).toBeEnabled());
  fixture.state = {
    ...fixture.state,
    facts: fixture.state.facts.map((fact) => ({ ...fact })),
  };
  rerender(<CareerPage />);
  expect(restore).toHaveFocus();
  expect(
    within(retiredDisclosure()).getByText("An older sourced statement."),
  ).toBeInTheDocument();
  expect(fixture.state.facts[1].retired).toBe(true);
});

it("disables retirement and restoration in the public fictional preview", () => {
  fixture.client.preview = true;
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "1");
  render(<CareerPage />);
  const retire = within(activeFact()).getByRole("button", { name: "Retire" });
  expect(retire).toBeDisabled();
  fireEvent.click(retire);
  expect(
    screen.queryByRole("heading", { name: "Retire this career fact?" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Retired facts (1)"));
  const restore = within(retiredDisclosure()).getByRole("button", {
    name: "Restore",
  });
  expect(restore).toBeDisabled();
  fireEvent.click(restore);
  expect(fixture.run).not.toHaveBeenCalled();
});
