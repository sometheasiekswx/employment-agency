import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Profile, RankedJob, WorkspaceState } from "@/lib/models";
import { DiscoverPage } from "./discover-page";

const fixture = vi.hoisted(() => ({
  query: "",
  mobile: false,
  profileId: "profile-a",
  state: {} as WorkspaceState,
  client: { action: vi.fn() },
  run: vi.fn(),
  replace: vi.fn(),
  selectProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(fixture.query),
  useRouter: () => ({ replace: fixture.replace }),
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    state: fixture.state,
    client: fixture.client,
    run: fixture.run,
    profileId: fixture.profileId,
    selectProfile: fixture.selectProfile,
  }),
}));

const profile = (id = "profile-a"): Profile => ({
  id,
  name: "Engineering search",
  roles: ["Engineer"],
  locations: ["Toronto", "Berlin"],
  seniority: [],
  arrangements: [],
  hard: ["roles"],
  exclude: [],
  work_rights: [],
  needs_sponsorship: false,
  minimum: 0,
  currency: "CAD",
  period: "year",
  template: "plain",
  include_stretch: true,
  include_unknown: true,
});
const ranked = (): RankedJob[] =>
  fixture.state.jobs.map((job) => ({
    job,
    match: {
      eligible_for_preparation: true,
      hard_conflicts: [],
      unknowns: ["Work rights need confirmation"],
      gaps: ["Kubernetes"],
      evidence: [
        {
          requirement: "Python",
          fact_ids: ["python"],
          assessment: "Related text; verify full requirement",
        },
        { requirement: "Kubernetes", fact_ids: [] },
      ],
      preferences: [],
      salary_expectation: {},
    },
  }));

beforeEach(() => {
  fixture.query = "";
  fixture.mobile = false;
  fixture.profileId = "profile-a";
  fixture.state = {
    identity: {},
    facts: [
      { id: "python", text: "Built Python applications", confirmed: true },
    ],
    profiles: [profile(), profile("profile-b")],
    jobs: [
      {
        id: "job-a",
        title: "Cloud Engineer",
        employer: "Example Cloud",
        location: "Toronto",
        work_arrangement: "Hybrid",
        salary: { min: 0, max: 0 },
        url: "https://example.com/jobs/cloud",
        saved: false,
      },
      {
        id: "job-b",
        title: "Backend Engineer",
        employer: "Example Studio",
        location: "Berlin",
        saved: false,
      },
    ],
    sources: [],
    runs: [],
    applications: [],
    consents: {},
    _workspace: {
      path: "/fictional-workspace",
      label: "Fictional",
      master: "master.txt",
      master_template: false,
      timezone: "UTC",
      preferred_locations: [],
      setup_complete: true,
    },
    _master: { exists: false, changed: false, path: "master.txt" },
  };
  fixture.client.action.mockReset().mockImplementation(async () => ranked());
  fixture.run.mockReset().mockResolvedValue({});
  fixture.replace.mockReset();
  fixture.selectProfile.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: fixture.mobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

it("loads a read-only profile assessment and keeps job locations and unknown salaries visible", async () => {
  render(<DiscoverPage />);
  expect(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  expect(fixture.client.action).toHaveBeenCalledWith("rank", {
    profile_id: "profile-a",
  });
  expect(fixture.run).not.toHaveBeenCalled();
  expect(
    screen.getByRole("region", { name: "Toronto opportunities" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Salary not listed")).toHaveLength(2);
});

it("cycles across locations in place and restores focus to the current role when closed", async () => {
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next opportunity" }));
  expect(
    within(screen.getByRole("complementary")).getByRole("heading", {
      name: "Backend Engineer",
    }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Assess Backend Engineer at Example Studio",
      }),
    ).toHaveFocus(),
  );
  expect(fixture.replace).not.toHaveBeenCalled();
});

it("resizes the inspector to remaining viewport space when preceding content or viewport height changes", async () => {
  let top = 300;
  let notifyResize: () => void = () => {};
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(
        0,
        this.classList.contains("discover-layout") ? top : 0,
        100,
        100,
      );
    },
  );
  const { container } = render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  const layout = container.querySelector<HTMLElement>(".discover-layout")!;
  expect(layout.style.getPropertyValue("--discover-available-height")).toBe(
    "452px",
  );
  top = 450;
  act(() => notifyResize());
  expect(layout.style.getPropertyValue("--discover-available-height")).toBe(
    "302px",
  );
  vi.stubGlobal("innerHeight", 600);
  fireEvent.resize(window);
  expect(layout.style.getPropertyValue("--discover-available-height")).toBe(
    "134px",
  );
});

it("links to the exact submitted version and never prepares another application for that job", async () => {
  fixture.state.applications = [
    {
      id: "sent",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "submitted",
      created_at: "2026-10-21",
      comments: [],
    },
    {
      id: "later-draft",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      created_at: "2026-10-22",
      comments: [],
    },
  ];
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(screen.getByRole("link", { name: "View submission" })).toHaveAttribute(
    "href",
    "/?section=submitted&application=sent",
  );
  expect(
    screen.queryByRole("button", { name: "Prepare draft" }),
  ).not.toBeInTheDocument();
});

it("distinguishes an earlier submission record from a preserved local draft", async () => {
  fixture.query = "view=all";
  fixture.state.jobs[0].prior_application = "submitted";
  fixture.state.applications = [
    {
      id: "separate-draft",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      comments: [],
    },
  ];
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(
    screen.getByRole("link", { name: "Review preserved draft" }),
  ).toHaveAttribute("href", "/?section=active&application=separate-draft");
  expect(
    screen.queryByRole("link", { name: "View submission" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/keeps its exact document snapshot/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Prepare draft" }),
  ).not.toBeInTheDocument();
});

it("consumes document focus once, leaving later refreshes and role navigation in control", async () => {
  const app = {
    id: "existing-b",
    job_id: "job-b",
    title: "Backend Engineer",
    employer: "Example Studio",
    status: "draft" as const,
    comments: [],
  };
  fixture.state.applications = [app];
  fixture.run.mockImplementation(async () => {
    fixture.state.applications = [
      ...fixture.state.applications,
      { ...app, id: "new-a", job_id: "job-a" },
    ];
    return fixture.state.applications[1];
  });
  const { rerender } = render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare draft" }));
  await waitFor(() => expect(fixture.state.applications).toHaveLength(2));
  rerender(<DiscoverPage />);
  const documents = await screen.findByRole("link", {
    name: "Review documents",
  });
  await waitFor(() => expect(documents).toHaveFocus());
  const next = screen.getByRole("button", { name: "Next opportunity" });
  next.focus();
  fixture.state.applications = fixture.state.applications.map((record) => ({
    ...record,
  }));
  rerender(<DiscoverPage />);
  expect(next).toHaveFocus();
  fireEvent.click(next);
  expect(next).toHaveFocus();
  expect(
    screen.getByRole("link", { name: "Review documents" }),
  ).toHaveAttribute("href", "/?section=active&application=existing-b");
});

it("prepares a local draft only after an explicit click", async () => {
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare draft" }));
  await waitFor(() =>
    expect(fixture.run).toHaveBeenCalledWith(
      "local-package",
      { profile_id: "profile-a", job_id: "job-a" },
      expect.any(String),
    ),
  );
});

it("keeps an unsave failure visible after optimistic removal from Saved and restores the saved role", async () => {
  fixture.query = "view=saved";
  fixture.state.jobs[0].saved = true;
  let reject: (reason: Error) => void = () => {};
  fixture.run.mockImplementationOnce(
    () =>
      new Promise((_resolve, failure) => {
        reject = failure;
      }),
  );
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(
    within(screen.getByRole("complementary")).getByRole("button", {
      name: "Unsave Cloud Engineer",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Assess Cloud Engineer at Example Cloud",
      }),
    ).not.toBeInTheDocument(),
  );
  reject(new Error("The workspace could not save your change."));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The workspace could not save your change.",
  );
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Unsave Cloud Engineer" })[0],
  ).toHaveAttribute("aria-pressed", "true");
});

it("uses a native mobile dialog, supports expansion and restores focus after cancellation", async () => {
  fixture.mobile = true;
  render(<DiscoverPage />);
  const opener = await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Cloud Engineer" });
  expect(dialog).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
  expect(
    screen.getByRole("button", { name: "Collapse details" }),
  ).toHaveAttribute("aria-expanded", "true");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(opener).toHaveFocus());
});

