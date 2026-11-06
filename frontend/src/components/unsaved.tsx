"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

const DraftContext = createContext<{
  mark: (id: string, dirty: boolean) => void;
  canLeave: (exceptId?: string, message?: string) => boolean;
}>({ mark: () => {}, canLeave: () => true });

export function DraftProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Set<string>());
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
    <DraftContext.Provider value={{ mark, canLeave }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft() {
  const id = useId();
  const { mark, canLeave } = useContext(DraftContext);
  const setDirty = useCallback((dirty: boolean) => mark(id, dirty), [id, mark]);
  const canLeaveOtherDrafts = useCallback(
    (message?: string) => canLeave(id, message),
    [canLeave, id],
  );
  useEffect(() => () => mark(id, false), [id, mark]);
  return { setDirty, canLeave, canLeaveOtherDrafts };
}
