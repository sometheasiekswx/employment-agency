import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { DraftProvider, useDraft } from "@/components/unsaved";
import type { Application, EditorDocument } from "@/lib/models";
import { OpportunityApplication } from "./opportunity-application";

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  readDocument: vi.fn(),
  run: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  replace: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: fixture.replace }),
  usePathname: () => "/discover/",
  useSearchParams: () => new URLSearchParams(),
}));
const client = {
  action: fixture.action,
  readDocument: fixture.readDocument,
  hosted: false,
  preview: false,
};
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: {
      applications: [],
      identity: { name: "Alex Morgan" },
      _workspace: { timezone: "UTC", demo: false },
    },
    client,
    run: fixture.run,
    refresh: fixture.refresh,
    notify: fixture.notify,
  }),
}));

const application: Application = {
  id: "application-a",
  job_id: "job-a",
  title: "Software Engineer",
  employer: "Fictional Systems",
  status: "draft",
  created_at: "2026-11-01T09:00:00Z",
  documents: {
    "resume.pdf": "version-a/resume.pdf",
    "cover-letter.pdf": "version-a/cover-letter.pdf",
    "resume.docx": "version-a/resume.docx",
    "evidence.json": "version-a/evidence.json",
  },
  comments: [{ at: "2026-11-01", kind: "comment", text: "Earlier review." }],
};
const editor: EditorDocument = {
  id: application.id,
  document: "resume",
  base: "verified-original-hash",
  mode: "blocks",
  pdf: "JVBERg==",
  blocks: [["text", "Original verified text"]],
};
const job = { title: application.title, location: "Melbourne" };

function LeaveControl() {
  const { canLeave } = useDraft();
  return (
    <button onClick={() => canLeave() && fixture.leave()}>
      Leave opportunity
    </button>
  );
}
const workspace = (
  tab: "documents" | "files" | "activity" = "documents",
  app = application,
) => (
  <DraftProvider>
    <OpportunityApplication application={app} job={job} tab={tab} />
    <LeaveControl />
  </DraftProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  fixture.action.mockReset().mockImplementation(async (operation: string) => {
    if (operation === "document-editor") return editor;
    if (operation === "apply-status")
      return {
        gmail: { connected: false },
        codex_installed: false,
        attempts: [],
      };
    return {};
  });
  fixture.readDocument
    .mockReset()
    .mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  fixture.run.mockReset().mockResolvedValue(undefined);
  fixture.refresh.mockResolvedValue(undefined);
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
      value: vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() })),
    },
  });
});

it("shows documents and metadata separately from activity without remounting the review draft", async () => {
  const view = render(workspace("files"));
  const card = screen.getByRole("article");
  expect(screen.getByText("Melbourne")).not.toBeVisible();
  await userEvent.click(
    screen.getByText("Application details", { selector: "summary" }),
  );
  expect(screen.getByText("Melbourne")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "View / edit cover letter" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Cover letter PDF" }),
  ).toHaveAttribute("href", `/files/${application.id}/cover-letter.pdf`);
  expect(screen.queryByRole("textbox", { name: "Comments" })).toBeNull();
  view.rerender(workspace("activity"));
  expect(screen.getByRole("article")).toBe(card);
  expect(screen.queryByRole("button", { name: "Edit CV" })).toBeNull();
  const comment = screen.getByRole("textbox", { name: "Comments" });
  await userEvent.type(comment, "My unfinished review.");
  view.rerender(workspace("documents"));
  expect(comment).not.toBeVisible();
  view.rerender(workspace("activity"));
  expect(screen.getByRole("textbox", { name: "Comments" })).toBe(comment);
  expect(comment).toHaveValue("My unfinished review.");
  expect(fixture.run).not.toHaveBeenCalled();
});