it("announces and focuses mobile save failures inside the active modal", async () => {
  fixture.mobile = true;
  fixture.run.mockRejectedValueOnce(new Error("Saving is unavailable."));
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  const dialog = screen.getByRole("dialog", { name: "Cloud Engineer" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save Cloud Engineer" }),
  );
  const alert = await within(dialog).findByRole("alert");
  expect(alert).toHaveTextContent("Saving is unavailable.");
  await waitFor(() => expect(alert).toHaveFocus());
});

it("does not silently reopen the previous profile's selected job", async () => {
  const { rerender } = render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fixture.profileId = "profile-b";
  rerender(<DiscoverPage />);
  await waitFor(() =>
    expect(fixture.client.action).toHaveBeenCalledWith("rank", {
      profile_id: "profile-b",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("ignores an assessment that returns after a different profile was selected", async () => {
  const oldRows = ranked().map((row) => ({
    ...row,
    job: { ...row.job, title: "Outdated profile result" },
  }));
  let resolveOld: (rows: RankedJob[]) => void = () => {};
  fixture.client.action
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockImplementationOnce(async () => ranked());
  const { rerender } = render(<DiscoverPage />);
  fixture.profileId = "profile-b";
  rerender(<DiscoverPage />);
  expect(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  await act(async () => {
    resolveOld(oldRows);
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Assess Cloud Engineer at Example Cloud",
      }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: /Outdated profile result/ }),
  ).not.toBeInTheDocument();
});

it("offers a retry after ranking fails and requires a profile before any request", async () => {
  fixture.client.action.mockRejectedValueOnce(
    new Error("Assessment unavailable"),
  );
  const { unmount } = render(<DiscoverPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Assessment unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry assessment" }));
  expect(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  unmount();
  fixture.state.profiles = [];
  fixture.profileId = "";
  fixture.client.action.mockClear();
  render(<DiscoverPage />);
  expect(
    screen.getByRole("link", { name: "Create a search profile" }),
  ).toBeInTheDocument();
  expect(fixture.client.action).not.toHaveBeenCalled();
});
