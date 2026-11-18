import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";

const fixture = vi.hoisted(() => ({
  pathname: "/discover/",
  push: vi.fn(),
  canLeave: vi.fn(() => true),
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
vi.mock("./react-bits/gooey-selection", () => ({ GooeySelection: () => null }));

const shell = () => (
  <Shell>
    <button>Save example</button>
  </Shell>
);

beforeEach(() => {
  fixture.pathname = "/discover/";
  fixture.push.mockReset();
  fixture.canLeave.mockReset().mockReturnValue(true);
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  fixture.refreshError = "";
});

it("unifies navigation under Opportunities and keeps every other workspace page accessible", () => {
  render(shell());
  const navigation = screen.getByRole("navigation", {
    name: "Workspace sections",
  });
  expect(
    within(navigation)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")?.replace(/\/?$/, "/")),
  ).toEqual(["/discover/", "/career/", "/search/", "/history/", "/settings/"]);
  expect(
    within(navigation).getByRole("link", { current: "page" }),
  ).toHaveAccessibleName("Opportunities");
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
  const navigation = screen.getByRole("navigation", {
    name: "Workspace sections",
  });
  expect(
    within(navigation).getByRole("link", { current: "page" }),
  ).toHaveAccessibleName("Opportunities");
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
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unresolved refresh failure",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry workspace refresh" }),
  );
  expect(fixture.refresh).toHaveBeenCalledOnce();
});
