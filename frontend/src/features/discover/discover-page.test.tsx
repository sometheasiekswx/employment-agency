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
import { Form } from "@/components/controls";
import { DraftProvider, useDraft } from "@/components/unsaved";
import type {
  Profile,
  RankedJob,
  RequestData,
  WorkspaceState,
} from "@/lib/models";
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
  back: vi.fn(),
  selectProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(fixture.query),
  useRouter: () => ({
    replace: fixture.replace,
    back: fixture.back,
  }),
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
  fixture.back.mockReset();
  for (const method of ["pushState", "replaceState"] as const)
    vi.spyOn(window.history, method).mockImplementation(
      (_state, _unused, href) => {
        if (!href) return;
        fixture.query = new URL(
          String(href),
          "http://localhost",
        ).searchParams.toString();
      },
    );
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

it("filters while typing without ranking again or fetching a new route, then clears without losing focus", async () => {
  fixture.mobile = true;
  fixture.query = "view=all";
  render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  const input = screen.getByRole("searchbox", { name: "Filter roles" });
  input.focus();
  fireEvent.change(input, { target: { value: "Backend" } });
  expect(input).toHaveFocus();
  expect(
    screen.queryByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).toBeInTheDocument();
  expect(new URLSearchParams(fixture.query).get("q")).toBe("Backend");
  expect(new URLSearchParams(fixture.query).get("view")).toBe("jobs");
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(fixture.client.action).toHaveBeenCalledTimes(1);
  fireEvent.submit(
    screen.getByRole("search", { name: "Filter opportunities" }),
  );
  expect(fixture.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input).toHaveFocus();
  expect(input).toHaveValue("");
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  expect(new URLSearchParams(fixture.query).has("q")).toBe(false);
});

it("saves a quick confirmation as career evidence from the listing details", async () => {
  fixture.state.jobs[0].requirements = ["Kubernetes"];
  const user = userEvent.setup();
  render(<DiscoverPage />);
  await user.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "I have this skill: Kubernetes" }),
  );
  expect(fixture.run).toHaveBeenCalledExactlyOnceWith(
    "requirement-evidence",
    { job_id: "job-a", requirement: "Kubernetes", save_skill: true },
    "Skill saved to career evidence.",
  );
});

it("preserves drafts across panels and asks before leaving the role", async () => {
  fixture.state.jobs[0].requirements = ["Kubernetes"];
  fixture.query =
    "view=all&opportunity=job-a&assessment_profile=profile-a&panel=overview";
  fixture.state.applications = [
    {
      id: "app-a",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      comments: [],
    },
  ];
  const user = userEvent.setup();
  render(
    <DraftProvider>
      <DiscoverPage />
    </DraftProvider>,
  );
  const inspector = within(await screen.findByRole("dialog"));
  await user.click(
    inspector.getByRole("button", { name: "Add evidence for Kubernetes" }),
  );
  const example = inspector.getByRole("textbox", {
    name: "Supporting example for Kubernetes",
  });
  await user.type(example, "Worked on a cluster rollout.");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await user.click(inspector.getByRole("button", { name: "Documents" }));
    expect(new URLSearchParams(fixture.query).get("panel")).toBe("files");
    expect(example).not.toBeVisible();
    await user.click(inspector.getByRole("button", { name: "Activity" }));
    const comment = inspector.getByRole("textbox", { name: "Comments" });
    await user.type(comment, "Review in progress.");
    await user.click(inspector.getByRole("button", { name: "Overview" }));
    expect(example).toHaveValue("Worked on a cluster rollout.");
    expect(example).toBeVisible();
    await user.click(inspector.getByRole("button", { name: "Activity" }));
    expect(comment).toHaveValue("Review in progress.");
    expect(comment).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    await user.click(
      inspector.getByRole("button", { name: "Next opportunity" }),
    );
    await user.click(
      inspector.getByRole("button", { name: "Close opportunity details" }),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(new URLSearchParams(fixture.query).get("opportunity")).toBe("job-a");
    expect(comment).toHaveValue("Review in progress.");
  } finally {
    confirm.mockRestore();
  }
});