it("keeps the navigation guard while activity is hidden and saves the same draft after returning to activity", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const view = render(workspace("activity"));
  await userEvent.type(
    screen.getByLabelText("Comments"),
    "Reviewed this version.",
  );
  view.rerender(workspace("documents"));
  await userEvent.click(
    screen.getByRole("button", { name: "Leave opportunity" }),
  );
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(fixture.leave).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /switch to Reviewed/ }),
  ).toBeNull();
  view.rerender(workspace("activity"));
  await userEvent.click(
    screen.getByRole("button", { name: "Draft — switch to Reviewed" }),
  );
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith("review", {
      id: application.id,
      status: "reviewed",
      comment: "Reviewed this version.",
    }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Comments")).toHaveValue(""),
  );
  confirm.mockClear();
  await userEvent.click(
    screen.getByRole("button", { name: "Leave opportunity" }),
  );
  expect(fixture.leave).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it("reads the verified CV without invoking the editor or marking the version reviewed", async () => {
  render(workspace());
  expect(screen.getByRole("heading", { name: "CV" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Download CV" })).toHaveAttribute(
    "href",
    "/files/application-a/resume.pdf",
  );
  expect(screen.getByRole("button", { name: "Edit CV" })).toBeVisible();
  expect(fixture.readDocument).toHaveBeenCalledExactlyOnceWith(
    application.id,
    "resume.pdf",
  );
  expect(fixture.action).not.toHaveBeenCalled();
  expect(fixture.run).not.toHaveBeenCalled();
});

it("preserves the explicit submission confirmation when switching tabs without recording anything", async () => {
  const view = render(workspace("activity"));
  await userEvent.click(
    screen.getByRole("button", { name: "Record submission…" }),
  );
  const method = screen.getByLabelText("Where or how you submitted");
  await userEvent.type(method, "Employer website");
  const acknowledgment = screen.getByRole("checkbox", {
    name: "I have already submitted this application.",
  });
  await userEvent.click(acknowledgment);
  view.rerender(workspace("documents"));
  expect(method).not.toBeVisible();
  view.rerender(workspace("activity"));
  expect(screen.getByLabelText("Where or how you submitted")).toBe(method);
  expect(method).toHaveValue("Employer website");
  expect(acknowledgment).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "Record submission…" }),
  ).toHaveFocus();
  expect(fixture.run).not.toHaveBeenCalled();
});

async function recordManualSubmission() {
  await userEvent.click(
    screen.getByRole("button", { name: "Record submission…" }),
  );
  await userEvent.type(
    screen.getByLabelText("Where or how you submitted"),
    "Employer website receipt",
  );
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "I have already submitted this application.",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm submission record" }),
  );
}

it("releases the consumed comment draft after a successful manual submission so Activity can close without a discard prompt", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const submitted: Application = { ...application, status: "submitted" };
  fixture.run.mockResolvedValueOnce(submitted);
  const view = render(workspace("activity"));
  await userEvent.type(
    screen.getByLabelText("Comments"),
    "Reviewed the exact documents.",
  );
  await recordManualSubmission();
  await waitFor(() => expect(fixture.replace).toHaveBeenCalledOnce());
  expect(fixture.run).toHaveBeenCalledWith(
    "review",
    {
      id: application.id,
      status: "submitted",
      comment:
        "Reviewed the exact documents.\nSubmission recorded by user. Method: Employer website receipt",
    },
    expect.any(String),
  );
  expect(screen.getByLabelText("Comments")).toHaveValue("");
  const target = new URL(fixture.replace.mock.calls[0][0], "http://localhost");
  expect(target.searchParams.get("panel")).toBe("activity");
  view.rerender(workspace("activity", submitted));
  await userEvent.click(
    screen.getByRole("button", { name: "Leave opportunity" }),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(fixture.leave).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

it("keeps the comment and confirmation drafts protected when recording a manual submission fails", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fixture.run.mockRejectedValueOnce(
    new Error("Submission record could not be saved"),
  );
  render(workspace("activity"));
  await userEvent.type(
    screen.getByLabelText("Comments"),
    "Keep this review note after failure.",
  );
  await recordManualSubmission();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Submission record could not be saved",
  );
  expect(screen.getByLabelText("Comments")).toHaveValue(
    "Keep this review note after failure.",
  );
  expect(screen.getByLabelText("Where or how you submitted")).toHaveValue(
    "Employer website receipt",
  );
  expect(
    screen.getByRole("checkbox", {
      name: "I have already submitted this application.",
    }),
  ).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Comments")).toHaveValue(
    "Keep this review note after failure.",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Leave opportunity" }),
  );
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(fixture.leave).not.toHaveBeenCalled();
  expect(fixture.replace).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it("opens the exact document version and retains unsaved edits until explicit discard, then restores focus", async () => {
  render(workspace());
  const opener = screen.getByRole("button", { name: "Edit CV" });
  await userEvent.click(opener);
  expect(fixture.action).toHaveBeenCalledWith("document-editor", {
    id: application.id,
    document: "resume",
  });
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Text", { exact: true }), {
    target: { value: "My unsaved version" },
  });
  await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  const confirmation = screen.getByRole("alertdialog", {
    name: "Discard unsaved document edits?",
  });
  await userEvent.click(
    within(confirmation).getByRole("button", { name: "Keep editing" }),
  );
  expect(screen.getByLabelText("Text", { exact: true })).toHaveValue(
    "My unsaved version",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Discard changes" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
  expect(fixture.action).toHaveBeenCalledTimes(1);
});

