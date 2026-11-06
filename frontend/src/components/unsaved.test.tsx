import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DraftProvider, useDraft } from "./unsaved";

function Draft({ name, message }: { name: string; message?: string }) {
  const { setDirty, canLeave, canLeaveOtherDrafts } = useDraft();
  return (
    <div>
      <label>
        {name}
        <input onChange={(event) => setDirty(Boolean(event.target.value))} />
      </label>
      <button
        onClick={() => {
          if (canLeave()) window.location.hash = name;
        }}
      >
        Leave {name}
      </button>
      <button
        onClick={() => {
          if (canLeaveOtherDrafts(message))
            window.location.hash = `saved-${name}`;
        }}
      >
        Save {name}
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

it("excludes the saving draft while ordinary navigation still protects it", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DraftProvider>
      <Draft name="CV" />
    </DraftProvider>,
  );
  fireEvent.change(screen.getByLabelText("CV"), {
    target: { value: "Unsaved CV" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  expect(window.location.hash).toBe("#saved-CV");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Leave CV" }));
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(window.location.hash).toBe("#saved-CV");
});

it("retains both dirty drafts after cancellation and only permits leaving others after confirmation", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const message = "Save the CV and discard the pending comment?";
  render(
    <DraftProvider>
      <Draft name="Comment" />
      <Draft name="CV" message={message} />
    </DraftProvider>,
  );
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "Pending activity note" },
  });
  fireEvent.change(screen.getByLabelText("CV"), {
    target: { value: "Pending document edits" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(message);
  expect(window.location.hash).toBe("");
  expect(screen.getByLabelText("Comment")).toHaveValue("Pending activity note");
  expect(screen.getByLabelText("CV")).toHaveValue("Pending document edits");
  const unload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  expect(window.location.hash).toBe("#saved-CV");
});

it("releases unmounted draft registrations without clearing another draft's protection", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const view = render(
    <DraftProvider>
      <Draft key="comment" name="Comment" />
      <Draft key="cv" name="CV" />
    </DraftProvider>,
  );
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "Pending comment" },
  });
  fireEvent.change(screen.getByLabelText("CV"), {
    target: { value: "Pending CV" },
  });
  view.rerender(
    <DraftProvider>
      <Draft key="cv" name="CV" />
    </DraftProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("#saved-CV");
  fireEvent.click(screen.getByRole("button", { name: "Leave CV" }));
  expect(confirm).toHaveBeenCalledOnce();
});
