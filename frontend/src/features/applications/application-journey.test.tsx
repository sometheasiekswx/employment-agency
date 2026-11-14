import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiResponseError } from "@/lib/api";
import { DraftProvider } from "@/components/unsaved";
import type {
  AgentRun,
  Application,
  Job,
  RequestData,
  SubmissionAttempt,
} from "@/lib/models";
import { CompanySubmission } from "./company-submission";
import { RoleAgentWork } from "./agent-application";

const fixture = vi.hoisted(() => ({
  client: { action: vi.fn(), hosted: false, preview: false },
  refresh: vi.fn(),
  onRecord: vi.fn(),
  attempts: [] as SubmissionAttempt[],
}));

const job: Job = {
  id: "job-a",
  employer: "Fictional Systems",
  title: "Platform Engineer",
  url: "https://employer.example.test/listing",
};
const application: Application = {
  id: "version-a",
  job_id: job.id,
  title: job.title,
  employer: job.employer,
  status: "draft",
  comments: [],
};
const destination = "https://employer.example.test/apply";
const continueUrl = "/application-site/test-reservation/test-proof";
const reservation: SubmissionAttempt = {
  id: "reservation-a",
  application_id: application.id,
  channel: "manual",
  self_apply_request: "request-a",
  status: "handed_off",
  binding: { job_id: job.id, destination },
  continue_url: continueUrl,
};
const context = (site: string, listingHash = "listing-hash") => ({
  roles: [
    {
      job,
      application,
      employer: { id: "employer-a", name: job.employer },
      allowance: { remaining: 2 },
      listing_sha256: listingHash,
      destinations: [{ channel: "website", value: site, source_url: job.url }],
      blockers: [],
    },
  ],
});

vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    client: fixture.client,
    refresh: fixture.refresh,
    state: {
      _workspace: { agent_queue: true, timezone: "UTC" },
      applications: [application],
    },
    profileId: "profile-a",
  }),
}));

beforeEach(() => {
  fixture.client.action.mockReset();
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  fixture.onRecord.mockReset();
  fixture.attempts = [];
});

it("reuses an ambiguous manual start request and exposes the same site's link when a popup is blocked", async () => {
  let starts = 0;
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "company-submission-status") return [];
    if (operation === "application-context") return context(destination);
    if (operation === "self-application-start") {
      if (++starts === 1) throw new Error("Failed to fetch");
      return reservation;
    }
    throw new Error(operation);
  });
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  try {
    render(
      <CompanySubmission
        job={job}
        app={application}
        onRecord={fixture.onRecord}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Open application site" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot connect to the app",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Open application site" }),
    );
    expect(
      await screen.findByRole("button", { name: "I've applied" }),
    ).toBeVisible();
    const calls = fixture.client.action.mock.calls.filter(
      ([action]) => action === "self-application-start",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(
      screen.getByRole("link", { name: "Continue to application site" }),
    ).toHaveAttribute("href", continueUrl);
    expect(fixture.onRecord).not.toHaveBeenCalled();
  } finally {
    open.mockRestore();
  }
});

it("uses a new request and the updated destination after definite validation rejection", async () => {
  const updated = "https://employer.example.test/new-form";
  let rejected = false;
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "company-submission-status") return [];
    if (operation === "application-context")
      return rejected
        ? context(updated, "updated-listing")
        : context(destination);
    if (operation === "self-application-start") {
      if (!rejected) {
        rejected = true;
        throw new ApiResponseError("The application destination changed.", 400);
      }
      return {
        ...reservation,
        binding: { job_id: job.id, destination: updated },
      };
    }
    throw new Error(operation);
  });
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  try {
    render(
      <CompanySubmission
        job={job}
        app={application}
        onRecord={fixture.onRecord}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Open application site" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The application destination changed.",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Open application site" }),
    );
    expect(
      await screen.findByRole("link", { name: "Continue to application site" }),
    ).toHaveAttribute("href", continueUrl);
    const starts = fixture.client.action.mock.calls
      .filter(([name]) => name === "self-application-start")
      .map(([, args]) => args);
    expect(starts[0].request_key).not.toBe(starts[1].request_key);
    expect(starts[1]).toMatchObject({
      destination: updated,
      listing_sha256: "updated-listing",
    });
    expect(fixture.onRecord).not.toHaveBeenCalled();
  } finally {
    open.mockRestore();
  }
});

it("revalidates an existing reservation before navigating and keeps it available to resolve when the check fails", async () => {
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "company-submission-status") return [reservation];
    if (operation === "company-submission-continue")
      throw new ApiResponseError("The application destination changed.", 400);
    throw new Error(operation);
  });
  const tab = { location: { replace: vi.fn() }, close: vi.fn() };
  const open = vi
    .spyOn(window, "open")
    .mockReturnValue(tab as unknown as Window);
  try {
    render(
      <CompanySubmission
        job={job}
        app={application}
        onRecord={fixture.onRecord}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Open application site" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The application destination changed.",
    );
    expect(fixture.client.action).toHaveBeenCalledWith(
      "company-submission-continue",
      { id: reservation.id },
    );
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(tab.close).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "I've applied" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Close without submitting" }),
    ).toBeEnabled();
  } finally {
    open.mockRestore();
  }
});

