import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Application } from "@/lib/models";
import { ApplicationVersions } from "./application-versions";

const fixture = vi.hoisted(() => ({
  applications: [] as Application[],
  canLeave: vi.fn(() => true),
  navigate: vi.fn(),
}));

vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: {
      applications: fixture.applications,
      _workspace: { timezone: "UTC" },
    },
  }),
}));
vi.mock("@/components/unsaved", () => ({
  useDraft: () => ({ canLeave: fixture.canLeave }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
  }: {
    href: string;
    onNavigate: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        let blocked = false;
        onNavigate({ preventDefault: () => (blocked = true) });
        if (!blocked) fixture.navigate(href);
      }}
    >
      {children}
    </a>
  ),
}));

const application = (
  id: string,
  status: Application["status"],
  created_at?: string,
): Application => ({
  id,
  job_id: "job-1",
  title: "Software Engineer",
  employer: "Fictional Systems",
  status,
  created_at,
  comments: [],
});

beforeEach(() => {
  fixture.applications = [];
  fixture.canLeave.mockReset().mockReturnValue(true);
  fixture.navigate.mockReset();
});

it("lists every role version chronologically, including preserved drafts and archived versions", () => {
  const latest = application("new-draft", "draft", "2026-11-06");
  const submitted = application("sent", "submitted", "2026-10-30");
  const archived = {
    ...application("imported-draft", "draft", "2026-10-29"),
    archived: true,
  };
  const reviewed = application("reviewed", "reviewed", "2026-11-02");
  fixture.applications = [
    latest,
    { ...latest, id: "other-role", job_id: "job-2" },
    submitted,
    archived,
    reviewed,
  ];
  const originalOrder = fixture.applications.map(({ id }) => id);
  render(<ApplicationVersions application={submitted} onSelect={vi.fn()} />);

  expect(
    screen.getByRole("combobox", { name: "Document version" }),
  ).toHaveValue(submitted.id);
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual([
    "Version 1 · Draft · 29 Oct 2026",
    "Version 2 · Submitted · 30 Oct 2026",
    "Version 3 · Reviewed · 2 Nov 2026",
    "Version 4 · Draft · 6 Nov 2026",
  ]);
  expect(fixture.applications.map(({ id }) => id)).toEqual(originalOrder);
});

it("keeps numbering stable when creation dates are equal or missing", () => {
  fixture.applications = [
    application("first-undated", "draft"),
    application("second-undated", "rejected"),
    application("first-dated", "reviewed", "2026-11-02T00:00:00Z"),
    application("second-dated", "draft", "2026-11-02T00:00:00Z"),
  ];
  render(
    <ApplicationVersions
      application={fixture.applications[3]}
      onSelect={vi.fn()}
    />,
  );
  const options = screen.getAllByRole("option") as HTMLOptionElement[];
  expect(options.map(({ value }) => value)).toEqual([
    "first-undated",
    "second-undated",
    "first-dated",
    "second-dated",
  ]);
  expect(options[0]).toHaveTextContent("Version 1 · Draft · Date not recorded");
  expect(options[1]).toHaveTextContent(
    "Version 2 · Rejected · Date not recorded",
  );
});

it("returns the exact selected version and follows the parent selection", async () => {
  const original = application("original", "submitted", "2026-11-01");
  const later = application("later-draft", "draft", "2026-11-02");
  fixture.applications = [original, later];
  const onSelect = vi.fn();
  const { rerender } = render(
    <ApplicationVersions application={later} onSelect={onSelect} />,
  );
  await userEvent
    .setup()
    .selectOptions(
      screen.getByRole("combobox", { name: "Document version" }),
      original.id,
    );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(original);
  rerender(<ApplicationVersions application={original} onSelect={onSelect} />);
  expect(
    screen.getByRole("combobox", { name: "Document version" }),
  ).toHaveValue(original.id);
});

it("identifies a single current version while the refreshed workspace is pending", () => {
  const current = application("new-version", "draft", "2026-11-06");
  render(<ApplicationVersions application={current} onSelect={vi.fn()} />);
  expect(
    screen.getByRole("combobox", { name: "Document version" }),
  ).toHaveValue(current.id);
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(
    screen.getByText(/Submitted snapshots stay unchanged/),
  ).toHaveTextContent(
    "New drafts keep the original. Submitted snapshots stay unchanged.",
  );
});

it("guards navigation to the selected role and employer's history", async () => {
  render(
    <ApplicationVersions
      application={application("current", "draft")}
      onSelect={vi.fn()}
    />,
  );
  const link = screen.getByRole("link", { name: "View application history" });
  const href = "/history/?role=Software+Engineer&employer=Fictional+Systems";
  expect(link).toHaveAttribute("href", href);
  const user = userEvent.setup();
  fixture.canLeave.mockReturnValue(false);
  await user.click(link);
  expect(fixture.navigate).not.toHaveBeenCalled();
  fixture.canLeave.mockReturnValue(true);
  await user.click(link);
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith(href);
});

it("uses the preserved folder's exact history names when original labels contain path punctuation", () => {
  render(
    <ApplicationVersions
      application={{
        ...application("current", "draft"),
        title: "Cloud / Platform Engineer",
        employer: "Fictional: Systems",
        folder:
          "applications/Toronto/Fictional- Systems/Cloud - Platform Engineer/2026-11-06",
      }}
      onSelect={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("link", { name: "View application history" }),
  ).toHaveAttribute(
    "href",
    "/history/?role=Cloud+-+Platform+Engineer&employer=Fictional-+Systems",
  );
});
