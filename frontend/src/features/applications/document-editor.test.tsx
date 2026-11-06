import {
  act,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { DraftProvider, useDraft } from "@/components/unsaved";
import type { EditorDocument } from "@/lib/models";
import { DocumentEditor } from "./document-editor";

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  replace: vi.fn(),
  pathname: "/",
  query: "",
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    client: { action: fixture.action, preview: false },
    refresh: fixture.refresh,
    notify: fixture.notify,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: fixture.replace }),
  usePathname: () => fixture.pathname,
  useSearchParams: () => new URLSearchParams(fixture.query),
}));

const document: EditorDocument = {
  id: "app",
  document: "resume",
  base: "original-hash",
  mode: "blocks",
  pdf: "JVBERg==",
  blocks: [["text", "Original text"]],
  source: "Original LaTeX source",
};
const confirmation = () =>
  screen.getByRole("alertdialog", { name: "Discard unsaved document edits?" });
const render = (ui: ReactElement) =>
  renderView(<DraftProvider>{ui}</DraftProvider>);
const protectsDraft = () => {
  const event = new Event("beforeunload", { cancelable: true });
  fireEvent(window, event);
  return event.defaultPrevented;
};

beforeEach(() => {
  vi.clearAllMocks();
  fixture.action.mockReset().mockResolvedValue({ pdf: document.pdf });
  fixture.refresh.mockResolvedValue(undefined);
  fixture.pathname = "/";
  fixture.query = "";
});

