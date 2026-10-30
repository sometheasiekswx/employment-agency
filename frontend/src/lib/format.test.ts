import { expect, it } from "vitest";
import {
  displayDate,
  known,
  safeUrl,
  splitList,
  compareDestinations,
} from "./format";

it("preserves approximate source dates and formats date-only values without timezone shifts", () => {
  expect(displayDate("about a week ago", "Australia/Melbourne")).toBe(
    "about a week ago",
  );
  expect(displayDate("2026-10-30", "America/Los_Angeles")).toContain(
    "30 Oct 2026",
  );
});
it("rejects executable and insecure listing URLs", () => {
  expect(safeUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeUrl("http://example.test")).toBeUndefined();
  expect(safeUrl("https://example.test/job")).toBe("https://example.test/job");
});
it("normalizes list inputs and keeps unknown metadata hidden", () => {
  expect(splitList("Python, Java\n React, ")).toEqual([
    "Python",
    "Java",
    "React",
  ]);
  expect(known("unknown")).toBe(false);
  expect(known("Phnom Penh")).toBe(true);
});
it("orders priority destinations before alphabetic fallback cities", () => {
  expect(
    ["Toronto", "Adelaide", "Melbourne"].sort((a, b) =>
      compareDestinations(a, b, ["Melbourne"]),
    ),
  ).toEqual(["Melbourne", "Adelaide", "Toronto"]);
});
