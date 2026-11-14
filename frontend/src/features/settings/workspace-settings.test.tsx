import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceSettings } from "./workspace-settings";

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  canLeave: vi.fn(),
  state: {
    _workspace: {
      path: "/fictional-workspace",
      master: "master.txt",
      timezone: "UTC",
      preferred_locations: [] as string[],
      master_template: false,
    },
  },
}));

vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: fixture.state,
    client: { action: fixture.action, hosted: false, preview: false },
    refresh: fixture.refresh,
    notify: fixture.notify,
  }),
}));
vi.mock("@/components/unsaved", () => ({
  useDraft: () => ({ canLeave: fixture.canLeave, setDirty: vi.fn() }),
}));

beforeEach(() => {
  fixture.action.mockReset();
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  fixture.notify.mockReset();
  fixture.canLeave.mockReset().mockReturnValue(true);
  // Reproduce a frame callback arriving before React's enabling commit.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

it.each(["cancelled", "error"])(
  "restores focus after the picker button is enabled following %s",
  async (outcome) => {
    let resolve!: (result: { cancelled: boolean }) => void;
    let reject!: (error: Error) => void;
    fixture.action.mockReturnValue(
      new Promise((finish, fail) => {
        resolve = finish;
        reject = fail;
      }),
    );
    const { rerender } = render(<WorkspaceSettings />);
    const open = screen.getByRole<HTMLButtonElement>("button", {
      name: "Open Folder",
    });
    const other = screen.getByLabelText("Timezone for version dates");
    other.focus();
    expect(other).toHaveFocus();

    await userEvent.click(open);
    expect(open).toBeDisabled();
    other.focus();
    const focusStates: boolean[] = [];
    open.addEventListener("focus", () => focusStates.push(open.disabled));

    await act(async () => {
      if (outcome === "cancelled") resolve({ cancelled: true });
      else reject(new Error("Folder chooser unavailable"));
    });
    expect(open).toBeEnabled();
    expect(open).toHaveFocus();
    expect(focusStates).toEqual([false]);
    expect(fixture.refresh).not.toHaveBeenCalled();
    expect(fixture.notify).toHaveBeenLastCalledWith(
      outcome === "cancelled"
        ? "Folder selection cancelled."
        : "Folder chooser unavailable",
      outcome === "cancelled" ? "info" : "error",
    );
    if (outcome === "error")
      expect(screen.getByRole("alert")).toHaveTextContent("Folder chooser unavailable");

    other.focus();
    rerender(<WorkspaceSettings />);
    expect(other).toHaveFocus();
    expect(focusStates).toEqual([false]);
  },
);

it("leaves initial, refreshed and cancelled draft navigation focus alone", async () => {
  const { rerender } = render(<WorkspaceSettings />);
  const open = screen.getByRole("button", { name: "Open Folder" });
  expect(open).not.toHaveFocus();
  const other = screen.getByLabelText("Timezone for version dates");
  other.focus();
  rerender(<WorkspaceSettings />);
  expect(other).toHaveFocus();

  fixture.canLeave.mockReturnValue(false);
  await userEvent.click(open);
  expect(fixture.action).not.toHaveBeenCalled();
  other.focus();
  rerender(<WorkspaceSettings />);
  expect(other).toHaveFocus();
});