it("previews without saving, sends the original base, and saves a preserved draft", async () => {
  fixture.action
    .mockReset()
    .mockResolvedValueOnce({ pdf: "JVBERg==" })
    .mockResolvedValueOnce({ id: "new-draft" });
  const close = vi.fn();
  render(<DocumentEditor document={document} onClose={close} />);
  const user = userEvent.setup();
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("Text"));
  await user.type(within(dialog).getByLabelText("Text"), "Revised text");
  await user.click(
    within(dialog).getByRole("button", { name: "Update preview" }),
  );
  expect(await within(dialog).findByRole("status")).toHaveTextContent(
    "Preview updated",
  );
  expect(fixture.action).toHaveBeenNthCalledWith(1, "preview-document", {
    id: "app",
    document: "resume",
    base: "original-hash",
    blocks: [["text", "Revised text"]],
  });
  expect(close).not.toHaveBeenCalled();
  await user.click(
    within(dialog).getByRole("button", { name: "Save as new draft" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(fixture.action.mock.calls[1][0]).toBe("save-document");
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=active&application=new-draft&panel=documents",
    { scroll: false },
  );
});

it.each([
  ["recommended", "active", "active"],
  ["saved", "submitted", "submitted"],
  ["all", "rejected", "rejected"],
  ["applications", "active", "active"],
  ["applications", "submitted", "active"],
  ["applications", "rejected", "active"],
])(
  "opens the new draft in Documents while preserving the %s opportunity context (%s)",
  async (view, section, expectedSection) => {
    fixture.pathname = "/discover/";
    const query = new URLSearchParams({
      view,
      section,
      location: "Melbourne",
      q: "platform engineer",
      opportunity: "job-a",
      assessment_profile: "profile-a",
      application: document.id,
      panel: "activity",
      history: "true",
    });
    fixture.query = query.toString();
    fixture.action.mockResolvedValueOnce({
      id: "new-version-b",
      job_id: "job-a",
      status: "draft",
    });
    const onClose = vi.fn();
    render(<DocumentEditor document={document} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
      target: { value: "Revised draft wording" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save as new draft" }),
    );
    await waitFor(() => expect(fixture.replace).toHaveBeenCalledOnce());
    const [href, options] = fixture.replace.mock.calls[0];
    const result = new URL(href, "http://localhost");
    query.set("application", "new-version-b");
    query.set("panel", "documents");
    query.set("section", expectedSection);
    expect(result.pathname).toBe("/discover/");
    expect(Object.fromEntries(result.searchParams)).toEqual(
      Object.fromEntries(query),
    );
    expect(options).toEqual({ scroll: false });
    expect(fixture.action).toHaveBeenCalledWith("save-document", {
      id: document.id,
      document: "resume",
      base: "original-hash",
      blocks: [["text", "Revised draft wording"]],
    });
    expect(fixture.refresh).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  },
);

it("keeps unsaved edits and the dialog open when the backend rejects a stale document", async () => {
  fixture.action
    .mockReset()
    .mockRejectedValue(new Error("Files changed; reload the editor"));
  const close = vi.fn();
  render(<DocumentEditor document={document} onClose={close} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Text"), " with unsaved changes");
  await user.click(screen.getByRole("button", { name: "Save as new draft" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Files changed"),
  );
  expect(screen.getByLabelText("Text")).toHaveValue(
    "Original text with unsaved changes",
  );
  expect(close).not.toHaveBeenCalled();
  expect(fixture.replace).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(confirmation()).toBeVisible();
  await user.click(
    within(confirmation()).getByRole("button", { name: "Keep editing" }),
  );
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Text")).toHaveValue(
    "Original text with unsaved changes",
  );
});

it.each([
  ["Save as new draft", "save-document", "Failed to fetch"],
  ["Save as new draft", "save-document", "Load failed"],
  [
    "Save as new draft",
    "save-document",
    "NetworkError when attempting to fetch resource.",
  ],
  ["Update preview", "preview-document", "Failed to fetch"],
  ["Update preview", "preview-document", "Load failed"],
  [
    "Update preview",
    "preview-document",
    "NetworkError when attempting to fetch resource.",
  ],
])(
  "retains edits and offers a safe %s retry after %s transport failure: %s",
  async (label, operation, message) => {
    const saving = operation === "save-document";
    fixture.action
      .mockRejectedValueOnce(new TypeError(message))
      .mockResolvedValueOnce(
        saving
          ? { id: "retried-draft", status: "draft" }
          : { pdf: document.pdf },
      );
    const close = vi.fn();
    render(<DocumentEditor document={document} onClose={close} />);
    const field = screen.getByLabelText("Text", { exact: true });
    fireEvent.change(field, {
      target: { value: "Retained wording for retry" },
    });
    await userEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `Your edits are still in this editor. Check your connection and that the app is running, then try ${label} again.`,
      ),
    );
    expect(field).toHaveValue("Retained wording for retry");
    expect(protectsDraft()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(fixture.replace).not.toHaveBeenCalled();
    const payload = {
      id: document.id,
      document: "resume",
      base: "original-hash",
      blocks: [["text", "Retained wording for retry"]],
    };
    expect(fixture.action).toHaveBeenNthCalledWith(1, operation, payload);
    await userEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(fixture.action).toHaveBeenNthCalledWith(2, operation, payload),
    );
    if (saving) await waitFor(() => expect(close).toHaveBeenCalledOnce());
    else {
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Preview updated. Changes are not saved yet.",
      );
      expect(close).not.toHaveBeenCalled();
      expect(protectsDraft()).toBe(true);
    }
  },
);

function CommentAndEditor({
  onClose,
  editorDocument = document,
}: {
  onClose: () => void;
  editorDocument?: EditorDocument;
}) {
  const { setDirty } = useDraft();
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <>
      <label hidden={open}>
        Activity comment
        <textarea
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setDirty(Boolean(event.target.value));
          }}
        />
      </label>
      <button onClick={() => setOpen(true)}>Open document</button>
      {open && (
        <DocumentEditor
          document={editorDocument}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

it("cancels saving without posting or losing the hidden comment or CV edits, then allows an explicitly confirmed save", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const close = vi.fn();
  fixture.action.mockResolvedValueOnce({
    id: "confirmed-draft",
    status: "draft",
  });
  render(<CommentAndEditor onClose={close} />);
  await userEvent.type(
    screen.getByLabelText("Activity comment"),
    "Keep my activity note.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Open document" }));
  fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
    target: { value: "Keep my CV edits too." },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    "Save this new document version and discard the unsaved Activity changes? Choose Cancel to keep both drafts.",
  );
  expect(fixture.action).not.toHaveBeenCalled();
  expect(fixture.refresh).not.toHaveBeenCalled();
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Activity comment")).toHaveValue(
    "Keep my activity note.",
  );
  expect(screen.getByLabelText("Text", { exact: true })).toHaveValue(
    "Keep my CV edits too.",
  );
  expect(protectsDraft()).toBe(true);
  expect(
    screen.getByRole("button", { name: "Save as new draft" }),
  ).toBeEnabled();
  confirm.mockReturnValue(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(fixture.action).toHaveBeenCalledOnce();
  expect(fixture.action).toHaveBeenCalledWith("save-document", {
    id: document.id,
    document: "resume",
    base: "original-hash",
    blocks: [["text", "Keep my CV edits too."]],
  });
  confirm.mockRestore();
});