it("lets a removed role's held application be resolved", async () => {
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "company-submission-status") return [reservation];
    throw new Error(operation);
  });
  render(
    <CompanySubmission
      job={job}
      app={application}
      canStart={false}
      onRecord={fixture.onRecord}
    />,
  );
  expect(
    await screen.findByRole("button", { name: "I've applied" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Close without submitting" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Open application site" }),
  ).toBeNull();
});

const capabilities = (available: boolean) => ({
  available,
  reason: available ? "" : "Browser access unavailable",
  roles: [{ job_id: job.id, available, reason: "Browser access unavailable" }],
  channels: {},
});

it("keeps connected application action absent when capability is unavailable", async () => {
  fixture.client.action.mockImplementation(async (operation: string) => {
    if (operation === "agent-application-status") return { runs: [] };
    if (operation === "agent-capabilities") return capabilities(false);
    throw new Error(operation);
  });
  render(<RoleAgentWork job={job} canStart />);
  await waitFor(() =>
    expect(fixture.client.action).toHaveBeenCalledWith("agent-capabilities", {
      job_ids: [job.id],
    }),
  );
  expect(screen.queryByRole("button", { name: "Apply for me" })).toBeNull();
});

it("authorizes a named role at start and handles a question, Stop, and uncertain outcome without resubmitting", async () => {
  let runs: AgentRun[] = [];
  const stamp = "2026-11-14T09:00:00Z";
  const run: AgentRun = {
    id: "run-a",
    job_id: job.id,
    status: "needs_help",
    message: "A verified answer is required.",
    question: {
      id: "question-a",
      prompt: "What is your confirmed start date?",
    },
    updated_at: stamp,
    can_resume: false,
    can_stop: true,
  };
  fixture.client.action.mockImplementation(
    async (operation: string, args: RequestData) => {
      if (operation === "agent-application-status") return { runs };
      if (operation === "agent-capabilities") return capabilities(true);
      if (operation === "application-context") return context(destination);
      if (operation === "agent-application-start") {
        expect(args).toEqual({
          job_ids: [job.id],
          application_ids: { [job.id]: application.id },
          profile_id: "profile-a",
          request_key: expect.any(String),
        });
        runs = [run];
      } else if (operation === "agent-application-answer") {
        expect(args).toEqual({
          id: run.id,
          question_id: run.question?.id,
          answer: "1 December 2026",
        });
        runs = [
          {
            ...run,
            status: "applying",
            question: undefined,
            message: "Continuing the application.",
          },
        ];
      } else if (operation === "agent-application-stop") {
        expect(args).toEqual({ id: run.id });
        runs = [
          {
            ...run,
            status: "uncertain",
            can_stop: false,
            message: "Check whether the website received it.",
            can_resolve: true,
          },
        ];
      } else if (operation === "agent-application-resolve") {
        expect(args).toEqual({
          id: run.id,
          confirmed: true,
          outcome: "not_sent",
          occurred_at: "",
          evidence: "Fictional portal showed no completed application.",
        });
        runs = [
          {
            ...run,
            status: "stopped",
            can_stop: false,
            question: undefined,
            message: "No submission recorded.",
          },
        ];
      } else throw new Error(operation);
      return { runs };
    },
  );
  const user = userEvent.setup();
  render(
    <DraftProvider>
      <RoleAgentWork job={job} applicationId={application.id} canStart />
    </DraftProvider>,
  );
  const start = await screen.findByRole("button", { name: "Apply for me" });
  expect(start).toHaveAccessibleDescription(
    /Starting authorizes.*Platform Engineer at Fictional Systems/,
  );
  await user.click(start);
  expect(await screen.findByText("Needs your help")).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: /confirmed start date/ }),
    "1 December 2026",
  );
  await user.click(
    screen.getByRole("button", { name: "Send answer to agent" }),
  );
  expect(await screen.findByText("Applying")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText(/website received it/)).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Verified outcome" }),
    "not_sent",
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Confirmation evidence" }),
    {
      target: { value: "Fictional portal showed no completed application." },
    },
  );
  await user.click(
    screen.getByRole("button", { name: "Record verified outcome" }),
  );
  expect(await screen.findByText("Stopped")).toBeVisible();
  expect(
    fixture.client.action.mock.calls.filter(
      ([name]) => name === "agent-application-start",
    ),
  ).toHaveLength(1);
});

it.each([
  ["interrupted", true],
  ["uncertain", false],
  ["record_pending", false],
] as const)(
  "keeps a %s audit visible while gating a fresh explicit start",
  async (status, canStart) => {
    fixture.client.action.mockImplementation(async (operation: string) => {
      if (operation === "agent-application-status")
        return {
          runs: [
            {
              id: "restored-run",
              job_id: job.id,
              status,
              message: "Retained run checkpoint.",
              updated_at: "2026-11-14T09:00:00Z",
              can_resume: false,
              can_stop: false,
              can_resolve: status !== "interrupted",
            },
          ],
        };
      if (operation === "agent-capabilities") return capabilities(true);
      throw new Error(operation);
    });
    render(<RoleAgentWork job={job} canStart />);
    expect(await screen.findByText(/Retained run checkpoint/)).toBeVisible();
    if (canStart)
      expect(
        await screen.findByRole("button", { name: "Apply for me" }),
      ).toBeVisible();
    else
      expect(screen.queryByRole("button", { name: "Apply for me" })).toBeNull();
    expect(fixture.client.action).not.toHaveBeenCalledWith(
      "agent-application-start",
      expect.anything(),
    );
  },
);
