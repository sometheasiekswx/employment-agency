"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClient, connect } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { RequestData, WorkspaceState } from "@/lib/models";

interface WorkspaceContextValue {
  state: WorkspaceState;
  client: ApiClient;
  notice: string;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  run: <T = unknown>(
    action: string,
    data?: RequestData,
    message?: string,
  ) => Promise<T>;
  profileId: string;
  selectProfile: (id: string) => void;
  clearSession: () => void;
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ApiClient>();
  const [state, setState] = useState<WorkspaceState>();
  const [error, setError] = useState("");
  const [notice, notify] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedProfile, selectProfile] = useState("");
  const refreshSequence = useRef(0);
  const workspace = useRef("");

  useEffect(() => {
    let alive = true;
    connect()
      .then(async ({ client, signedIn }) => {
        if (!alive) return;
        setClient(client);
        setSignedIn(signedIn);
        if (signedIn) {
          const result = await client.state();
          if (alive) {
            workspace.current = result.state._workspace.path;
            setState(result.state);
            setError("");
          }
        }
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const sequence = ++refreshSequence.current;
    const result = await client.state();
    if (sequence !== refreshSequence.current) return;
    if (workspace.current !== result.state._workspace.path) {
      selectProfile("");
      notify("Workspace changed.");
      workspace.current = result.state._workspace.path;
    }
    setState(result.state);
  }, [client]);

  const running = state?.runs.some((run) => run.status === "running");
  const ready = Boolean(state);
  useEffect(() => {
    if (!ready || !client || (!running && client.hosted)) return;
    const interval = setInterval(
      () => {
        if (document.visibilityState !== "hidden")
          refresh().catch((error) => notify(errorMessage(error)));
      },
      running ? 2000 : 8000,
    );
    return () => clearInterval(interval);
  }, [ready, client, running, refresh]);

  const run = useCallback(
    async <T,>(action: string, data: RequestData = {}, message = "Saved.") => {
      if (!client) throw new Error("Application is still loading.");
      const result = await client.action<T>(action, data);
      await refresh();
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      )
        throw new Error(result.error);
      notify(message);
      return result;
    },
    [client, refresh],
  );

  const clearSession = useCallback(() => {
    client?.auth?.clear();
    setError("");
    setSignedIn(false);
    setState(undefined);
    selectProfile("");
    notify("");
  }, [client]);

  if (error)
    return (
      <main className="boot">
        <h1>Unable to open your workspace</h1>
        <p role="alert">{error}</p>
        <button
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </button>
        {client?.hosted && (
          <button onClick={clearSession}>Sign in again</button>
        )}
      </main>
    );
  if (client?.hosted && !signedIn)
    return (
      <main className="boot">
        <h1>Your private career workspace</h1>
        <p>
          Invite-only pilot. Your career information and documents stay in your
          cloud account. Nothing is sent to employers.
        </p>
        <button
          onClick={() =>
            client.auth?.login().catch((error) => setError(errorMessage(error)))
          }
        >
          Continue with Google
        </button>
      </main>
    );
  if (!state || !client)
    return (
      <main className="boot" role="status">
        Loading your private workspace…
      </main>
    );
  const profileId = state.profiles.some(
    (profile) => profile.id === selectedProfile,
  )
    ? selectedProfile
    : state.profiles[0]?.id || "";
  return (
    <WorkspaceContext.Provider
      value={{
        state,
        client,
        notice,
        notify,
        refresh,
        run,
        profileId,
        selectProfile,
        clearSession,
      }}
    >
      <div key={state._workspace.path}>{children}</div>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context)
    throw new Error("Workspace components must be inside WorkspaceProvider.");
  return context;
}