it("saves its own dirty CV without asking to discard those document edits", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fixture.action.mockResolvedValueOnce({ id: "own-draft", status: "draft" });
  const close = vi.fn();
  render(<DocumentEditor document={document} onClose={close} />);
  fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
    target: { value: "Only CV edits" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(confirm).not.toHaveBeenCalled();
  expect(fixture.action).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

it("releases the PDF object URL when the editor unmounts", () => {
  const { unmount } = render(
    <DocumentEditor document={document} onClose={() => {}} />,
  );
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture-pdf");
});

it("preserves the TeX editing contract without sending block data", async () => {
  fixture.action.mockReset().mockResolvedValue({ pdf: "JVBERg==" });
  render(
    <DocumentEditor
      document={{ ...document, mode: "tex", source: "Original TeX" }}
      onClose={() => {}}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("LaTeX source"));
  await user.type(screen.getByLabelText("LaTeX source"), "Updated TeX");
  await user.click(screen.getByRole("button", { name: "Update preview" }));
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith("preview-document", {
      id: "app",
      document: "resume",
      base: "original-hash",
      source: "Updated TeX",
    }),
  );
});

it("shows readable text formats while sending the unchanged document style values", async () => {
  render(<DocumentEditor document={document} onClose={vi.fn()} />);
  const format = screen.getByRole("combobox", { name: "Text format" });
  expect(within(format).getByRole("option", { name: "Paragraph" })).toHaveValue(
    "text",
  );
  await userEvent.selectOptions(format, "heading");
  expect(
    within(format).getByRole("option", { name: "Section heading" }),
  ).toHaveProperty("selected", true);
  await userEvent.click(screen.getByRole("button", { name: "Update preview" }));
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith("preview-document", {
      id: document.id,
      document: "resume",
      base: "original-hash",
      blocks: [["heading", "Original text"]],
    }),
  );
});

const sectionDocument: EditorDocument = {
  ...document,
  blocks: [
    ["title", "Alex Morgan"],
    ["bullet", "Verified delivery experience"],
    ["text", "Additional role evidence"],
  ],
};

