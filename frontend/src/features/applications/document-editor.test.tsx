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
import type { EditorDocument } from "@/lib/models";
import { DocumentEditor } from "./document-editor";

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  markDraft: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    client: { action: fixture.action, preview: false },
    refresh: fixture.refresh,
    notify: fixture.notify,
  }),
}));
vi.mock("@/components/unsaved", () => ({
  useDraft: () => ({ setDirty: fixture.markDraft }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: fixture.replace }),
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

beforeEach(() => {
  vi.clearAllMocks();
  fixture.action.mockReset().mockResolvedValue({ pdf: document.pdf });
  fixture.refresh.mockResolvedValue(undefined);
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
  expect(fixture.replace).toHaveBeenCalledWith("/");
});

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
    expect(fixture.markDraft).toHaveBeenLastCalledWith(false);
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
