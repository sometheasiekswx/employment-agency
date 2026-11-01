import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Application } from "@/lib/models";
import { ApplicationsPage } from "./applications-page";

const fixture = vi.hoisted(() => ({
  query: "",
  applications: [] as Application[],
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(fixture.query),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: {
      applications: fixture.applications,
      jobs: [{ id: "job-a", location: "Toronto" }],
      _workspace: { preferred_locations: [] },
    },
  }),
}));
vi.mock("@/components/unsaved", () => ({
  useDraft: () => ({ canLeave: () => true }),
}));
vi.mock("./application-card", () => ({
  ApplicationCard: ({ app }: { app: Application }) => (
    <article aria-label={app.id}>{app.title}</article>
  ),
}));
vi.mock("./apply-for-me", () => ({ ApplyForMe: () => null }));
vi.mock("./document-editor", () => ({ DocumentEditor: () => null }));

const app = (
  id: string,
  status: Application["status"],
  day: number,
): Application => ({
  id,
  job_id: "job-a",
  title: "Business Analyst",
  employer: "Fictional Insurance",
  status,
  created_at: `2026-10-${day}T00:00:00Z`,
  comments: [],
});

beforeEach(() => {
  fixture.query = "";
  fixture.applications = [
    app("older-draft", "draft", 20),
    app("sent", "submitted", 21),
  ];
});

it("keeps older drafts out of Active when the job has a submitted snapshot", () => {
  render(<ApplicationsPage />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Active (0)" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Submitted (1)" }),
  ).toBeInTheDocument();
});

it("shows one submitted snapshot and preserves the same counts with earlier queues enabled", () => {
  fixture.query = "section=submitted&history=true";
  fixture.applications.push(app("post-submission-edit", "draft", 22));
  render(<ApplicationsPage />);
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "sent" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Active (0)" }),
  ).toBeInTheDocument();
});

it("shows the latest decision once instead of counting every version", () => {
  fixture.applications = [
    app("first", "draft", 20),
    app("second", "reviewed", 21),
    app("third", "rejected", 22),
  ];
  fixture.query = "section=rejected";
  render(<ApplicationsPage />);
  expect(screen.getByRole("article", { name: "third" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Active (0)" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Rejected (1)" }),
  ).toBeInTheDocument();
});