it("reorders a section by keyboard, preserves its format, and focuses it even when the selected index stays the same", async () => {
  render(<DocumentEditor document={sectionDocument} onClose={vi.fn()} />);
  expect(
    screen.getByRole("button", { name: "Move up section 1" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move down section 3" }),
  ).toBeDisabled();
  const picker = screen.getByRole("combobox", { name: "Document section" });
  expect(picker).toHaveValue("0");
  screen.getByRole("button", { name: "Move up section 2" }).focus();
  await userEvent.keyboard("{Enter}");
  const fields = screen.getAllByLabelText("Text", { exact: true });
  expect(fields.map((field) => (field as HTMLTextAreaElement).value)).toEqual([
    "Verified delivery experience",
    "Alex Morgan",
    "Additional role evidence",
  ]);
  expect(
    screen
      .getAllByRole("combobox", { name: "Text format" })
      .map((field) => (field as HTMLSelectElement).value),
  ).toEqual(["bullet", "title", "text"]);
  expect(fields[0]).toHaveFocus();
  expect(picker).toHaveValue("0");
  expect(
    within(picker).getByRole("option", {
      name: "Section 1 · Verified delivery experience",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Move up section 1" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move down section 1" }),
  ).toBeEnabled();
  expect(protectsDraft()).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(fields[0]).toHaveFocus();
  expect(fields[0]).toHaveValue("Verified delivery experience");
  expect(protectsDraft()).toBe(true);
  expect(fixture.action).not.toHaveBeenCalled();
});

it("sends reordered sections to both preview and save without mutating the original document", async () => {
  fixture.action
    .mockResolvedValueOnce({ pdf: document.pdf })
    .mockResolvedValueOnce({ id: "reordered-draft", status: "draft" });
  const close = vi.fn();
  render(<DocumentEditor document={sectionDocument} onClose={close} />);
  screen.getByRole("button", { name: "Move down section 1" }).focus();
  await userEvent.keyboard(" ");
  expect(
    screen.getByRole("combobox", { name: "Document section" }),
  ).toHaveValue("1");
  expect(screen.getAllByLabelText("Text", { exact: true })[1]).toHaveFocus();
  const payload = {
    id: document.id,
    document: "resume",
    base: "original-hash",
    blocks: [
      ["bullet", "Verified delivery experience"],
      ["title", "Alex Morgan"],
      ["text", "Additional role evidence"],
    ],
  };
  await userEvent.click(screen.getByRole("button", { name: "Update preview" }));
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith("preview-document", payload),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(fixture.action).toHaveBeenCalledWith("save-document", payload);
  expect(sectionDocument.blocks).toEqual([
    ["title", "Alex Morgan"],
    ["bullet", "Verified delivery experience"],
    ["text", "Additional role evidence"],
  ]);
});

it("retains reordered sections and the hidden Activity draft when saving is canceled", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const close = vi.fn();
  render(<CommentAndEditor editorDocument={sectionDocument} onClose={close} />);
  await userEvent.type(
    screen.getByLabelText("Activity comment"),
    "Keep the Activity note.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Open document" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Move up section 2" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    "Save this new document version and discard the unsaved Activity changes? Choose Cancel to keep both drafts.",
  );
  expect(fixture.action).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Activity comment")).toHaveValue(
    "Keep the Activity note.",
  );
  expect(screen.getAllByLabelText("Text", { exact: true })[0]).toHaveValue(
    "Verified delivery experience",
  );
  expect(
    screen.getByRole("combobox", { name: "Document section" }),
  ).toHaveValue("0");
  expect(protectsDraft()).toBe(true);
  confirm.mockRestore();
});

it("shows a PDF-only version without offering an unsupported save", () => {
  render(
    <DocumentEditor
      document={{
        ...document,
        mode: "view",
        notice: "No supported editable source",
      }}
      onClose={() => {}}
    />,
  );
  expect(screen.getByText("No supported editable source")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save as new draft" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Update preview" })).toBeNull();
  expect(screen.getByTitle("Document PDF preview")).toHaveAttribute(
    "src",
    "blob:fixture-pdf",
  );
});

