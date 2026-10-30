import { expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorDocument } from "@/lib/models";
import { DocumentEditor } from "./document-editor";

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    client: { action: fixture.action },
    refresh: fixture.refresh,
    notify: fixture.notify,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: fixture.replace }),
}));
const document: EditorDocument = {
  id: "app",
  document: "resume",
  mode: "blocks",
  base: "original-hash",
  pdf: "JVBERg==",
  blocks: [["text", "Original text"]],
};

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
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(close).not.toHaveBeenCalled();
  expect(window.confirm).toHaveBeenCalledWith(
    "Discard unsaved document edits?",
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