it("keeps profile selection inside Filters while leaving the result count in the workspace", async () => {
  fixture.mobile = true;
  const view = render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  const filters = view.container.querySelector(".discover-filters")!;
  const select = screen.getByRole("combobox", {
    name: "Search profile",
    hidden: true,
  });
  expect(select.closest("details")).toBe(filters);
  expect(select).not.toBeVisible();
  expect(view.container.querySelector(".discover-summary select")).toBeNull();
  expect(screen.getByText("2 roles · 2 companies")).toBeVisible();
  await userEvent.click(within(filters as HTMLElement).getByText("Filters"));
  expect(select).toBeVisible();
  await userEvent.selectOptions(select, "profile-b");
  expect(fixture.selectProfile).toHaveBeenCalledWith("profile-b");
});

it("retains the selected profile and role when a dirty review cancels a profile change in Filters", async () => {
  function ReviewDraft() {
    const { setDirty } = useDraft();
    return <button onClick={() => setDirty(true)}>Keep review draft</button>;
  }
  fixture.query =
    "view=all&q=Cloud&location=Toronto&opportunity=job-a&assessment_profile=profile-a";
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const view = render(
    <DraftProvider>
      <ReviewDraft />
      <DiscoverPage />
    </DraftProvider>,
  );
  await screen.findByRole("dialog");
  await userEvent.click(
    screen.getByRole("button", { name: "Keep review draft" }),
  );
  const filters = view.container.querySelector(".discover-filters")!;
  await userEvent.click(within(filters as HTMLElement).getByText("Filters"));
  const select = screen.getByRole("combobox", { name: "Search profile" });
  await userEvent.selectOptions(select, "profile-b");
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(select).toHaveValue("profile-a");
  expect(fixture.selectProfile).not.toHaveBeenCalled();
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(new URLSearchParams(fixture.query).get("opportunity")).toBe("job-a");

  confirm.mockReturnValue(true);
  await userEvent.selectOptions(select, "profile-b");
  expect(fixture.selectProfile).toHaveBeenCalledWith("profile-b");
  const next = new URLSearchParams(fixture.query);
  expect(next.has("opportunity")).toBe(false);
  expect(next.get("q")).toBe("Cloud");
  expect(next.get("location")).toBe("Toronto");
  expect(next.get("view")).toBe("jobs");
});

it("protects a dirty form when removal is declined and confirms once before removing the selected role", async () => {
  fixture.query = "view=all&opportunity=job-a&assessment_profile=profile-a";
  fixture.client.action.mockImplementation(
    async (action: string, data: RequestData) => {
      if (action === "rank") return ranked();
      if (action === "remove-job")
        return {
          id: data.id,
          removals: [
            { id: data.removal_id, at: "2026-11-07T01:00:00Z", reason: "" },
          ],
        };
      throw new Error(`Unexpected operation: ${action}`);
    },
  );
  const save = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(
    <DraftProvider>
      <Form onSave={save}>
        <label>
          Pending review note
          <input name="review-note" />
        </label>
      </Form>
      <DiscoverPage />
    </DraftProvider>,
  );
  const inspector = await screen.findByRole("dialog", {
    name: "Cloud Engineer",
  });
  await user.type(
    screen.getByLabelText("Pending review note"),
    "Unfinished review text",
  );
  const remove = within(inspector).getByRole("button", {
    name: "Remove Cloud Engineer",
  });
  await user.click(remove);
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved changes?");
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(fixture.query).toBe(
    "view=all&opportunity=job-a&assessment_profile=profile-a",
  );
  expect(fixture.client.action).toHaveBeenCalledExactlyOnceWith("rank", {
    profile_id: "profile-a",
  });
  expect(inspector).toHaveAccessibleName("Cloud Engineer");
  expect(screen.getByLabelText("Pending review note")).toHaveValue(
    "Unfinished review text",
  );
  expect(save).not.toHaveBeenCalled();

  confirm.mockClear().mockReturnValue(true);
  await user.click(remove);
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Backend Engineer");
    expect(fixture.client.action).toHaveBeenCalledWith("remove-job", {
      id: "job-a",
      removal_id: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
  });
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved changes?");
  expect(
    fixture.client.action.mock.calls.filter(
      ([action]) => action === "remove-job",
    ),
  ).toHaveLength(1);
  expect(fixture.replace).toHaveBeenCalledExactlyOnceWith(
    "/discover/?view=jobs&opportunity=job-b&assessment_profile=profile-a",
    { scroll: false },
  );
  expect(
    screen.queryByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).toBeInTheDocument();
});