it("restores focus to the workspace when a document's invoking tab is hidden", async () => {
  const view = render(workspace());
  await userEvent.click(screen.getByRole("button", { name: "Edit CV" }));
  await screen.findByRole("dialog");
  view.rerender(workspace("activity"));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    view.container.querySelector(".opportunity-application"),
  ).toHaveFocus();
});

it("shows previous delivery receipts in Activity without offering another send", async () => {
  fixture.action.mockResolvedValueOnce({
    attempts: [
      {
        id: "confirmed-legacy",
        application_id: application.id,
        channel: "gmail",
        status: "confirmed",
        binding: { job_id: application.job_id },
        receipt: { provider: "fixture", message_id: "fixture-message" },
      },
    ],
  });
  render(workspace("activity"));
  expect(screen.queryByRole("button", { name: /apply for me/i })).toBeNull();
  expect(
    await screen.findByRole("region", { name: "Previous submission attempts" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByText("Confirmation evidence", { selector: "summary" }),
  );
  expect(screen.getByText(/fixture-message/)).toBeVisible();
  expect(fixture.action).toHaveBeenCalledExactlyOnceWith("apply-status");
  expect(fixture.run).not.toHaveBeenCalled();
});

it("keeps submitted documents linked to their exact record and preserves correction restrictions", async () => {
  const submitted: Application = {
    ...application,
    status: "submitted",
    manifest_hash: "a".repeat(64),
    submission_correction_blocked:
      "Confirmed delivery evidence prevents correction.",
  };
  const view = render(workspace("documents", submitted));
  expect(screen.getByRole("link", { name: "Download CV" })).toHaveAttribute(
    "href",
    `/files/${submitted.id}/resume.pdf`,
  );
  view.rerender(workspace("activity", submitted));
  expect(
    screen.getByText("Confirmed delivery evidence prevents correction."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Correct submission record…" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: /apply for me/i })).toBeNull();
  expect(screen.getByText("Review history (1)")).toBeVisible();
});

it("starts a separate local review draft when the selected application changes", async () => {
  const view = render(workspace("activity"));
  await userEvent.type(
    screen.getByLabelText("Comments"),
    "Note for the first application.",
  );
  view.rerender(workspace("activity", { ...application, id: "application-b" }));
  expect(screen.getByLabelText("Comments")).toHaveValue("");
  expect(
    screen.getByRole("article").closest("[data-application-id]"),
  ).toHaveAttribute("data-application-id", "application-b");
  expect(fixture.run).not.toHaveBeenCalled();
});