it.each(["blocks", "tex"] as const)(
  "preserves %s edits and the PDF through repeated Escape and explicit cancellation",
  async (mode) => {
    const onClose = vi.fn();
    const browserConfirm = vi.spyOn(window, "confirm");
    const view = render(
      <DocumentEditor document={{ ...document, mode }} onClose={onClose} />,
    );
    const label = mode === "tex" ? "LaTeX source" : "Text";
    const input = screen.getByLabelText(label, { exact: true });
    const editor = screen.getByRole("dialog");
    const pdf = screen.getByTitle("Document PDF preview");
    const pdfSource = pdf.getAttribute("src");
    fireEvent.change(input, {
      target: { value: "Unsaved evidence stays here" },
    });
    input.focus();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(
      within(confirmation()).getByRole("button", { name: "Keep editing" }),
    ).toHaveFocus();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.keyDown(confirmation(), { key: "Escape", repeat: true });
    expect(confirmation()).toBeVisible();
    fireEvent.keyDown(confirmation(), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(input).toHaveValue("Unsaved evidence stays here");
    expect(input).toHaveFocus();
    expect(screen.getByTitle("Document PDF preview")).toBe(pdf);
    expect(pdf).toHaveAttribute("src", pdfSource);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(editor, { key: "Escape" });
    await userEvent.click(
      within(confirmation()).getByRole("button", { name: "Keep editing" }),
    );
    expect(input).toHaveValue("Unsaved evidence stays here");
    expect(input).toHaveFocus();
    fireEvent.keyDown(editor, { key: "Escape" });
    const discard = within(confirmation()).getByRole("button", {
      name: "Discard changes",
    });
    discard.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(protectsDraft()).toBe(false);
    expect(fixture.action).not.toHaveBeenCalled();
    expect(browserConfirm).not.toHaveBeenCalled();
    view.unmount();
    browserConfirm.mockRestore();
  },
);

it("keeps the editor open during preview generation and retains edits after it finishes", async () => {
  let finish!: (value: { pdf: string }) => void;
  fixture.action.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  render(<DocumentEditor document={document} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
    target: { value: "Pending edits" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update preview" }));
  const editor = screen.getByRole("dialog");
  fireEvent.keyDown(editor, { key: "Escape" });
  fireEvent(editor, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await act(async () => {
    finish({ pdf: document.pdf });
  });
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(confirmation()).toBeVisible();
  fireEvent.keyDown(confirmation(), { key: "Escape" });
  expect(screen.getByLabelText("Text", { exact: true })).toHaveValue(
    "Pending edits",
  );
});

it("retains dirty edits when a platform close request bypasses cancellation", () => {
  const onClose = vi.fn();
  render(<DocumentEditor document={document} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
    target: { value: "Protected edits" },
  });
  const editor = screen.getByRole("dialog") as HTMLDialogElement;
  fireEvent(editor, new Event("cancel", { cancelable: false }));
  editor.open = false;
  fireEvent(editor, new Event("close"));
  expect(editor.open).toBe(true);
  expect(confirmation()).toBeVisible();
  expect(
    within(confirmation()).getByRole("button", { name: "Keep editing" }),
  ).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
});

it("closes an unchanged read-only document with Escape without a discard prompt", () => {
  const onClose = vi.fn();
  render(
    <DocumentEditor
      document={{ ...document, mode: "view" }}
      onClose={onClose}
    />,
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(fixture.action).not.toHaveBeenCalled();
});

const mobileEditor = () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

it("keeps editing and PDF preview together on desktop with navigation to real blocks", () => {
  render(<DocumentEditor document={document} onClose={vi.fn()} />);
  expect(screen.getByRole("region", { name: "Edit document" })).toBeVisible();
  expect(screen.getByRole("region", { name: "PDF preview" })).toBeVisible();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(
    screen.getByRole("combobox", { name: "Document section" }),
  ).toHaveValue("0");
  expect(
    screen.getByRole("option", { name: "Section 1 · Original text" }),
  ).toBeInTheDocument();
});

it("switches directly between mobile editing and the same PDF without losing blocks or creating changes", async () => {
  mobileEditor();
  render(<DocumentEditor document={document} onClose={vi.fn()} />);
  const edit = screen.getByRole("tab", { name: "Edit" });
  const preview = screen.getByRole("tab", { name: "Preview", selected: true });
  const input = screen.getByLabelText("Text", { exact: true });
  const pdf = screen.getByTitle("Document PDF preview");
  const source = pdf.getAttribute("src");
  expect(screen.getByRole("tabpanel", { name: "Preview" })).toBeVisible();
  expect(preview).toHaveAttribute("aria-selected", "true");
  expect(input).not.toBeVisible();
  expect(pdf).toBeVisible();
  expect(protectsDraft()).toBe(false);
  await userEvent.click(edit);
  expect(pdf).not.toBeVisible();
  expect(screen.getByLabelText("Text", { exact: true })).toBe(input);
  fireEvent.change(input, { target: { value: "Unsaved mobile wording" } });
  await userEvent.click(preview);
  await userEvent.keyboard("{ArrowLeft}");
  expect(edit).toHaveFocus();
  expect(input).toHaveValue("Unsaved mobile wording");
  await userEvent.keyboard("{End}");
  expect(preview).toHaveFocus();
  expect(screen.getByTitle("Document PDF preview")).toBe(pdf);
  expect(pdf).toHaveAttribute("src", source);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(fixture.action).not.toHaveBeenCalled();
});

it("jumps to the actual selected mobile text block and retains every edit", async () => {
  mobileEditor();
  const blocks: EditorDocument["blocks"] = [
    ["title", "Alex Morgan"],
    ["heading", "Professional experience"],
    ["bullet", "Improved warehouse operations with verified team evidence."],
  ];
  render(
    <DocumentEditor document={{ ...document, blocks }} onClose={vi.fn()} />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
  const inputs = screen.getAllByLabelText("Text", { exact: true });
  fireEvent.change(inputs[0], {
    target: { value: "Edited candidate heading" },
  });
  await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
  expect(
    screen.queryByRole("combobox", { name: "Document section" }),
  ).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
  const sections = screen.getByRole("combobox", { name: "Document section" });
  expect(
    within(sections).getByRole("option", {
      name: "Section 2 · Professional experience",
    }),
  ).toBeInTheDocument();
  expect(
    within(sections).getByRole("option", {
      name: "Section 1 · Edited candidate heading",
    }),
  ).toBeInTheDocument();
  const scroll = vi.fn();
  inputs[2].scrollIntoView = scroll;
  await userEvent.selectOptions(sections, "2");
  expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(inputs[2]).toHaveFocus();
  expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
  expect(inputs[0]).toHaveValue("Edited candidate heading");
  expect(inputs[2]).toHaveValue(blocks[2][1]);
  expect(fixture.action).not.toHaveBeenCalled();
});

it("keeps unsaved mobile preview edits through the close confirmation and saves them as a new version", async () => {
  mobileEditor();
  fixture.action.mockResolvedValueOnce({ id: "mobile-draft", status: "draft" });
  const close = vi.fn();
  render(<DocumentEditor document={document} onClose={close} />);
  await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Text", { exact: true }), {
    target: { value: "Mobile draft wording" },
  });
  const preview = screen.getByRole("tab", { name: "Preview" });
  await userEvent.click(preview);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(confirmation()).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(preview).toHaveFocus();
  await userEvent.click(
    screen.getByRole("button", { name: "Save as new draft" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(fixture.action).toHaveBeenCalledWith("save-document", {
    id: document.id,
    document: "resume",
    base: "original-hash",
    blocks: [["text", "Mobile draft wording"]],
  });
  expect(fixture.replace).toHaveBeenCalledWith(
    "/discover/?view=applications&section=active&application=mobile-draft&panel=documents",
    { scroll: false },
  );
});

it("preserves the mobile LaTeX source across Preview and Edit without inventing block sections", async () => {
  mobileEditor();
  render(
    <DocumentEditor
      document={{ ...document, mode: "tex" }}
      onClose={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
  const input = screen.getByLabelText("LaTeX source");
  fireEvent.change(input, { target: { value: "Revised LaTeX source" } });
  await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
  expect(screen.getByTitle("Document PDF preview")).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
  expect(input).toHaveValue("Revised LaTeX source");
  expect(
    screen.queryByRole("combobox", { name: "Document section" }),
  ).toBeNull();
  expect(fixture.action).not.toHaveBeenCalled();
});
