import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { OpportunityListingLink } from "./opportunity-listing-link";

it("renders an HTTPS listing as a new-tab link with its accessible name", () => {
  const url = "https://jobs.example.com/roles/engineer?ref=saved";
  render(
    <OpportunityListingLink url={url} label="View listing for Test Engineer">
      View listing
    </OpportunityListingLink>,
  );
  const link = screen.getByRole("link", {
    name: "View listing for Test Engineer",
  });
  expect(link).toHaveAttribute("href", url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it.each([
  undefined,
  "http://jobs.example.com/roles/engineer",
  "javascript:void(0)",
])("omits the listing link for %s", (url) => {
  render(
    <OpportunityListingLink url={url}>Original listing</OpportunityListingLink>,
  );
  expect(screen.queryByRole("link")).toBeNull();
});
