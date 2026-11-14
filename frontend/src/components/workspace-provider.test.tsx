import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceState } from "@/lib/models";
import { DiscoverPage } from "@/features/discover/discover-page";
import { NotificationProvider } from "./notification-center";
import { Shell } from "./shell";
import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

const fixture = vi.hoisted(() => ({
  pathname: "/discover/",
  client: { hosted: false, preview: false, state: vi.fn(), action: vi.fn() },
  poll: () => {},
  failure: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  connect: async () => ({ client: fixture.client, signedIn: true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fixture.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./react-bits/dock", () => ({ default: () => null }));

const state = (path = "/fictional-workspace"): WorkspaceState => ({
  identity: { name: "Fictional Candidate" },
  profiles: [],
  facts: [],
  jobs: [],
  applications: [],
  sources: [],
  runs: [],
  consents: {},
  _master: { exists: false, changed: false, path: "master.txt" },
  _workspace: {
    path,
    label: "Fictional",
    master: "master.txt",
    master_template: false,
    timezone: "UTC",
    preferred_locations: [],
    setup_complete: true,
  },
});
function Controls() {
  const { refresh, run, state, clearSession } = useWorkspace();
  return (
    <>
      <p>{state._workspace.path}</p>
      <button
        onClick={() => run("save", {}, "Comment saved.").catch(fixture.failure)}
      >
        Save comment
      </button>
      <button onClick={() => refresh().catch(fixture.failure)}>
        Retry workspace
      </button>
      <button onClick={clearSession}>Clear session</button>
    </>
  );
}
const app = () => (
  <NotificationProvider>
    <WorkspaceProvider>
      <Shell>
        <Controls />
      </Shell>
    </WorkspaceProvider>
  </NotificationProvider>
);

beforeEach(() => {
  fixture.pathname = "/discover/";
  fixture.failure.mockReset();
  fixture.client.state.mockReset().mockResolvedValue({ state: state() });
  fixture.client.action.mockReset().mockResolvedValue({});
  const setInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(
    (callback, delay, ...args) => {
      if (delay === 8000 || delay === 2000) {
        fixture.poll = callback as () => void;
        return -1 as unknown as ReturnType<typeof setInterval>;
      }
      return setInterval(callback, delay, ...args);
    },
  );
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

it("shows a neutral static workspace skeleton until the actual state request completes", async () => {
  let finish: (value: { state: WorkspaceState }) => void = () => {};
  fixture.client.state.mockImplementationOnce(
    () =>
      new Promise<{ state: WorkspaceState }>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(app());
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace…");
  expect(view.container.querySelector(".workspace-boot")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(view.container.querySelectorAll(".workspace-boot-card")).toHaveLength(
    4,
  );
  expect(
    screen.queryByText("Loading your private workspace…"),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(fixture.client.state).toHaveBeenCalledOnce());
  await act(async () => finish({ state: state() }));
  expect(
    view.container.querySelector(".workspace-boot"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Save comment" }),
  ).toBeInTheDocument();
});

it("retains recent success and durable refresh recovery across navigation", async () => {
  const view = render(app());
  fireEvent.click(await screen.findByRole("button", { name: "Save comment" }));
  const notifications = await screen.findByRole("region", { name: "Notifications" });
  expect(notifications).toHaveTextContent("Comment saved.");
  fixture.client.state.mockRejectedValueOnce(new Error("Failed to fetch"));
  await act(async () => fixture.poll());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot connect to the app. Check your connection and that the app is running, then try again.",
  );
  expect(screen.getByRole("alert")).toHaveClass("error");
  expect(notifications).toHaveTextContent("Comment saved.");
  fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  fixture.pathname = "/history/";
  view.rerender(app());
  expect(
    screen.queryByText(/Cannot connect to the app/),
  ).not.toBeInTheDocument();
  expect(notifications).toHaveTextContent("Comment saved.");
});

it("does not replace recovery with an older polling failure", async () => {
  render(app());
  await screen.findByRole("button", { name: "Retry workspace" });
  let rejectOld!: (error: Error) => void;
  fixture.client.state.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  await act(async () => fixture.poll());
  fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));
  await waitFor(() => expect(fixture.client.state).toHaveBeenCalledTimes(3));
  await act(async () => rejectOld(new Error("Outdated network failure")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Outdated network failure"),
  ).not.toBeInTheDocument();
});

it("keeps refresh failures rejected for the calling operation", async () => {
  render(app());
  await screen.findByRole("button", { name: "Retry workspace" });
  const error = new Error("Workspace unavailable");
  fixture.client.state.mockRejectedValueOnce(error);
  fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));
  await waitFor(() => expect(fixture.failure).toHaveBeenCalledWith(error));
  expect(screen.getByRole("alert")).toHaveTextContent("Workspace unavailable");
});

it("does not restore workspace state from a refresh that outlives the session", async () => {
  render(app());
  await screen.findByRole("button", { name: "Clear session" });
  let resolveOld!: (result: { state: WorkspaceState }) => void;
  fixture.client.state.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await act(async () => fixture.poll());
  fireEvent.click(screen.getByRole("button", { name: "Clear session" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
  await act(async () => resolveOld({ state: state("/old-session") }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
  expect(screen.queryByText("/old-session")).not.toBeInTheDocument();
});

it("recovers both workspace and assessment errors through Retry assessment without waiting for another poll", async () => {
  const workspace = state();
  workspace.profiles = [
    {
      id: "fictional-profile",
      name: "Engineering search",
      roles: ["Engineer"],
      locations: [],
      seniority: [],
      arrangements: [],
      hard: [],
      exclude: [],
      work_rights: [],
      needs_sponsorship: false,
      minimum: 0,
      currency: "",
      period: "",
      template: "plain",
      include_stretch: true,
      include_unknown: true,
    },
  ];
  fixture.client.state.mockResolvedValue({ state: workspace });
  fixture.client.action.mockImplementation(async (action: string) => {
    if (action === "rank") throw new Error("Assessment unavailable");
    return {};
  });
  const view = render(
    <NotificationProvider>
      <WorkspaceProvider>
        <Shell>
          <Controls />
          <DiscoverPage />
        </Shell>
      </WorkspaceProvider>
    </NotificationProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Assessment unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
  const notifications = await screen.findByRole("region", { name: "Notifications" });
  expect(notifications).toHaveTextContent("Comment saved.");
  fixture.client.state.mockRejectedValueOnce(new Error("Failed to fetch"));
  await act(async () => fixture.poll());
  expect(screen.getAllByRole("alert")).toHaveLength(2);

  // A failed state retry stays visible and does not launch an assessment against stale state.
  fixture.client.action.mockClear().mockResolvedValue([]);
  fixture.client.state.mockRejectedValueOnce(
    new Error("Workspace still offline"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry assessment" }));
  expect(await screen.findByText("Workspace still offline")).toHaveAttribute(
    "role",
    "alert",
  );
  expect(fixture.client.action).not.toHaveBeenCalled();

  fireEvent.click(
    await screen.findByRole("button", { name: "Retry assessment" }),
  );
  await waitFor(() =>
    expect(fixture.client.action).toHaveBeenCalledWith("rank", {
      profile_id: "fictional-profile",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  fixture.pathname = "/history/";
  view.rerender(
    <WorkspaceProvider>
      <Shell>
        <Controls />
      </Shell>
    </WorkspaceProvider>,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(notifications).toHaveTextContent("Comment saved.");
});
