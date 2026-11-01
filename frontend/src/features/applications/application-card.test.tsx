import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Application } from "@/lib/models";
import { ApplicationCard } from "./application-card";

const fixture = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: { _workspace: { timezone: "UTC", demo: false } },
    client: { hosted: false },
    run: fixture.run,
  }),
}));

const draft: Application = {
  id: "application-a",
  job_id: "job-a",
  title: "Software Engineer",
  employer: "Fictional Systems",
  status: "draft",
  comments: [],
};
const card = (app = draft) => (
  <ApplicationCard app={app} job={{}} onEdit={vi.fn()} onApply={vi.fn()} />
);
const tag = (status: "draft" | "reviewed" = "draft") =>
  screen.getByRole("button", {
    name:
      status === "draft"
        ? "Draft — switch to Reviewed"
        : "Reviewed — switch to Draft",
  });

beforeEach(() => {
  fixture.run.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperties(Element.prototype, {
    getAnimations: { configurable: true, value: vi.fn(() => []) },
    animate: {
      configurable: true,
      value: vi.fn(() => ({
        cancel: vi.fn(),
        finished: Promise.resolve(),
      })),
    },
  });
});

it("moves the review action to the status tag without saving on hover or focus", async () => {
  const { container } = render(card());
  expect(
    container.querySelector('.review-pane button[value="reviewed"]'),
  ).toBeNull();
  const user = userEvent.setup();
  await user.hover(tag());
  tag().focus();
  expect(fixture.run).not.toHaveBeenCalled();
  expect(tag()).toHaveAttribute("data-status", "draft");
  expect(tag()).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Submitted" })).toBeEnabled();
});

it("submits current comments while toggling Draft to Reviewed and back to Draft", async () => {
  const view = render(card());
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Comments"),
    "Checked both tailored documents.",
  );
  await user.click(tag());
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("review", {
      id: draft.id,
      status: "reviewed",
      comment: "Checked both tailored documents.",
    }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Comments")).toHaveValue(""),
  );
  view.rerender(card({ ...draft, status: "reviewed" }));
  expect(tag("reviewed")).toHaveAttribute("aria-pressed", "true");
  expect(tag("reviewed")).toHaveAttribute("aria-disabled", "false");
  await user.type(
    screen.getByLabelText("Comments"),
    "Rechecking the documents.",
  );
  await user.click(tag("reviewed"));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenLastCalledWith("review", {
      id: draft.id,
      status: "draft",
      comment: "Rechecking the documents.",
    }),
  );
  view.rerender(card());
  expect(tag()).toHaveAttribute("aria-pressed", "false");
  expect(fixture.run).toHaveBeenCalledTimes(2);
});

it("retains the draft and comment after a failed review, then allows retry", async () => {
  fixture.run.mockRejectedValueOnce(new Error("Files changed; cannot approve"));
  render(card());
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Comments"),
    "Keep this note for retry.",
  );
  await user.click(tag());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Files changed; cannot approve",
  );
  expect(screen.getByLabelText("Comments")).toHaveValue(
    "Keep this note for retry.",
  );
  expect(tag()).toHaveAttribute("aria-disabled", "false");
  await user.click(tag());
  await waitFor(() => expect(fixture.run).toHaveBeenCalledTimes(2));
  expect(fixture.run.mock.calls[1][1]).toEqual({
    id: draft.id,
    status: "reviewed",
    comment: "Keep this note for retry.",
  });
});

it("retains Reviewed and its comment when returning to Draft fails", async () => {
  fixture.run.mockRejectedValueOnce(
    new Error("Controlled reverse save failed"),
  );
  render(card({ ...draft, status: "reviewed" }));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Comments"), "Keep the reverse note.");
  await user.click(tag("reviewed"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Controlled reverse save failed",
  );
  expect(tag("reviewed")).toHaveAttribute("aria-pressed", "true");
  expect(tag("reviewed")).toHaveAttribute("aria-disabled", "false");
  expect(screen.getByLabelText("Comments")).toHaveValue(
    "Keep the reverse note.",
  );
  await user.click(tag("reviewed"));
  await waitFor(() => expect(fixture.run).toHaveBeenCalledTimes(2));
  expect(fixture.run).toHaveBeenLastCalledWith("review", {
    id: draft.id,
    status: "draft",
    comment: "Keep the reverse note.",
  });
});

it("blocks duplicate/concurrent saves and waits for persistence before claiming reviewed", async () => {
  let finish!: () => void;
  fixture.run.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(card());
  const user = userEvent.setup();
  const button = tag();
  await user.click(button);
  expect(button).toHaveAttribute("data-status", "draft");
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toHaveAttribute("aria-disabled", "true");
  for (const name of ["Reject", "Submitted", "Save comment"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  await user.click(button);
  fireEvent.submit((button as HTMLButtonElement).form!);
  expect(fixture.run).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
  });
  expect(tag()).toHaveAttribute("aria-disabled", "false");
});

it.each(["{Enter}", " "])(
  "supports keyboard activation with %s",
  async (key) => {
    const view = render(card());
    tag().focus();
    await userEvent.keyboard(key);
    await waitFor(() =>
      expect(fixture.run).toHaveBeenCalledWith("review", {
        id: draft.id,
        status: "reviewed",
        comment: "",
      }),
    );
    view.rerender(card({ ...draft, status: "reviewed" }));
    expect(tag("reviewed")).toHaveFocus();
    await userEvent.keyboard(key);
    await waitFor(() =>
      expect(fixture.run).toHaveBeenLastCalledWith("review", {
        id: draft.id,
        status: "draft",
        comment: "",
      }),
    );
  },
);

it("associates each external tag with its own card's form and comment", async () => {
  render(
    <>
      {card()}
      {card({ ...draft, id: "application-b" })}
    </>,
  );
  const cards = screen.getAllByRole("article");
  const user = userEvent.setup();
  await user.type(
    within(cards[0]).getByLabelText("Comments"),
    "First note stays.",
  );
  await user.type(
    within(cards[1]).getByLabelText("Comments"),
    "Second note saves.",
  );
  await user.click(
    within(cards[1]).getByRole("button", {
      name: "Draft — switch to Reviewed",
    }),
  );
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("review", {
      id: "application-b",
      status: "reviewed",
      comment: "Second note saves.",
    }),
  );
  expect(within(cards[0]).getByLabelText("Comments")).toHaveValue(
    "First note stays.",
  );
});

it.each(["submitted", "rejected"] as const)(
  "keeps %s status noninteractive",
  (status) => {
    const { container } = render(card({ ...draft, status }));
    expect(
      screen.queryByRole("button", { name: /switch to/i }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(`.pill[data-status="${status}"]`)?.tagName,
    ).toBe("SPAN");
  },
);
