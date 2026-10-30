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
  canLeave: () => boolean;
}>({ mark: () => {}, canLeave: () => true });

export function DraftProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Set<string>());
  const mark = useCallback((id: string, dirty: boolean) => {
    if (dirty) drafts.current.add(id);
    else drafts.current.delete(id);
  }, []);
  const canLeave = useCallback(
    () =>
      drafts.current.size === 0 || window.confirm("Discard unsaved changes?"),
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
  useEffect(() => () => mark(id, false), [id, mark]);
  return { setDirty, canLeave };
}
