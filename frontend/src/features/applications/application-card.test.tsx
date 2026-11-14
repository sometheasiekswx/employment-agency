import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Application } from "@/lib/models";
import { ApplicationCard } from "./application-card";
import { DraftProvider } from "@/components/unsaved";

const fixture = vi.hoisted(() => ({
  run: vi.fn(),
  replace: vi.fn(),
  preview: false,
  applications: [] as Application[],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: fixture.replace }),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: {
      applications: fixture.applications,
      _workspace: { timezone: "UTC", demo: false },
    },
    client: { hosted: false, preview: fixture.preview },
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
const submitted: Application = {
  ...draft,
  id: "original-submission",
  status: "submitted",
  manifest_hash: "a".repeat(64),
};
const card = (app = draft) => (
  <ApplicationCard app={app} job={{}} onEdit={vi.fn()} />
);

it("guards a pending review before validating external edits and opens the returned draft", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const changed = { ...draft, file_changes: ["resume.pdf"] };
  const recovered = { ...draft, id: "validated-draft" };
  fixture.run.mockResolvedValueOnce(recovered);
  render(<DraftProvider>{card(changed)}</DraftProvider>);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Comments" }),
    "Pending review note",
  );
  await user.click(
    screen.getByRole("button", { name: "Validate edits as a new draft" }),
  );
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(fixture.run).not.toHaveBeenCalled();
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Comments" })).toHaveValue(
    "Pending review note",
  );
  confirm.mockReturnValue(true);
  await user.click(
    screen.getByRole("button", { name: "Validate edits as a new draft" }),
  );
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("adopt-edits", { id: draft.id }),
  );
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=active&application=validated-draft&panel=documents",
  );
});
const tag = (status: "draft" | "reviewed" = "draft") =>
  screen.getByRole("button", {
    name:
      status === "draft"
        ? "Draft — switch to Reviewed"
        : "Reviewed — switch to Draft",
  });

beforeEach(() => {
  fixture.preview = false;
  fixture.applications = [];
  fixture.replace.mockReset();
  fixture.run.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "");
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
afterEach(() => vi.unstubAllEnvs());

it("hides the repeated document header while retaining the interactive Activity status and legacy card header", () => {
  const view = render(
    <ApplicationCard app={draft} job={{}} view="files" onEdit={vi.fn()} />,
  );
  expect(view.container.querySelector(".dossier-header")).not.toBeVisible();
  expect(screen.queryByRole("button", { name: /switch to/ })).toBeNull();
  view.rerender(
    <ApplicationCard app={draft} job={{}} view="activity" onEdit={vi.fn()} />,
  );
  expect(view.container.querySelector(".dossier-header")).toBeVisible();
  expect(tag()).toBeEnabled();
  view.rerender(card());
  expect(view.container.querySelector(".dossier-header")).toBeVisible();
  expect(screen.getByRole("heading", { name: draft.title })).toBeVisible();
  expect(tag()).toBeEnabled();
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
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Record submission…" }),
  ).toBeEnabled();
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
  for (const name of ["Record submission…", "Save comment"]) {
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

it.each([
  [draft, "Record submission…", "Record this submission?"],
  [
    submitted,
    "Correct submission record…",
    "Correct a mistaken submission record?",
  ],
] as const)(
  "opens a focused decision and cancels without changing %s",
  async (app, openerName, heading) => {
    render(card(app));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Comments"), "Keep my review note.");
    const opener = screen.getByRole("button", { name: openerName });
    await user.click(opener);
    expect(screen.getByRole("heading", { name: heading })).toHaveFocus();
    expect(fixture.run).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Comments")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: heading }),
    ).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByLabelText("Comments")).toHaveValue(
      "Keep my review note.",
    );
    expect(fixture.run).not.toHaveBeenCalled();
    expect(fixture.replace).not.toHaveBeenCalled();
  },
);

it("requires explicit acknowledgment and submission method before recording a submission", async () => {
  fixture.run.mockResolvedValueOnce(submitted);
  render(card());
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Comments"),
    "Reviewed both documents.",
  );
  await user.click(screen.getByRole("button", { name: "Record submission…" }));
  const confirm = screen.getByRole("button", {
    name: "Confirm submission record",
  });
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Confirm the statement before continuing.",
  );
  expect(fixture.run).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "I have already submitted this application.",
    }),
  );
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Describe where or how you submitted the application.",
  );
  expect(fixture.run).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText("Where or how you submitted"),
    "Employer website confirmation page",
  );
  await user.click(confirm);
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith(
      "review",
      {
        id: draft.id,
        status: "submitted",
        comment:
          "Reviewed both documents.\nSubmission recorded by user. Method: Employer website confirmation page",
      },
      expect.any(String),
    ),
  );
  expect(fixture.run).toHaveBeenCalledTimes(1);
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=submitted&application=original-submission&panel=activity",
  );
});

it("retains submission confirmation values after a failure and prevents concurrent mutation until retry finishes", async () => {
  fixture.run.mockRejectedValueOnce(
    new Error("Could not preserve the submission record"),
  );
  render(card());
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Comments"), "My note survives.");
  await user.click(screen.getByRole("button", { name: "Record submission…" }));
  await user.type(
    screen.getByLabelText("Where or how you submitted"),
    "Employer website",
  );
  const acknowledgment = screen.getByRole("checkbox", {
    name: "I have already submitted this application.",
  });
  await user.click(acknowledgment);
  const confirm = screen.getByRole("button", {
    name: "Confirm submission record",
  });
  await user.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not preserve the submission record",
  );
  expect(screen.getByLabelText("Where or how you submitted")).toHaveValue(
    "Employer website",
  );
  expect(acknowledgment).toBeChecked();
  expect(screen.getByLabelText("Comments")).toHaveValue("My note survives.");
  expect(fixture.replace).not.toHaveBeenCalled();

  let resolve!: (app: Application) => void;
  fixture.run.mockImplementationOnce(
    () =>
      new Promise<Application>((finish) => {
        resolve = finish;
      }),
  );
  await user.click(confirm);
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(tag()).toHaveAttribute("aria-disabled", "true");
  await user.click(confirm);
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(fixture.run).toHaveBeenCalledTimes(2);
  await act(async () => resolve(submitted));
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=submitted&application=original-submission&panel=activity",
  );
});

