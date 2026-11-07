"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

type HistoryGuard = (event: PopStateEvent) => void;

const DraftContext = createContext<{
  mark: (id: string, dirty: boolean) => void;
  canLeave: (exceptId?: string, message?: string) => boolean;
  registerHistoryGuard: (guard: HistoryGuard) => () => void;
}>({
  mark: () => {},
  canLeave: () => true,
  registerHistoryGuard: () => () => {},
});

export function DraftProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Set<string>());
  const historyGuard = useRef<HistoryGuard | null>(null);
  const registerHistoryGuard = useCallback((guard: HistoryGuard) => {
    historyGuard.current = guard;
    return () => {
      if (historyGuard.current === guard) historyGuard.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    // Attach before the router's effect so a rejected traversal cannot unmount
    // the draft before the active route gets a chance to guard it.
    const onPopState = (event: PopStateEvent) => historyGuard.current?.(event);
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, []);
  const mark = useCallback((id: string, dirty: boolean) => {
    if (dirty) drafts.current.add(id);
    else drafts.current.delete(id);
  }, []);
  const canLeave = useCallback(
    (exceptId?: string, message = "Discard unsaved changes?") =>
      !Array.from(drafts.current).some((id) => id !== exceptId) ||
      window.confirm(message),
    [],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  return (
    <DraftContext.Provider value={{ mark, canLeave, registerHistoryGuard }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft() {
  const id = useId();
  const { mark, canLeave, registerHistoryGuard } = useContext(DraftContext);
  const setDirty = useCallback((dirty: boolean) => mark(id, dirty), [id, mark]);
  const canLeaveOtherDrafts = useCallback(
    (message?: string) => canLeave(id, message),
    [canLeave, id],
  );
  useEffect(() => () => mark(id, false), [id, mark]);
  return { setDirty, canLeave, canLeaveOtherDrafts, registerHistoryGuard };
}