it("shows static card skeletons only while a real initial ranking request is pending", async () => {
  let finish: (rows: RankedJob[]) => void = () => {};
  fixture.client.action.mockImplementation(
    () =>
      new Promise<RankedJob[]>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<DiscoverPage />);
  expect(
    view.container.querySelectorAll(".discover-skeleton-card"),
  ).toHaveLength(6);
  expect(screen.getByText("Loading matches…")).toHaveAttribute(
    "role",
    "status",
  );
  expect(
    screen.queryByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).not.toBeInTheDocument();
  await act(async () => finish(ranked()));
  expect(
    view.container.querySelector(".discover-skeleton-board"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
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
    screen.getByRole("region", { name: "Example Cloud opportunities" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Salary not listed")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(
    within(screen.getByRole("dialog")).getByText("Salary not listed"),
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
    within(screen.getByRole("dialog")).getByText(
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
  const { rerender } = render(<DiscoverPage />);
  fixture.back.mockImplementation(() => {
    fixture.query = "";
    rerender(<DiscoverPage />);
  });
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next opportunity" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("heading", {
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
  expect(window.history.pushState).toHaveBeenCalledExactlyOnceWith(
    { employmentAgencyShortlistInspector: true },
    "",
    "/discover/?opportunity=job-a&assessment_profile=profile-a",
  );
  expect(fixture.replace.mock.calls).toEqual([
    [
      "/discover/?opportunity=job-b&assessment_profile=profile-a",
      { scroll: false },
    ],
  ]);
  expect(fixture.back).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "keeps keyboard orientation at visual navigation boundaries (mobile: %s)",
  async (mobile) => {
    fixture.mobile = mobile;
    fixture.state.jobs.push({
      id: "job-c",
      title: "Platform Engineer",
      employer: "Example Cloud",
      location: "Singapore",
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
      "Assess Platform Engineer at Example Cloud",
      "Assess Backend Engineer at Example Studio",
    ]);
    await user.click(first);
    const inspector = screen.getByRole("dialog");
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
    within(screen.getByRole("dialog")).getByRole("heading", {
      name: "Backend Engineer",
    }),
  ).toBeInTheDocument();
  expect(close).toHaveFocus();
});

it("restores the selected assessment and its focus context when returning to its route", async () => {
  fixture.query =
    "view=all&location=Berlin&opportunity=job-b&assessment_profile=profile-a";
  const { unmount } = render(<DiscoverPage />);
  const inspector = await screen.findByRole("dialog");
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
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
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
  expect(fixture.query).toBe("view=jobs&location=Berlin");
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fixture.run).not.toHaveBeenCalled();
  },
);

it("follows browser route changes and clears the assessment when filters change", async () => {
  fixture.query = "view=all&opportunity=job-a&assessment_profile=profile-a";
  const { rerender } = render(<DiscoverPage />);
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
    "Cloud Engineer",
  );
  fixture.query = "view=all&opportunity=job-b&assessment_profile=profile-a";
  rerender(<DiscoverPage />);
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Backend Engineer");
  fireEvent.click(screen.getByRole("button", { name: "Berlin" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(fixture.query).toBe("view=jobs&location=Berlin");
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
  expect(fixture.query).toBe("view=jobs");
});

it.each(["recommended", "all", "saved"])(
  "moves recorded submissions and tagged listings out of %s",
  async (view) => {
    fixture.query = `view=${view}`;
    fixture.state.jobs = fixture.state.jobs.map((job) => ({
      ...job,
      saved: view === "saved",
    }));
    fixture.state.applications = [
      {
        id: "app-a",
        job_id: "job-a",
        title: "Cloud Engineer",
        employer: "Example Cloud",
        status: "draft",
        comments: [],
      },
    ];
    const cloud = "Assess Cloud Engineer at Example Cloud";
    const backend = "Assess Backend Engineer at Example Studio";
    const { rerender } = render(<DiscoverPage />);
    await screen.findByRole("button", { name: cloud });
    expect(screen.getByRole("button", { name: backend })).toBeVisible();

    fixture.state = {
      ...fixture.state,
      jobs: fixture.state.jobs.map((job) =>
        job.id === "job-b" ? { ...job, prior_application: "submitted" } : job,
      ),
      applications: [{ ...fixture.state.applications[0], status: "submitted" }],
    };
    rerender(<DiscoverPage />);
    expect(
      screen.queryByRole("button", { name: cloud }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: backend }),
    ).not.toBeInTheDocument();

    fixture.query = "view=applications&section=submitted";
    rerender(<DiscoverPage />);
    expect(screen.getByRole("button", { name: "Submitted 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: cloud })).toBeVisible();
    const listing = screen.getByRole("button", { name: backend });
    expect(listing.closest("article")).toHaveTextContent("Submission recorded");
  },
);

it("links to the exact submitted version and never prepares another application for that job", async () => {
  fixture.query = "view=applications&section=submitted";
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
  const role = within(screen.getByRole("dialog"));
  expect(role.getByRole("button", { name: "CV" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    role.getByRole("region", { name: "CV" }).closest("[data-application-id]"),
  ).toHaveAttribute("data-application-id", "sent");
  expect(role.getByRole("link", { name: "View job listing" })).toHaveAttribute(
    "href",
    fixture.state.jobs[0].url,
  );
  expect(
    screen.queryByRole("button", { name: "Prepare application" }),
  ).not.toBeInTheDocument();
});

it("distinguishes an earlier submission record from a preserved local draft", async () => {
  fixture.query = "view=applications&section=active";
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
  const { rerender } = render(<DiscoverPage />);
  expect(screen.getByRole("button", { name: "Active 0" })).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Submitted 1" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(screen.getByText("Submitted document version unknown.")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "CV" }).closest("[data-application-id]"),
  ).toHaveAttribute("data-application-id", "separate-draft");
  expect(
    screen.queryByRole("link", { name: "View submission" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/keeps its exact document snapshot/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Prepare application" }),
  ).not.toBeInTheDocument();

  fixture.query =
    "view=applications&section=active&application=separate-draft&panel=documents";
  rerender(<DiscoverPage />);
  expect(screen.getByRole("button", { name: "Submitted 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation !== "local-package") return ranked();
    fixture.state.applications = [
      ...fixture.state.applications,
      { ...app, id: "new-a", job_id: "job-a" },
    ];
    return { application: fixture.state.applications[1] };
  });
  const { rerender } = render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare application" }));
  await waitFor(() => expect(fixture.state.applications).toHaveLength(2));
  rerender(<DiscoverPage />);
  const cv = await screen.findByRole("heading", { name: "CV" });
  await waitFor(() => expect(cv).toHaveFocus());
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
    screen.getByRole("region", { name: "CV" }).closest("[data-application-id]"),
  ).toHaveAttribute("data-application-id", "existing-b");
});

it("prepares a local draft only after an explicit click", async () => {
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(fixture.client.action).not.toHaveBeenCalledWith(
    "local-package",
    expect.anything(),
  );
  fixture.client.action.mockResolvedValueOnce({
    id: "explicit-version",
    job_id: "job-a",
    title: "Cloud Engineer",
    employer: "Example Cloud",
    status: "draft",
    comments: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare application" }));
  await waitFor(() =>
    expect(fixture.client.action).toHaveBeenCalledWith("local-package", {
      profile_id: "profile-a",
      job_id: "job-a",
    }),
  );
  expect(await screen.findByRole("heading", { name: "CV" })).toHaveFocus();
  expect(new URLSearchParams(fixture.query).get("application")).toBe(
    "explicit-version",
  );
});

it.each(["recommended", "all"])(
  "keeps the last selected role open when Apply later moves it out of %s",
  async (view) => {
    fixture.query = `view=${view}&q=Cloud`;
    fixture.run.mockImplementationOnce(async () => {
      fixture.state.jobs = fixture.state.jobs.map((job) =>
        job.id === "job-a" ? { ...job, saved: true } : job,
      );
    });
    render(<DiscoverPage />);
    const assess = { name: "Assess Cloud Engineer at Example Cloud" };
    fireEvent.click(await screen.findByRole("button", assess));
    const inspector = screen.getByRole("dialog");
    fireEvent.click(
      within(inspector).getByRole("button", { name: "Apply later" }),
    );
    await waitFor(() =>
      expect(
        within(inspector).getByRole("button", {
          name: "Remove from To apply",
        }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole("button", assess)).not.toBeInTheDocument();
    expect(
      within(inspector).getByRole("heading", { name: "Cloud Engineer" }),
    ).toBeVisible();
    expect(new URLSearchParams(fixture.query).get("view")).toBe("jobs");
    fireEvent.click(screen.getByRole("button", { name: "To apply" }));
    expect(await screen.findByRole("button", assess)).toBeVisible();
  },
);

it("opens To apply for an earlier saved-status filter URL", async () => {
  fixture.query = "view=all&status=saved";
  fixture.state.jobs[0].saved = true;
  render(<DiscoverPage />);
  expect(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "To apply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.queryByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).not.toBeInTheDocument();
});

it("links to the recorded careers page directly from the mobile role details", async () => {
  const careersUrl = "https://company.example.com/team/careers";
  fixture.mobile = true;
  fixture.state.jobs[0].careers_url = careersUrl;
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  const company = within(
    screen.getByRole("dialog", { name: "Cloud Engineer" }),
  ).getByRole("link", { name: "Example Cloud" });
  expect(company).toHaveAttribute("href", careersUrl);
  expect(company).toHaveAttribute("target", "_blank");
  expect(company).toHaveAttribute("rel", "noopener noreferrer");
  expect(fireEvent.click(company)).toBe(true);
  expect(screen.getByRole("dialog", { name: "Cloud Engineer" })).toBeVisible();
});

it("leaves an unnamed employer without a link", async () => {
  fixture.state.jobs[0].employer = "";
  render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Assess Cloud Engineer/ }),
  );
  const inspector = within(screen.getByRole("dialog"));
  expect(inspector.queryByRole("link", { name: "" })).not.toBeInTheDocument();
  expect(inspector.getByRole("link", { name: "Cloud Engineer" })).toBeVisible();
});

it("keeps a failed removal visible and restores the role to To apply", async () => {
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
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Remove from To apply",
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
    screen.getByRole("button", {
      name: "Remove from To apply · Cloud Engineer",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("guards an unfinished Activity comment before removing the selected role from To apply", async () => {
  fixture.query = "view=to-apply";
  fixture.state.jobs[0].saved = true;
  fixture.state.applications = [
    {
      id: "draft-a",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      comments: [],
    },
  ];
  fixture.run.mockImplementation(async () => {
    fixture.state.jobs[0].saved = false;
  });
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DraftProvider>
      <DiscoverPage />
    </DraftProvider>,
  );
  await user.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  const inspector = within(screen.getByRole("dialog"));
  await user.click(inspector.getByRole("button", { name: "Activity" }));
  const comment = inspector.getByRole("textbox", { name: "Comments" });
  await user.type(comment, "An unfinished note");
  const remove = inspector.getByRole("button", {
    name: "Remove from To apply",
  });
  await user.click(remove);
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved changes?");
  expect(fixture.run).not.toHaveBeenCalled();
  expect(comment).toHaveValue("An unfinished note");
  confirm.mockClear().mockReturnValue(true);
  await user.click(remove);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved changes?");
  expect(fixture.run).toHaveBeenCalledExactlyOnceWith(
    "save-job",
    { id: "job-a", saved: false },
    "Role removed from To apply.",
  );
  confirm.mockRestore();
});

it("uses a native mobile dialog, supports expansion and restores focus after cancellation", async () => {
  fixture.mobile = true;
  const view = render(<DiscoverPage />);
  const opener = await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  fireEvent.click(opener);
  expect(window.history.pushState).toHaveBeenCalledOnce();
  const dialog = screen.getByRole("dialog", { name: "Cloud Engineer" });
  expect(dialog).toHaveAttribute("open");
  fireEvent.click(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  );
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "true");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(fixture.back).toHaveBeenCalledOnce();
  fixture.query = "";
  view.rerender(<DiscoverPage />);
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
  fireEvent.click(within(dialog).getByRole("button", { name: "Apply later" }));
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
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

it("keeps Jobs usable after ranking fails or when there is no profile", async () => {
  fixture.client.action.mockRejectedValueOnce(
    new Error("Assessment unavailable"),
  );
  const { unmount } = render(<DiscoverPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Assessment unavailable",
  );
  expect(screen.getByText("Matches unavailable")).toHaveAttribute(
    "role",
    "status",
  );
  expect(screen.queryByText("0 roles · 0 companies")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Applications" })).toBeEnabled();
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry assessment" }));
  await waitFor(() => {
    expect(fixture.client.action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Assess Cloud Engineer at Example Cloud",
      }),
    ).toBeInTheDocument();
  });
  expect(screen.queryByText("Matches unavailable")).not.toBeInTheDocument();
  expect(fixture.refresh).toHaveBeenCalledTimes(1);
  unmount();
  fixture.state.profiles = [];
  fixture.profileId = "";
  fixture.client.action.mockClear();
  render(<DiscoverPage />);
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeInTheDocument();
  expect(fixture.client.action).not.toHaveBeenCalled();
});

it("opens the Submitted stage when filtering discovery for submitted roles", async () => {
  render(<DiscoverPage />);
  await screen.findByRole("button", {
    name: "Assess Cloud Engineer at Example Cloud",
  });
  const status = screen.getByRole("combobox", { name: "Application status" });
  expect(
    within(status).queryByRole("option", { name: "Applications" }),
  ).toBeNull();
  await userEvent.selectOptions(status, "submitted");
  const route = new URLSearchParams(fixture.query);
  expect(route.get("view")).toBe("applications");
  expect(route.get("section")).toBe("submitted");
  expect(route.get("status")).toBe("submitted");
});

it("opens listing-only submissions from an earlier submitted-status URL", () => {
  fixture.query = "view=all&status=submitted";
  fixture.state.jobs[0].prior_application = "submitted";
  render(<DiscoverPage />);
  expect(screen.getByRole("button", { name: "Submitted 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeVisible();
});

it("keeps search and location across views and can clear a filtered Submitted queue without leaving it", async () => {
  fixture.query = "view=all&q=NoMatch&location=Berlin";
  fixture.state.jobs[0].prior_application = "submitted";
  render(<DiscoverPage />);
  await userEvent.click(screen.getByRole("button", { name: "Applications" }));
  await userEvent.click(screen.getByRole("button", { name: "Submitted 1" }));
  expect(new URLSearchParams(fixture.query).get("location")).toBe("Berlin");
  expect(screen.getByLabelText("Filter roles")).toHaveValue("NoMatch");
  expect(
    screen.getByRole("heading", {
      name: "No applications match these filters",
    }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("button", { name: "Submitted 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeVisible();
});

it.each(["all", "applications"])(
  "uses workspace location priority in %s when the profile has no location preference",
  async (view) => {
    fixture.state.profiles[0].locations = [];
    fixture.state._workspace.preferred_locations = ["Toronto"];
    fixture.query = `view=${view}`;
    fixture.state.applications = fixture.state.jobs.map((job) => ({
      id: `app-${job.id}`,
      job_id: job.id,
      title: job.title,
      employer: job.employer,
      status: "draft",
      comments: [],
    }));
    render(<DiscoverPage />);
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    });
    const board = screen.getByRole("region", {
      name: "Opportunities by company",
    });
    expect(
      within(board)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Example Cloud", "Example Studio"]);
    const locationOptions = screen.getByRole("combobox", {
      name: "Location",
      hidden: true,
    });
    expect(
      within(locationOptions)
        .getAllByRole("option", { hidden: true })
        .map((option) => option.textContent),
    ).toEqual(["All locations", "Toronto", "Berlin"]);
  },
);

it("changes the Applications stage without leaving Applications when filtering decisions", async () => {
  fixture.query = "view=applications";
  render(<DiscoverPage />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Application status" }),
    "submitted",
  );
  const route = new URLSearchParams(fixture.query);
  expect(route.get("view")).toBe("applications");
  expect(route.get("section")).toBe("submitted");
  expect(route.get("status")).toBe("submitted");
  expect(fixture.client.action).not.toHaveBeenCalled();
});

it("keeps a requested application's Overview usable outside the visible filter", async () => {
  fixture.state.applications = [
    {
      id: "app-a",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      comments: [],
    },
  ];
  fixture.query = "view=all&q=unmatched&application=app-a&panel=overview";
  render(<DiscoverPage />);
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
    "Cloud Engineer",
  );
  expect(screen.getByText("Built Python applications")).toBeInTheDocument();
  expect(screen.getByText("Verify the full requirement.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Previous opportunity" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Next opportunity" }),
  ).toBeDisabled();
});

it("offers saved documents and activity when a requested listing is missing", async () => {
  fixture.state.applications = [
    {
      id: "missing-app",
      job_id: "missing-job",
      title: "Preserved role",
      employer: "Former listing",
      status: "submitted",
      comments: [],
    },
  ];
  fixture.state.profiles = [];
  fixture.profileId = "";
  fixture.query = "view=applications&application=missing-app&panel=overview";
  render(<DiscoverPage />);
  expect(screen.getByRole("dialog", { name: "Preserved role" })).toBeVisible();
  expect(screen.getByText("Job listing unavailable")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "CV" }));
  expect(new URLSearchParams(fixture.query).get("panel")).toBe("documents");
  expect(fixture.client.action).not.toHaveBeenCalled();
});

it("ignores an exact preparation response after navigating to another role in the same workspace", async () => {
  let resolveDraft: (value: unknown) => void = () => {};
  fixture.client.action.mockImplementation(async (operation: string) =>
    operation === "local-package"
      ? new Promise((resolve) => {
          resolveDraft = resolve;
        })
      : ranked(),
  );
  const { rerender } = render(<DiscoverPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare application" }));
  fireEvent.click(screen.getByRole("button", { name: "Next opportunity" }));
  rerender(<DiscoverPage />);
  await act(async () => {
    resolveDraft({
      id: "stale-version",
      job_id: "job-a",
      title: "Cloud Engineer",
      employer: "Example Cloud",
      status: "draft",
      comments: [],
    });
  });
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Backend Engineer");
  expect(screen.queryByRole("heading", { name: "CV" })).toBeNull();
  expect(new URLSearchParams(fixture.query).has("application")).toBe(false);
});

it("shows weak matches after stronger ones and flags the mismatch in Jobs", async () => {
  const rows = ranked();
  rows[1].match.hard_conflicts = ["Role preference mismatch"];
  fixture.client.action.mockResolvedValue(rows);
  render(<DiscoverPage />);
  await screen.findByText("Role preference mismatch");
  const board = screen.getByRole("region", {
    name: "Opportunities by company",
  });
  expect(
    within(board)
      .getAllByRole("heading", { level: 3 })
      .map(({ textContent }) => textContent),
  ).toEqual(["Cloud Engineer", "Backend Engineer"]);
  expect(
    screen.getAllByRole("button", { name: /^Apply later · / }),
  ).toHaveLength(2);
});

it("shows stored pending choices during a failed ranking, without local endpoints in hosted mode", async () => {
  fixture.client = { ...fixture.client, hosted: true } as typeof fixture.client;
  fixture.state._workspace.agent_queue = true;
  fixture.client.action.mockRejectedValue(new Error("Ranking unavailable"));
  fixture.query =
    "view=applications&section=agent&application=earlier&panel=activity";
  fixture.state.jobs[0].saved = true;
  fixture.state.jobs[1].company = {
    id: "example-studio",
    remaining: 0,
    cooling: true,
  };
  fixture.state.agent_intents = [
    { id: "job-b", marked: true, updated_at: "2026-11-14" },
  ];
  const earlier = {
    id: "earlier",
    job_id: "job-a",
    title: "Cloud Engineer",
    employer: "Example Cloud",
    status: "draft" as const,
    comments: [],
  };
  fixture.state.applications = [earlier, { ...earlier, id: "newest" }];
  const { container } = render(<DiscoverPage />);
  expect(screen.getByRole("button", { name: "To apply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Cloud Engineer");
  expect(container.querySelector("[data-application-id]")).toHaveAttribute(
    "data-application-id",
    "earlier",
  );
  expect(
    screen.getByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).toBeVisible();
  expect(await screen.findByText("Ranking unavailable")).toBeVisible();
  expect(
    fixture.client.action.mock.calls.map(([operation]) => operation),
  ).toEqual(["rank"]);
});

it("preserves the destination on a legacy agent URL and shows unprepared roles under New", async () => {
  fixture.query =
    "view=applications&section=agent&destination=Toronto&status=new";
  fixture.state.jobs = fixture.state.jobs.map((job) => ({
    ...job,
    saved: true,
  }));
  render(<DiscoverPage />);
  expect(
    await screen.findByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Assess Cloud Engineer at Example Cloud",
    }),
  );
  expect(new URLSearchParams(fixture.query).get("location")).toBe("Toronto");
  expect(
    screen.queryByRole("button", {
      name: "Assess Backend Engineer at Example Studio",
    }),
  ).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter roles" }), {
    target: { value: "Cloud" },
  });
  const route = new URLSearchParams(fixture.query);
  expect(route.get("view")).toBe("to-apply");
  expect(route.get("location")).toBe("Toronto");
  expect(route.get("status")).toBe("new");
  expect(route.has("destination")).toBe(false);
});

it("keeps the exact queue selection across pagination and offers manual copy on clipboard denial", async () => {
  fixture.state._workspace.agent_queue = true;
  fixture.state.jobs[0].saved = true;
  fixture.state.agent_intents = [
    { id: "job-a", marked: true, updated_at: "2026-11-14" },
    { id: "job-b", marked: true, updated_at: "2026-11-14" },
  ];
  fixture.state.jobs.splice(
    1,
    0,
    ...Array.from({ length: 49 }, (_, index) => ({
      ...fixture.state.jobs[0],
      id: `pending-${index}`,
      title: `Fictional role ${index}`,
      saved: true,
    })),
  );
  fixture.query = "view=applications&section=agent";
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "rank") return ranked();
    if (operation === "agent-application-status") return { runs: [] };
    if (operation === "agent-capabilities")
      return { available: false, reason: "No executor", channels: {} };
    if (operation === "application-handoff")
      return { text: "job-a, job-b. This handoff grants no authority." };
    throw new Error(operation);
  });
  const user = userEvent.setup();
  const deny = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("Clipboard denied"));
  const view = render(<DiscoverPage />);
  try {
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Select Cloud Engineer at Example Cloud",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    view.rerender(<DiscoverPage />);
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Select Backend Engineer at Example Studio",
      }),
    );
    expect(screen.getByText("2 selected")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Copy agent instructions" }),
    );
    expect(
      await screen.findByRole("textbox", {
        name: "Select and copy the agent instructions",
      }),
    ).toHaveValue("job-a, job-b. This handoff grants no authority.");
    expect(fixture.client.action).toHaveBeenCalledWith("application-handoff", {
      job_ids: ["job-a", "job-b"],
    });
    expect(fixture.client.action).not.toHaveBeenCalledWith(
      "agent-application-start",
      expect.anything(),
    );
    fixture.state.jobs.find(({ id }) => id === "job-b")!.company = {
      id: "example-studio",
      remaining: 1,
      cooling: false,
      submitted_vacancy: true,
    };
    view.rerender(<DiscoverPage />);
    expect(screen.getByText("1 selected")).toBeVisible();
    expect(screen.queryByRole("group", { name: "To apply pages" })).toBeNull();
    expect(
      screen.getByRole("checkbox", {
        name: "Select Cloud Engineer at Example Cloud",
      }),
    ).toBeChecked();
    expect(
      screen.queryByRole("textbox", {
        name: "Select and copy the agent instructions",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: "Select Backend Engineer at Example Studio",
      }),
    ).toBeNull();
  } finally {
    deny.mockRestore();
  }
});
