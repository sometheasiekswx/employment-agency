import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";

const fixture = vi.hoisted(() => ({
  pathname: "/discover/",
  push: vi.fn(),
  canLeave: vi.fn(() => true),
  dock: vi.fn(),
  notice: "",
  notify: vi.fn(),
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
  useDraft: () => ({ canLeave: fixture.canLeave }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fixture.pathname,
  useRouter: () => ({ push: fixture.push }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./react-bits/dock", () => ({ default: fixture.dock }));
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

it("keeps current feedback within Opportunities and clears success feedback when leaving the page", () => {
  fixture.notice = "Saved as a new draft.";
  fixture.refreshError = "Unresolved refresh failure";
  const { rerender } = render(shell());
  expect(fixture.notify).not.toHaveBeenCalled();
  rerender(shell());
  expect(fixture.notify).not.toHaveBeenCalled();
  fixture.pathname = "/history/";
  rerender(shell());
  expect(fixture.notify).toHaveBeenCalledExactlyOnceWith("");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unresolved refresh failure",
  );
});

beforeEach(() => {
  fixture.pathname = "/discover/";
  fixture.push.mockReset();
  fixture.canLeave.mockReset().mockReturnValue(true);
  fixture.dock.mockReset().mockReturnValue(null);
  fixture.notice = "";
  fixture.notify.mockReset();
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

it("unifies navigation under Opportunities and keeps every other workspace page accessible", () => {
  render(shell());
  const { items, canLeave } = fixture.dock.mock.calls[0][0];
  expect(
    items.map(({ href, label }: { href: string; label: string }) => [
      href,
      label,
    ]),
  ).toEqual([
    ["/discover/", "Opportunities"],
    ["/career/", "Career profile"],
    ["/search/", "Search preferences"],
    ["/history/", "History"],
    ["/settings/", "Settings"],
  ]);
  expect(canLeave).toBe(fixture.canLeave);
  expect(
    screen.queryByRole("link", { name: "Applications" }),
  ).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("link", { name: "Employment Agency — Opportunities" })
      .getAttribute("href"),
  ).toMatch(/^\/discover\/?$/);
  expect(document.title).toBe(
    "Opportunities | Employment Agency | Local workspace",
  );
});

it("labels the legacy root as Opportunities while its redirect is loading", () => {
  fixture.pathname = "/";
  render(shell());
  expect(
    screen.getByRole("heading", { name: "Opportunities", hidden: true }),
  ).toBeInTheDocument();
  expect(fixture.dock.mock.calls[0][0].pathname).toBe("/discover/");
  expect(document.title).toBe(
    "Opportunities | Employment Agency | Local workspace",
  );
});

it("searches Opportunities and respects unsaved changes before navigating", () => {
  fixture.pathname = "/career/";
  render(shell());
  const input = screen.getByRole("searchbox", { name: "Search roles" });
  fireEvent.change(input, { target: { value: "  platform engineer  " } });
  fixture.canLeave.mockReturnValue(false);
  fireEvent.submit(screen.getByRole("search", { name: "Search roles" }));
  expect(fixture.push).not.toHaveBeenCalled();
  fixture.canLeave.mockReturnValue(true);
  fireEvent.submit(screen.getByRole("search", { name: "Search roles" }));
  expect(fixture.push).toHaveBeenCalledWith("/discover/?q=platform+engineer");
  fireEvent.change(input, { target: { value: "  " } });
  fireEvent.submit(screen.getByRole("search", { name: "Search roles" }));
  expect(fixture.push).toHaveBeenLastCalledWith("/discover/");
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