it("requires correction acknowledgment and a reason, then opens the exact recovered draft", async () => {
  const recovered: Application = { ...draft, id: "recovered-draft" };
  fixture.run.mockResolvedValueOnce(recovered);
  render(card(submitted));
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Correct submission record…" }),
  );
  const confirm = screen.getByRole("button", {
    name: "Create corrected draft record",
  });
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Confirm the statement before continuing.",
  );
  expect(fixture.run).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "This application was not actually submitted; the record was a mistake.",
    }),
  );
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Explain why the submission record is incorrect.",
  );
  expect(fixture.run).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText("Reason for correction"),
    "Clicked the decision before I sent anything.",
  );
  await user.click(confirm);
  expect(fixture.run).toHaveBeenCalledWith(
    "correct-submission",
    {
      id: submitted.id,
      base: submitted.manifest_hash,
      confirmed: true,
      reason: "Clicked the decision before I sent anything.",
    },
    expect.any(String),
  );
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=active&application=recovered-draft&panel=documents",
  );
  expect(fixture.run).toHaveBeenCalledTimes(1);
});

it("retains correction reason and acknowledgment after failure and blocks duplicate correction requests", async () => {
  fixture.run.mockRejectedValueOnce(new Error("The verified manifest changed"));
  render(card(submitted));
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Correct submission record…" }),
  );
  const reason = screen.getByLabelText("Reason for correction");
  const acknowledgment = screen.getByRole("checkbox", {
    name: "This application was not actually submitted; the record was a mistake.",
  });
  await user.type(reason, "The submission decision was mistaken.");
  await user.click(acknowledgment);
  const confirm = screen.getByRole("button", {
    name: "Create corrected draft record",
  });
  await user.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The verified manifest changed",
  );
  expect(reason).toHaveValue("The submission decision was mistaken.");
  expect(acknowledgment).toBeChecked();
  expect(fixture.replace).not.toHaveBeenCalled();
  let resolve!: (app: Application) => void;
  fixture.run.mockImplementationOnce(
    () =>
      new Promise<Application>((finish) => {
        resolve = finish;
      }),
  );
  await user.click(confirm);
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.click(confirm);
  fireEvent.submit((confirm as HTMLButtonElement).form!);
  expect(fixture.run).toHaveBeenCalledTimes(2);
  await act(async () => resolve({ ...draft, id: "corrected-review" }));
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=active&application=corrected-review&panel=documents",
  );
});

it.each([false, true])(
  "keeps recovered records and later document edits truthfully linked to the original audit (edited: %s)",
  async (edited) => {
    const original: Application = {
      ...submitted,
      documents: {
        "resume.pdf": "original/resume.pdf",
        "cover-letter.pdf": "original/cover-letter.pdf",
      },
      comments: [
        {
          at: "2026-11-05",
          status: "submitted",
          text: "Original decision evidence.",
        },
      ],
      submission_correction: {
        at: "2026-11-05",
        reason: "Recorded before submission.",
        recovery_application_id: "recovered-review",
      },
    };
    const recovered: Application = {
      ...draft,
      id: "recovered-review",
      documents: { ...original.documents },
      folder: edited ? "later-edited-version" : original.folder,
      manifest_hash: edited ? "b".repeat(64) : original.manifest_hash,
      submission_recovery: {
        original_id: original.id,
        at: "2026-11-05",
        reason: "Recorded before submission.",
        recorded_at: "2026-11-04",
      },
    };
    fixture.applications = [original, recovered];
    const before = structuredClone(fixture.applications);
    render(
      <ApplicationCard
        app={recovered}
        job={{ prior_application: "submitted" }}
        onEdit={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByText("Original submission record and correction"),
    );
    expect(
      screen.getByText(
        /This draft descends from a corrected manual submission record/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No new documents were generated/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Original CV PDF" }),
    ).toHaveAttribute("href", "/files/original-submission/resume.pdf");
    expect(
      screen.getByRole("link", { name: "Original cover letter PDF" }),
    ).toHaveAttribute("href", "/files/original-submission/cover-letter.pdf");
    expect(screen.getByText("Original decision evidence.")).toBeInTheDocument();
    expect(
      screen.getByText(/A separate earlier submission decision still applies/),
    ).toBeInTheDocument();
    expect(fixture.applications).toEqual(before);
    expect(fixture.run).not.toHaveBeenCalled();
  },
);

it.each([draft, submitted])(
  "keeps public preview decisions read-only for %s",
  async (app) => {
    fixture.preview = true;
    vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "1");
    render(card(app));
    expect(
      screen.queryByRole("button", { name: /switch to/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Correct submission record…" }),
    ).not.toBeInTheDocument();
    const record = screen.queryByRole("button", { name: "Record submission…" });
    if (record) {
      expect(record).toBeDisabled();
      await userEvent.click(record);
    }
    expect(screen.getByLabelText("Comments")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save comment" })).toBeDisabled();
    expect(
      screen.queryByRole("heading", {
        name: /Record this submission|Correct a mistaken/,
      }),
    ).not.toBeInTheDocument();
    expect(fixture.run).not.toHaveBeenCalled();
  },
);
