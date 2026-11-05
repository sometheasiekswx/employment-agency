import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Profile, RankedJob, WorkspaceState } from "@/lib/models";
import { DiscoverPage } from "./discover-page";

const fixture = vi.hoisted(() => ({
  query: "",
  mobile: false,
  profileId: "profile-a",
  state: {} as WorkspaceState,
  client: { action: vi.fn() },
  run: vi.fn(),
  refresh: vi.fn(),
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
    refresh: fixture.refresh,
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
  fixture.client = { action: vi.fn().mockImplementation(async () => ranked()) };
  fixture.run.mockReset().mockResolvedValue({});
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  fixture.replace.mockReset().mockImplementation((href: string) => {
    fixture.query = new URL(href, "http://localhost").searchParams.toString();
  });
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

it("keeps unknown salary in the inspector without repeating it on cards", async () => {
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
  expect(screen.queryByText("Salary not listed")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(
    within(screen.getByRole("complementary")).getByText("Salary not listed"),
  ).toBeInTheDocument();
});

it("keeps advertised pay on cards and its complete basis in the inspector", async () => {
  fixture.state.jobs[0].salary = {
    min: 90000,
    max: 120000,
    currency: "CAD",
    period: "year",
    basis: "gross_base",
  };
  render(<DiscoverPage />);
  const open = await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  expect(
    within(open.closest("article")!).getByText("CAD 90k–120k / year"),
  ).toBeInTheDocument();
  fireEvent.click(open);
  expect(
    within(screen.getByRole("complementary")).getByText(
      "CAD 90,000–120,000 / year gross base",
    ),
  ).toBeInTheDocument();
});

it("shows completed matches immediately when returning to Discover without another request", async () => {
  const first = render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  first.unmount();
  fixture.client.action.mockClear();

  render(<DiscoverPage />);
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Assessing opportunities" }),
  ).not.toBeInTheDocument();
  await act(async () => {});
  expect(fixture.client.action).not.toHaveBeenCalled();
});

it("keeps Refresh matches effective after reusing a completed assessment", async () => {
  const first = render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  first.unmount();
  render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  fixture.client.action.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Refresh matches" }));
  await waitFor(() => expect(fixture.client.action).toHaveBeenCalledTimes(1));
});

it.each(["facts", "jobs", "profiles"] as const)(
  "reassesses changed %s when returning to Discover",
  async (input) => {
    const first = render(<DiscoverPage />);
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    });
    first.unmount();
    fixture.client.action.mockClear();
    if (input === "facts") fixture.state.facts[0].confirmed = false;
    if (input === "jobs") fixture.state.jobs[0].requirements = ["SQL"];
    if (input === "profiles") fixture.state.profiles[0].locations = ["Berlin"];
    render(<DiscoverPage />);
    await waitFor(() => expect(fixture.client.action).toHaveBeenCalledTimes(1));
  },
);

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
  expect(fixture.replace.mock.calls).toEqual([
    [
      "/discover/?opportunity=job-a&assessment_profile=profile-a",
      { scroll: false },
    ],
    [
      "/discover/?opportunity=job-b&assessment_profile=profile-a",
      { scroll: false },
    ],
    ["/discover/", { scroll: false }],
  ]);
});

