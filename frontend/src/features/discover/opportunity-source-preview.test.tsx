import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  OpportunityListingLink,
  OpportunitySourcePreview,
} from "./opportunity-source-preview";

const job = {
  title: "Test engineer",
  employer: "Fictional company",
  description: "Saved listing details",
  url: "https://preview.example.com/jobs/example?ref=saved",
};

afterEach(() => vi.unstubAllEnvs());

it("opens a website preview only after an ordinary listing click and retains saved details", async () => {
  const user = userEvent.setup();
  render(
    <OpportunityListingLink job={job}>Original listing</OpportunityListingLink>,
  );
  const opener = screen.getByRole("link", { name: "Original listing" });
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  await user.click(opener);

  const dialog = screen.getByRole("dialog", { name: "Listing preview" });
  const frame = within(dialog).getByTitle("Listing website preview");
  const relay = new URL(frame.getAttribute("src")!, "https://app.example.com");
  expect(relay.pathname).toBe("/api/listing-preview-frame");
  expect(relay.search).toBe("?host=preview.example.com");
  expect(decodeURIComponent(relay.hash.slice(1))).toBe(job.url);
  expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(within(dialog).getByText(job.description)).toBeVisible();
  expect(
    within(dialog).getByRole("link", { name: "Open in new tab" }),
  ).toHaveAttribute("href", job.url);

  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});

it.each([
  "https://127.0.0.1/job",
  "https://[::1]/job",
  "https://printer.local/job",
  "https://machine.net.ts.net/job",
  "https://preview.example.com:444/job",
])("uses the saved preview for %s", (url) => {
  render(
    <OpportunitySourcePreview
      job={job}
      kind="listing"
      url={url}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  expect(screen.getByText(job.description)).toBeVisible();
});

it("keeps the public showcase and company previews on recorded details", () => {
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "1");
  const { rerender } = render(
    <OpportunitySourcePreview
      job={job}
      kind="listing"
      url={job.url}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
  vi.stubEnv("NEXT_PUBLIC_EA_PUBLIC_PREVIEW", "0");
  rerender(
    <OpportunitySourcePreview
      job={job}
      kind="careers"
      url={job.url}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Company preview" })).toBeVisible();
  expect(screen.queryByTitle("Listing website preview")).toBeNull();
});
