import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  OpportunityListingLink,
  OpportunitySourceProvider,
} from "./opportunity-source-preview";

const job = {
  title: "Test engineer",
  employer: "Fictional company",
  description: "Saved listing details",
  url: "https://preview.example.com/jobs/example?ref=saved",
};

function renderLink(url = job.url) {
  return render(
    <OpportunityListingLink job={{ ...job, url }}>
      Original listing
    </OpportunityListingLink>,
    { wrapper: OpportunitySourceProvider },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("follows the original link in a new tab on desktop", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  renderLink();
  const link = screen.getByRole("link", { name: "Original listing" });
  expect(link).toHaveAttribute("href", job.url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(fireEvent.click(link)).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("lets the installed mobile app handle the original link navigation", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 EmploymentAgencyMobile/1",
  );
  renderLink();
  const link = screen.getByRole("link", { name: "Original listing" });
  expect(link).toHaveAttribute("href", job.url);
  expect(fireEvent.click(link)).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a website preview only after an ordinary listing click and retains saved details", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const user = userEvent.setup();
  renderLink();
  const opener = screen.getByRole("link", { name: "Original listing" });
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  expect(fireEvent.click(opener, { metaKey: true })).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(opener);

  const dialog = screen.getByRole("dialog", { name: "Listing preview" });
  const frame = within(dialog).getByTitle("Listing website preview");
  const relay = new URL(frame.getAttribute("src")!, "https://app.example.com");
  expect(relay.pathname).toBe("/api/listing-preview-frame");
  expect(relay.search).toBe("?host=preview.example.com");
  expect(decodeURIComponent(relay.hash.slice(1))).toBe(job.url);
  expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(within(dialog).getByText(job.description)).toBeVisible();
  expect(frame).not.toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Show website" }),
  );
  expect(frame).toBeVisible();
  expect(within(dialog).getByTitle("Listing website preview")).toBe(frame);
  expect(
    within(dialog).getByRole("link", { name: "Open in new tab" }),
  ).toHaveAttribute("href", job.url);

  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();

  await user.click(opener);
  expect(screen.getByText(job.description)).toBeVisible();
  expect(screen.getByTitle("Listing website preview")).toBe(frame);
  expect(frame).not.toBeVisible();
});

it.each([
  "https://127.0.0.1/job",
  "https://[::1]/job",
  "https://printer.local/job",
  "https://machine.net.ts.net/job",
  "https://preview.example.com:444/job",
])("uses the saved preview for %s", (url) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  renderLink(url);
  fireEvent.click(screen.getByRole("link", { name: "Original listing" }));
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  expect(screen.getByText(job.description)).toBeVisible();
});

it("keeps the public showcase on recorded details", () => {
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "1");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  renderLink();
  fireEvent.click(screen.getByRole("link", { name: "Original listing" }));
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  expect(screen.getByText(job.description)).toBeVisible();
});
