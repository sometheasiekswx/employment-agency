import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DraftProvider } from "@/components/unsaved";
import {
  RemovalFeedback,
  type RemovalFeedbackProps,
  type RemovalReasonEditor,
} from "./removal-feedback";

const firstJob = {
  id: "first-job",
  title: "Cloud Engineer",
  employer: "Example Cloud",
};
const secondJob = {
  id: "second-job",
  title: "Backend Engineer",
  employer: "Example Studio",
};

function props(): RemovalFeedbackProps {
  return {
    feedback: { job: firstJob, removalId: "first-removal", status: "removed" },
    onUndo: vi.fn(),
    onAddReason: vi.fn(),
    onRetryRemoval: vi.fn(),
    onDismiss: vi.fn(),
    onChangeReason: vi.fn(),
    onSaveReason: vi.fn(),
    onCloseReason: vi.fn(),
  };
}

function reasonEditor(): RemovalReasonEditor {
  return {
    job: firstJob,
    removalId: "first-removal",
    value: "Prefer a role with more product work.",
    saving: false,
  };
}

it("names the removed job and exposes recovery without moving focus", async () => {
  const callbacks = props();
  const view = render(
    <>
      <button>Keep browsing</button>
      <RemovalFeedback {...callbacks} feedback={undefined} />
    </>,
  );
  const browsing = screen.getByRole("button", { name: "Keep browsing" });
  browsing.focus();
  view.rerender(
    <>
      <button>Keep browsing</button>
      <RemovalFeedback {...callbacks} />
    </>,
  );
  expect(browsing).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Removed Cloud Engineer · Example Cloud.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  await userEvent.click(screen.getByRole("button", { name: "Add reason" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Dismiss removal feedback" }),
  );
  expect(callbacks.onUndo).toHaveBeenCalledOnce();
  expect(callbacks.onAddReason).toHaveBeenCalledOnce();
  expect(callbacks.onDismiss).toHaveBeenCalledOnce();
});

it("allows queued Undo during removal and offers retry for an error", async () => {
  const callbacks = props();
  const view = render(
    <RemovalFeedback
      {...callbacks}
      feedback={{ ...callbacks.feedback!, status: "removing" }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Removing Cloud Engineer · Example Cloud.",
  );
  expect(screen.queryByRole("button", { name: "Add reason" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(callbacks.onUndo).toHaveBeenCalledOnce();

  view.rerender(
    <RemovalFeedback
      {...callbacks}
      feedback={{
        ...callbacks.feedback!,
        status: "error",
        error: "The workspace is locked. Try again.",
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn’t update Cloud Engineer · Example Cloud.",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The workspace is locked. Try again.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(callbacks.onRetryRemoval).toHaveBeenCalledOnce();
});

it("keeps an earlier job's reason editor separate from later removal feedback", () => {
  const callbacks = props();
  const editor = reasonEditor();
  const view = render(<RemovalFeedback {...callbacks} editor={editor} />);
  const reason = screen.getByRole("textbox", {
    name: "Removal reason (optional)",
  });
  reason.focus();

  view.rerender(
    <RemovalFeedback
      {...callbacks}
      editor={editor}
      feedback={{
        job: secondJob,
        removalId: "second-removal",
        status: "removed",
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Removed Backend Engineer · Example Studio.",
  );
  const form = screen.getByRole("form", { name: "Reason for removing" });
  expect(form).toHaveTextContent("Cloud Engineer · Example Cloud");
  expect(reason).toHaveValue(editor.value);
  expect(reason).toHaveFocus();
});

it("saves only on explicit submit and leaves the document draft guard untouched", async () => {
  const callbacks = props();
  function ControlledEditor() {
    const [value, setValue] = useState("");
    return (
      <RemovalFeedback
        {...callbacks}
        feedback={undefined}
        editor={{ ...reasonEditor(), value }}
        onChangeReason={setValue}
      />
    );
  }
  render(
    <DraftProvider>
      <ControlledEditor />
    </DraftProvider>,
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Removal reason (optional)" }),
    "A draft{Enter}with a second line.",
  );
  expect(callbacks.onSaveReason).not.toHaveBeenCalled();
  const unload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(false);
  const save = screen.getByRole("button", { name: "Save reason" });
  save.focus();
  await userEvent.keyboard("{Enter}");
  expect(callbacks.onSaveReason).toHaveBeenCalledOnce();
});

it("keeps text editable while saving and retries the retained draft after failure", async () => {
  const callbacks = props();
  const editor = reasonEditor();
  const view = render(
    <RemovalFeedback {...callbacks} editor={{ ...editor, saving: true }} />,
  );
  const form = screen.getByRole("form", { name: "Reason for removing" });
  expect(
    within(form).getByRole("button", { name: "Save reason" }),
  ).toBeDisabled();
  expect(within(form).getByRole("textbox")).toBeEnabled();
  expect(
    within(form).getByRole("button", { name: "Close reason editor" }),
  ).toBeEnabled();
  fireEvent.change(within(form).getByRole("textbox"), {
    target: { value: "Still writing while saving" },
  });
  expect(callbacks.onChangeReason).toHaveBeenCalledWith(
    "Still writing while saving",
  );
  fireEvent.submit(form);
  expect(callbacks.onSaveReason).not.toHaveBeenCalled();

  view.rerender(
    <RemovalFeedback
      {...callbacks}
      editor={{ ...editor, error: "Could not save. Your text is still here." }}
    />,
  );
  expect(within(form).getByRole("textbox")).toHaveValue(editor.value);
  expect(within(form).getByRole("alert")).toHaveTextContent("Could not save.");
  await userEvent.click(
    within(form).getByRole("button", { name: "Retry saving reason" }),
  );
  expect(callbacks.onSaveReason).toHaveBeenCalledOnce();
  await userEvent.click(
    within(form).getByRole("button", { name: "Clear text" }),
  );
  expect(callbacks.onChangeReason).toHaveBeenLastCalledWith("");
});

it("supports restored feedback, an empty title and an editor without a notice", () => {
  const callbacks = props();
  const view = render(
    <RemovalFeedback
      {...callbacks}
      feedback={{
        ...callbacks.feedback!,
        job: { id: "untitled", title: "   ", employer: "" },
        status: "restored",
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Restored Untitled opportunity.",
  );
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  view.rerender(
    <RemovalFeedback
      {...callbacks}
      feedback={undefined}
      editor={{ ...reasonEditor(), saved: true }}
    />,
  );
  expect(
    screen.queryByRole("region", { name: "Opportunity removal" }),
  ).toBeNull();
  expect(
    screen.getByRole("form", { name: "Reason for removing" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Reason saved.");
});
