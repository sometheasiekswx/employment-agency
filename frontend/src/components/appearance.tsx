"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  appearanceStorageKey,
  darkAppearanceQuery,
  defaultAppearance,
  isAppearance,
  type Appearance,
} from "@/lib/appearance";

const appearanceChange = "employment-agency:appearance-change";

function getAppearance(): Appearance {
  const value = document.documentElement.dataset.appearance;
  return isAppearance(value) ? value : defaultAppearance;
}

function applyAppearance(appearance: Appearance, system?: MediaQueryList) {
  const { dataset } = document.documentElement;
  const changed = dataset.appearance !== appearance;
  const systemTheme = system?.matches === false ? "light" : "dark";
  dataset.appearance = appearance;
  dataset.theme = appearance === "system" ? systemTheme : appearance;
  if (changed) window.dispatchEvent(new Event(appearanceChange));
}

function setAppearance(value: string) {
  if (!isAppearance(value)) return;
  applyAppearance(value, window.matchMedia?.(darkAppearanceQuery));
  try {
    window.localStorage.setItem(appearanceStorageKey, value);
  } catch {
    // The selection still works for this page if storage is unavailable.
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(appearanceChange, listener);
  return () => window.removeEventListener(appearanceChange, listener);
}

function getServerAppearance() {
  return defaultAppearance;
}

export function useAppearance() {
  const appearance = useSyncExternalStore(
    subscribe,
    getAppearance,
    getServerAppearance,
  );
  return { appearance, setAppearance };
}

export function AppearanceSync() {
  useEffect(() => {
    const system = window.matchMedia?.(darkAppearanceQuery);
    const syncSystem = () => {
      if (getAppearance() === "system") applyAppearance("system", system);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== appearanceStorageKey && event.key !== null) return;
      try {
        if (event.storageArea !== window.localStorage) return;
        const value = window.localStorage.getItem(appearanceStorageKey);
        applyAppearance(
          isAppearance(value) ? value : defaultAppearance,
          system,
        );
      } catch {
        // Keep the current appearance if storage becomes unavailable.
      }
    };
    system?.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    syncSystem();
    return () => {
      system?.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  return null;
}
