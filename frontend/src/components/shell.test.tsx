import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";

const fixture = vi.hoisted(() => ({
  pathname: "/discover/",
  push: vi.fn(),
  canLeave: vi.fn(() => true),
  dock: vi.fn(),
  refresh: vi.fn(),
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

const shell = () => (
  <Shell>
    <button>Save example</button>
  </Shell>
);

beforeEach(() => {
  fixture.pathname = "/discover/";
  fixture.push.mockReset();
  fixture.canLeave.mockReset().mockReturnValue(true);
  fixture.dock.mockReset().mockReturnValue(null);
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  fixture.refreshError = "";

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

it("keeps failed workspace refreshes visible with a retry across page navigation", () => {
  fixture.refreshError = "Unresolved refresh failure";
  const { rerender } = render(shell());
  fixture.pathname = "/history/";
  rerender(shell());
  expect(screen.getByRole("alert")).toHaveTextContent("Unresolved refresh failure");
  fireEvent.click(screen.getByRole("button", { name: "Retry workspace refresh" }));
  expect(fixture.refresh).toHaveBeenCalledOnce();
});
