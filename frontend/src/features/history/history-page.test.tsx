import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Application, HistoryVersion } from "@/lib/models";
import { ApplicationVersions } from "@/features/applications/application-versions";
import { HistoryPage } from "./history-page";

const fixture = vi.hoisted(() => ({
  query: "",
  applications: [] as Application[],
  client: { hosted: false, preview: false, action: vi.fn() },
  run: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(fixture.query),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: {
      applications: fixture.applications,
      _workspace: { timezone: "UTC" },
    },
    client: fixture.client,
    run: fixture.run,
  }),
}));

const version = (
  id: string,
  company: string,
  job = "Software Engineer",
  city = "Toronto",
): HistoryVersion => ({
  id,
  company,
  job,
  city,
  label: id,
  generated_at: "2026-11-06",
  date_uncertain: false,
  source: "Fictional generated application",
  files: ["resume.pdf", "cover-letter.pdf"],
});

beforeEach(() => {
  fixture.query = "";
  fixture.applications = [];
  fixture.client.action
    .mockReset()
    .mockResolvedValue([
      version("original-version", "Fictional Systems"),
      version(
        "new-version",
        "Fictional Systems",
        "Software Engineer",
        "Berlin",
      ),
      version("other-employer", "Other Systems"),
      version("longer-role", "Fictional Systems", "Senior Software Engineer"),
    ]);
  fixture.run.mockReset().mockResolvedValue(undefined);
});

