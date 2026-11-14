import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationProvider, useNotifications } from "./notification-center";

function Controls() {
  const { notify, setNotification, removeNotification } = useNotifications();
  return (
    <>
      <button onClick={() => notify("Saved.")}>Save</button>
      <button
        onClick={() =>
          setNotification("undo", {
            kind: "undo",
            message: "Removed.",
            actions: [
              {
                label: "Undo",
                run: () => {
                  removeNotification("undo");
                  notify("Restored.");
                },
              },
            ],
          })
        }
      >
        Remove
      </button>
      <button onClick={() => notify("Try the action again.", "error")}>
        Show error
      </button>
    </>
  );
}

const cards = (text: string) =>
  Array.from(document.querySelectorAll(".notification-card p")).filter(
    (card) => card.textContent === text && !card.closest("[inert]"),
  );

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

function start() {
  render(
    <NotificationProvider>
      <Controls />
    </NotificationProvider>,
  );
  advance(25);
  return {
    save: screen.getByRole("button", { name: "Save" }),
    error: screen.getByRole("button", { name: "Show error" }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("gives each identical success and each error its own lifetime", () => {
  const { save, error } = start();
  fireEvent.click(save);
  advance(2_000);
  fireEvent.click(save);
  fireEvent.click(error);
  expect(cards("Saved.")).toHaveLength(2);
  advance(3_000);
  expect(cards("Saved.")).toHaveLength(1);
  expect(cards("Try the action again.")).toHaveLength(1);
  advance(2_000);
  expect(cards("Saved.")).toHaveLength(0);
  expect(cards("Try the action again.")).toHaveLength(1);
  advance(3_000);
  expect(cards("Try the action again.")).toHaveLength(0);
});

it("preserves elapsed time across overlapping pointer, focus and page visibility pauses", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const { save } = start();
  fireEvent.click(save);
  advance(2_000);
  const card = cards("Saved.")[0];
  fireEvent.pointerOver(card);
  const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
  fireEvent.focusIn(dismiss, { relatedTarget: save });
  advance(8_000);
  expect(cards("Saved.")).toHaveLength(1);
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  fireEvent.pointerOut(card);
  fireEvent.focusOut(dismiss, { relatedTarget: save });
  advance(8_000);
  expect(cards("Saved.")).toHaveLength(1);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  advance(2_999);
  expect(cards("Saved.")).toHaveLength(1);
  advance(1);
  expect(cards("Saved.")).toHaveLength(0);
});

it("resumes the stack when a focused action disappears", async () => {
  start();
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  const undo = screen.getByRole("button", { name: "Undo" });
  await act(async () => undo.focus());
  expect(undo).toHaveFocus();
  await act(async () => fireEvent.click(undo));
  expect(cards("Restored.")).toHaveLength(1);
  advance(5_000);
  expect(cards("Restored.")).toHaveLength(0);
});
