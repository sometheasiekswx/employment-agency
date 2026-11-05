"use client";

import { useEffect, useState } from "react";

/** Live OS preference and input mode: keyboard workflows stay immediate. */
export function useInteractionMotion() {
  const [reduced, setReduced] = useState(true);
  const [pointer, setPointer] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    const keyboard = () => setPointer(false);
    const pointing = () => setPointer(true);
    update();
    query.addEventListener("change", update);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointing, true);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointing, true);
    };
  }, []);
  return pointer && !reduced;
}
