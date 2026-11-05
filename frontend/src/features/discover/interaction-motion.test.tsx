import { act, fireEvent, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useInteractionMotion } from "./interaction-motion";

function preference(initial = false) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.add(listener),
    ),
    removeEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.delete(listener),
    ),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return {
    query,
    change(value: boolean) {
      act(() => {
        query.matches = value;
        listeners.forEach((listener) => listener());
      });
    },
  };
}
it("animates pointer interactions and keeps keyboard and restored routes immediate", () => {
  preference();
  const { result } = renderHook(useInteractionMotion);
  expect(result.current).toBe(false);
  fireEvent.pointerDown(document);
  expect(result.current).toBe(true);
  fireEvent.keyDown(document, { key: "Tab" });
  expect(result.current).toBe(false);
  fireEvent.pointerDown(document);
  expect(result.current).toBe(true);
});
it("reacts to live reduced-motion changes without losing the last input mode", () => {
  const pref = preference(true);
  const { result } = renderHook(useInteractionMotion);
  fireEvent.pointerDown(document);
  expect(result.current).toBe(false);
  pref.change(false);
  expect(result.current).toBe(true);
  pref.change(true);
  expect(result.current).toBe(false);
  fireEvent.keyDown(document, { key: "Enter" });
  pref.change(false);
  expect(result.current).toBe(false);
});
it("removes preference and document listeners when the feature unmounts", () => {
  const pref = preference();
  const remove = vi.spyOn(document, "removeEventListener");
  const { unmount } = renderHook(useInteractionMotion);
  unmount();
  expect(pref.query.removeEventListener).toHaveBeenCalledWith(
    "change",
    expect.any(Function),
  );
  expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  expect(remove).toHaveBeenCalledWith(
    "pointerdown",
    expect.any(Function),
    true,
  );
});
