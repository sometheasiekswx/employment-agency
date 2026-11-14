import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/page";

const fixture = vi.hoisted(() => ({
  query: "",
  router: { replace: vi.fn() },
  canLeave: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => fixture.router,
  useSearchParams: () => new URLSearchParams(fixture.query),
}));
vi.mock("./unsaved", () => ({
  useDraft: () => ({ canLeave: fixture.canLeave }),
}));

beforeEach(() => {
  fixture.query = "";
  fixture.router.replace.mockReset();
  fixture.canLeave.mockReset().mockReturnValue(true);
  window.history.replaceState(null, "", "/");
});

it.each(["active", "submitted", "rejected"])(
  "preserves %s application bookmarks, filters, and the requested panel",
  (section) => {
    fixture.query = `section=${section}&application=version-1&destination=Singapore&history=true&panel=activity&q=platform`;
    window.history.replaceState(null, "", "/#documents");
    render(<Page />);
    const href = fixture.router.replace.mock.calls[0][0];
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/discover/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: "applications",
      section,
      application: "version-1",
      destination: "Singapore",
      history: "true",
      panel: "activity",
      q: "platform",
    });
    expect(url.hash).toBe("#documents");
  },
);

it.each(["application=version-1", "history=true", "destination=Singapore"])(
  "keeps legacy application filters without an explicit section: %s",
  (query) => {
    fixture.query = query;
    render(<Page />);
    const url = new URL(
      fixture.router.replace.mock.calls[0][0],
      "https://example.test",
    );
    expect(url.searchParams.get("view")).toBe("applications");
    expect(url.searchParams.get("section")).toBe("active");
    if (url.searchParams.has("application"))
      expect(url.searchParams.get("panel")).toBe("documents");
  },
);

it("preserves discovery query state on the root alias", () => {
  fixture.query = "view=saved&q=platform&opportunity=job-1";
  render(<Page />);
  expect(fixture.router.replace).toHaveBeenCalledWith(
    "/discover/?view=saved&q=platform&opportunity=job-1",
  );
});

it("keeps the unsaved-change guard before replacing a legacy route", () => {
  fixture.query = "section=submitted&application=version-1";
  fixture.canLeave.mockReturnValue(false);
  render(<Page />);
  expect(fixture.router.replace).not.toHaveBeenCalled();
  const href = screen
    .getByRole("link", { name: "Opportunities" })
    .getAttribute("href");
  const url = new URL(href!, "https://example.test");
  expect(url.pathname).toMatch(/^\/discover\/?$/);
  expect(url.searchParams.get("application")).toBe("version-1");
});
