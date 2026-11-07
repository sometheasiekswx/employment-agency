import { expect, it } from "vitest";
import {
  displayDate,
  known,
  safeUrl,
  splitList,
  compareDestinations,
  applicationHref,
  errorMessage,
  isConnectionError,
} from "./format";
import type { Application } from "./models";

it.each([
  "Failed to fetch",
  "Load failed",
  "NetworkError",
  "NetworkError when attempting to fetch resource.",
])("explains the known raw browser connection failure %s", (message) => {
  const error = new TypeError(message);
  expect(isConnectionError(error)).toBe(true);
  expect(errorMessage(error)).toBe(
    "Cannot connect to the app. Check your connection and that the app is running, then try again.",
  );
});

it.each([
  "Files changed; reload the editor",
  "Workspace is locked",
  "Failed to fetch employer profile: access was denied",
  "NetworkError: document manifest changed; review the latest version",
])("preserves the specific backend error %s", (message) => {
  const error = new Error(message);
  expect(isConnectionError(error)).toBe(false);
  expect(errorMessage(error)).toBe(message);
});

it("does not infer a connection failure from unrelated error values", () => {
  expect(isConnectionError(null)).toBe(false);
  expect(isConnectionError("Failed to fetch")).toBe(false);
  expect(errorMessage(undefined)).toBe(
    "The operation failed. Please try again.",
  );
});

it.each([
  ["draft", "active"],
  ["reviewed", "active"],
  ["submitted", "submitted"],
  ["rejected", "removed"],
] as const)(
  "opens %s application documents in Opportunities",
  (status, section) => {
    expect(
      applicationHref({ id: "application-1", status } as Application),
    ).toBe(
      `/discover/?view=applications&section=${section}&application=application-1&panel=documents`,
    );
  },
);

it("preserves archived version access and safely encodes application identifiers", () => {
  const href = applicationHref({
    id: "version / 1&2",
    status: "submitted",
    archived: true,
  } as Application);
  const url = new URL(href, "https://example.test");
  expect(url.pathname).toBe("/discover/");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    view: "applications",
    section: "submitted",
    application: "version / 1&2",
    panel: "documents",
    history: "true",
  });
});

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