it.each([false, true])(
  "keeps keyboard orientation at visual navigation boundaries (mobile: %s)",
  async (mobile) => {
    fixture.mobile = mobile;
    fixture.state.jobs.push({
      id: "job-c",
      title: "Platform Engineer",
      employer: "Example Platform",
      location: "Toronto",
    });
    const user = userEvent.setup();
    const { rerender } = render(<DiscoverPage />);
    const first = await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    });
    expect(
      Array.from(document.querySelectorAll(".discover-card-open")).map(
        (button) => button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Assess Cloud Engineer at Example Cloud",
      "Assess Platform Engineer at Example Platform",
      "Assess Backend Engineer at Example Studio",
    ]);
    await user.click(first);
    const inspector = screen.getByRole(mobile ? "dialog" : "complementary");
    const next = within(inspector).getByRole("button", {
      name: "Next opportunity",
    });
    const previous = within(inspector).getByRole("button", {
      name: "Previous opportunity",
    });
    next.focus();
    await user.keyboard("{Enter}");
    expect(
      within(inspector).getByRole("heading", { name: "Platform Engineer" }),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("2 of 3")).toBeInTheDocument();
    expect(next).toHaveFocus();
    await user.keyboard("{Enter}");
    const lastHeading = within(inspector).getByRole("heading", {
      name: "Backend Engineer",
    });
    expect(next).toBeDisabled();
    expect(lastHeading).toHaveFocus();
    expect(within(inspector).getByText("3 of 3")).toBeInTheDocument();
    previous.focus();
    await user.keyboard("{Enter}");
    expect(
      within(inspector).getByRole("heading", { name: "Platform Engineer" }),
    ).toBeInTheDocument();
    expect(previous).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(previous).toBeDisabled();
    expect(
      within(inspector).getByRole("heading", { name: "Cloud Engineer" }),
    ).toHaveFocus();
    const close = within(inspector).getByRole("button", {
      name: "Close opportunity details",
    });
    close.focus();
    fixture.state.applications = [...fixture.state.applications];
    rerender(<DiscoverPage />);
    expect(close).toHaveFocus();
  },
);

it("does not take focus when another control activates navigation into a boundary", async () => {
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  const close = screen.getByRole("button", {
    name: "Close opportunity details",
  });
  expect(close).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Next opportunity" }));
  expect(
    within(screen.getByRole("complementary")).getByRole("heading", {
      name: "Backend Engineer",
    }),
  ).toBeInTheDocument();
  expect(close).toHaveFocus();
});

it("restores the selected assessment and its focus context when returning to its route", async () => {
  fixture.query =
    "view=all&location=Berlin&opportunity=job-b&assessment_profile=profile-a";
  const { unmount } = render(<DiscoverPage />);
  const inspector = await screen.findByRole("complementary");
  expect(
    within(inspector).getByRole("heading", { name: "Backend Engineer" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Berlin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Close opportunity details" }),
  ).toHaveFocus();
  unmount();
  render(<DiscoverPage />);
  expect(await screen.findByRole("complementary")).toHaveAccessibleName(
    "Backend Engineer",
  );
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
  expect(fixture.query).toBe("view=all&location=Berlin");
});

it.each([
  "opportunity=missing-job&assessment_profile=profile-a",
  "opportunity=job-a&assessment_profile=profile-b",
  "location=Berlin&opportunity=job-a&assessment_profile=profile-a",
  "opportunity=job-a",
])(
  "ignores an invalid or out-of-context selected assessment: %s",
  async (query) => {
    fixture.query = query;
    render(<DiscoverPage />);
    await screen.findByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(fixture.run).not.toHaveBeenCalled();
  },
);

it("follows browser route changes and clears the assessment when filters change", async () => {
  fixture.query = "view=all&opportunity=job-a&assessment_profile=profile-a";
  const { rerender } = render(<DiscoverPage />);
  expect(await screen.findByRole("complementary")).toHaveAccessibleName(
    "Cloud Engineer",
  );
  fixture.query = "view=all&opportunity=job-b&assessment_profile=profile-a";
  rerender(<DiscoverPage />);
  expect(screen.getByRole("complementary")).toHaveAccessibleName(
    "Backend Engineer",
  );
  fireEvent.click(screen.getByRole("button", { name: "Berlin" }));
  await waitFor(() =>
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument(),
  );
  expect(fixture.query).toBe("view=all&location=Berlin");
});

it("restores a selected mobile assessment as a modal and returns focus to its role", async () => {
  fixture.mobile = true;
  fixture.query = "view=all&opportunity=job-b&assessment_profile=profile-a";
  render(<DiscoverPage />);
  const dialog = await screen.findByRole("dialog", {
    name: "Backend Engineer",
  });
  expect(dialog).toHaveAttribute("open");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Assess Backend Engineer at Example Studio",
      }),
    ).toHaveFocus(),
  );
  expect(fixture.query).toBe("view=all");
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
  fixture.state.jobs.push({
    id: "job-c",
    title: "Platform Engineer",
    employer: "Example Platform",
    location: "Berlin",
  });
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
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fixture.refresh).toHaveBeenCalledTimes(1);
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
