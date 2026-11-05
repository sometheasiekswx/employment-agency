import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";

const fixture = vi.hoisted(() => ({
  notice: "",
  refreshError: "",
  profileId: "",
  client: { preview: false, hosted: false },
  state: {
    identity: { name: "Fictional Candidate" },
    profiles: [],
    jobs: [],
    applications: [],
    _workspace: { setup_complete: true, preferred_locations: [] },
  },
  animate: vi.fn(),
}));

vi.mock("./workspace-provider", () => ({ useWorkspace: () => fixture }));
vi.mock("./unsaved", () => ({
  useDraft: () => ({ canLeave: () => true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discover/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./react-bits/dock", () => ({ default: () => null }));
vi.mock("motion", () => ({ animate: fixture.animate }));

class MotionPreference extends EventTarget {
  matches = false;

  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

let preference: MotionPreference;
let controls: { cancel: ReturnType<typeof vi.fn> }[];

const shell = () => (
  <Shell>
    <button>Save example</button>
  </Shell>
);

beforeEach(() => {
  fixture.notice = "";
  fixture.refreshError = "";
  preference = new MotionPreference();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => preference),
  );
  controls = [];
  fixture.animate.mockReset().mockImplementation((element: HTMLElement) => {
    element.style.opacity = "0.5";
    element.style.transform = "translateY(4px)";
    const control = { cancel: vi.fn() };
    controls.push(control);
    return control;
  });
});

it("keeps one live region and reveals a new notice only once across refreshes", () => {
  const { rerender } = render(shell());
  const notice = screen.getByRole("status");
  expect(notice).toHaveAttribute("id", "notice");
  expect(notice).toHaveAttribute("aria-live", "polite");
  expect(notice).toBeEmptyDOMElement();
  expect(fixture.animate).not.toHaveBeenCalled();

  fixture.notice = "Saved.";
  rerender(shell());
  expect(screen.getByRole("status")).toBe(notice);
  expect(notice).toHaveTextContent("Saved.");
  expect(fixture.animate).toHaveBeenCalledTimes(1);
  expect(fixture.animate).toHaveBeenCalledWith(
    notice,
    { opacity: [0.5, 1], transform: ["translateY(4px)", "translateY(0px)"] },
    { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  );

  rerender(shell());
  expect(fixture.animate).toHaveBeenCalledTimes(1);
  expect(controls[0].cancel).not.toHaveBeenCalled();
});

it("cancels replaced notices, removed errors and unmounted feedback independently", () => {
  fixture.notice = "First save.";
  const { rerender, unmount } = render(shell());
  const notice = screen.getByRole("status");
  fixture.notice = "Second save.";
  rerender(shell());
  expect(controls[0].cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toBe(notice);

  fixture.refreshError = "Workspace refresh failed.";
  rerender(shell());
  const error = screen.getByRole("alert");
  expect(error).toHaveTextContent("Workspace refresh failed.");
  expect(fixture.animate).toHaveBeenLastCalledWith(
    error,
    { opacity: [0.5, 1], transform: ["translateY(0px)", "translateY(0px)"] },
    { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
  );

  fixture.notice = "Third save.";
  rerender(shell());
  expect(controls[1].cancel).toHaveBeenCalledOnce();
  expect(controls[2].cancel).not.toHaveBeenCalled();
  expect(fixture.animate).toHaveBeenCalledTimes(4);

  fixture.refreshError = "";
  rerender(shell());
  expect(controls[2].cancel).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  unmount();
  expect(controls[3].cancel).toHaveBeenCalledOnce();
});

it("shows keyboard feedback immediately and stops an active reveal on keyboard input", () => {
  const { rerender } = render(shell());
  const save = screen.getByRole("button", { name: "Save example" });
  fireEvent.keyDown(save, { key: "Enter" });
  fixture.notice = "Keyboard save completed.";
  rerender(shell());
  expect(screen.getByRole("status")).toHaveTextContent(
    "Keyboard save completed.",
  );
  expect(fixture.animate).not.toHaveBeenCalled();
  expect(save.closest(".workspace")).toHaveAttribute(
    "data-feedback-input",
    "keyboard",
  );

  fireEvent.pointerDown(save);
  fixture.notice = "Pointer save completed.";
  rerender(shell());
  expect(fixture.animate).toHaveBeenCalledOnce();
  fireEvent.keyDown(save, { key: "Tab" });
  expect(controls[0].cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").style.opacity).toBe("");
  expect(screen.getByRole("status").style.transform).toBe("");
});

it("respects reduced motion at entry and stops active feedback when it changes", () => {
  preference.matches = true;
  fixture.notice = "Saved with reduced motion.";
  const removeListener = vi.spyOn(preference, "removeEventListener");
  const { rerender, unmount } = render(shell());
  expect(screen.getByRole("status")).toHaveTextContent(
    "Saved with reduced motion.",
  );
  expect(fixture.animate).not.toHaveBeenCalled();

  preference.change(false);
  rerender(shell());
  expect(fixture.animate).not.toHaveBeenCalled();
  fixture.notice = "Next save.";
  rerender(shell());
  expect(fixture.animate).toHaveBeenCalledOnce();

  preference.change(true);
  expect(controls[0].cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").style.opacity).toBe("");
  expect(screen.getByRole("status").style.transform).toBe("");
  expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
  fixture.refreshError = "Refresh failed with reduced motion.";
  rerender(shell());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Refresh failed with reduced motion.",
  );
  expect(fixture.animate).toHaveBeenCalledOnce();
  unmount();
  expect(controls[0].cancel).toHaveBeenCalledOnce();
});