it("keeps unscoped history and its existing text and location filters", async () => {
  render(<HistoryPage />);
  await screen.findByText("original-version");
  expect(
    screen.getAllByText("Software Engineer", { selector: "h3" }),
  ).toHaveLength(3);
  expect(
    screen.getByRole("heading", { name: "Senior Software Engineer" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Selected application history" }),
  ).not.toBeInTheDocument();

  const user = userEvent.setup();
  await user.type(
    screen.getByRole("searchbox", { name: "Search history" }),
    "Other Systems",
  );
  expect(screen.getByText("other-employer")).toBeInTheDocument();
  expect(screen.queryByText("original-version")).not.toBeInTheDocument();
  await user.clear(screen.getByRole("searchbox", { name: "Search history" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Location" }),
    "Berlin",
  );
  expect(screen.getByText("new-version")).toBeInTheDocument();
  expect(screen.queryByText("other-employer")).not.toBeInTheDocument();
});

it("scopes the exact role and employer and exposes context and a clear link", async () => {
  fixture.query = new URLSearchParams({
    role: "Software Engineer",
    employer: "Fictional Systems",
    fixture: "kept",
  }).toString();
  const { rerender } = render(<HistoryPage />);
  await screen.findByText("original-version");
  expect(screen.getByText("new-version")).toBeInTheDocument();
  expect(screen.queryByText("other-employer")).not.toBeInTheDocument();
  expect(screen.queryByText("longer-role")).not.toBeInTheDocument();
  const context = screen.getByRole("region", {
    name: "Selected application history",
  });
  expect(context).toHaveTextContent("Software Engineer");
  expect(context).toHaveTextContent("Fictional Systems");
  expect(
    within(context).getByRole("link", { name: "Clear role filter" }),
  ).toHaveAttribute("href", "/history/?fixture=kept");

  fixture.query = "fixture=kept";
  rerender(<HistoryPage />);
  expect(screen.getByText("other-employer")).toBeInTheDocument();
  expect(screen.getByText("longer-role")).toBeInTheDocument();
  expect(fixture.client.action).toHaveBeenCalledExactlyOnceWith("history");
});

it("combines scoped history with search and preserves verified file and adoption operations", async () => {
  fixture.query = "role=Software+Engineer&employer=Fictional+Systems";
  fixture.run.mockResolvedValueOnce({
    id: "recovered-draft",
    job_id: "missing-listing",
    status: "draft",
  });
  render(<HistoryPage />);
  await screen.findByText("original-version");
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("searchbox", { name: "Search history" }),
    "original-version",
  );
  expect(screen.queryByText("new-version")).not.toBeInTheDocument();
  const preserved = screen.getByText("original-version").closest("details")!;
  await user.click(within(preserved).getByText("Preserved document version"));
  expect(screen.getByRole("link", { name: /^resume\.pdf$/ })).toHaveAttribute(
    "href",
    "/history/files/original-version/resume.pdf",
  );
  await user.click(
    screen.getByRole("button", {
      name: "Validate external edits as a new draft",
    }),
  );
  expect(fixture.run).toHaveBeenCalledExactlyOnceWith("history-adopt", {
    id: "original-version",
  });
  expect(await screen.findByText(/New draft saved/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Review the new draft" }),
  ).toHaveAttribute(
    "href",
    "/discover/?view=applications&section=active&application=recovered-draft&panel=documents",
  );
});

it("shows an empty scoped result without including a similarly named employer", async () => {
  fixture.query = "role=Software+Engineer&employer=Fictional";
  render(<HistoryPage />);
  expect(
    await screen.findByText("No versions match these filters."),
  ).toBeInTheDocument();
  expect(screen.queryByText("original-version")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Clear role filter" }),
  ).toHaveAttribute("href", "/history/");
});

it("identifies a generated version with the same number, status and date as Documents", async () => {
  const preserved = {
    ...version("preserved-files", "Fictional Systems"),
    label: "06-11-2026/12-30-00",
    generated_at: "2026-11-06T12:30:00Z",
  };
  const submitted: Application = {
    id: "sent",
    job_id: "job-1",
    title: preserved.job,
    employer: preserved.company,
    status: "submitted",
    created_at: preserved.generated_at,
    comments: [],
    folder: [
      "applications",
      preserved.city,
      preserved.company,
      preserved.job,
      preserved.label,
    ].join("/"),
  };
  fixture.applications = [
    {
      ...submitted,
      id: "earlier",
      status: "draft",
      created_at: "2026-11-01",
      folder:
        "applications/Toronto/Fictional Systems/Software Engineer/01-11-2026",
    },
    submitted,
  ];
  fixture.client.action.mockResolvedValue([preserved]);
  render(
    <>
      <ApplicationVersions application={submitted} onSelect={vi.fn()} />
      <HistoryPage />
    </>,
  );
  const title = await screen.findByText("Version 2 · Submitted", {
    selector: ".history-version-title",
  });
  const entry = title.closest("details")!;
  const date = within(entry).getByText("6 Nov 2026, 12:30 pm UTC", {
    selector: ".history-version-date",
  });
  expect(
    screen.getByRole("option", {
      name: `${title.textContent} · ${date.textContent}`,
    }),
  ).toHaveAttribute("value", submitted.id);
  expect(entry.querySelector("summary")).not.toHaveTextContent(preserved.label);
  await userEvent.setup().click(title);
  expect(within(entry).getByText("Storage label:")).toBeVisible();
  expect(within(entry).getByText(preserved.label)).toBeVisible();
});

it("keeps external storage labels searchable without inventing application decisions", async () => {
  render(<HistoryPage />);
  await screen.findByText("original-version");
  await userEvent
    .setup()
    .type(
      screen.getByRole("searchbox", { name: "Search history" }),
      "original-version",
    );
  const entry = screen.getByText("original-version").closest("details")!;
  expect(entry.querySelector("summary")).toHaveTextContent(
    "Preserved document version",
  );
  expect(entry.querySelector("summary")).not.toHaveTextContent(
    /Draft|Reviewed|Submitted|Rejected/,
  );
  await userEvent
    .setup()
    .click(within(entry).getByText("Preserved document version"));
  expect(
    within(entry).getByText(
      "Application status is not recorded for these preserved documents.",
    ),
  ).toBeVisible();
  expect(screen.queryByText("other-employer")).not.toBeInTheDocument();
});

it("shows all linked correction and recovery records without choosing one shared-file status", async () => {
  const preserved = {
    ...version("preserved-files", "Fictional Systems"),
    label: "06-11-2026",
    generated_at: "2026-11-06",
  };
  const submitted: Application = {
    id: "sent",
    job_id: "job-1",
    title: preserved.job,
    employer: preserved.company,
    status: "submitted",
    created_at: "2026-11-06",
    comments: [],
    folder: [
      "applications",
      preserved.city,
      preserved.company,
      preserved.job,
      preserved.label,
    ].join("/"),
    submission_correction: {
      at: "2026-11-07",
      reason: "Fictional correction",
      recovery_application_id: "recovered",
    },
  };
  fixture.applications = [
    submitted,
    {
      ...submitted,
      id: "recovered",
      status: "draft",
      created_at: "2026-11-07",
      submission_correction: undefined,
      submission_recovery: {
        original_id: submitted.id,
        at: "2026-11-07",
        reason: "Fictional correction",
      },
    },
  ];
  fixture.client.action.mockResolvedValue([preserved]);
  render(<HistoryPage />);
  const title = await screen.findByText("Shared document version");
  const entry = title.closest("details")!;
  expect(entry.querySelector("summary")).not.toHaveTextContent(
    /Submitted|Draft/,
  );
  await userEvent.setup().click(title);
  expect(
    within(entry).getByText(/Version 1 · Submitted · 6 Nov 2026/),
  ).toHaveTextContent("Submission record corrected");
  expect(
    within(entry).getByText(/Version 2 · Draft · 7 Nov 2026/),
  ).toHaveTextContent("Recovery record from a corrected submission");
});
