"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion";

const threshold = 8;
const scrollCooldown = 100;
const interactive =
  "button, a, input, textarea, select, summary, [contenteditable], [role='button']";

type Bounds = { collapsed: number; expanded: number };
type Sample = { y: number; time: number };
type Gesture = {
  pointer: number;
  owner: HTMLElement;
  x: number;
  y: number;
  height: number;
  bounds: Bounds;
  active: boolean;
  samples: Sample[];
};

function boundsFor(element: HTMLElement): Bounds {
  const css = getComputedStyle(element);
  const expanded = parseFloat(css.maxHeight) || window.innerHeight - 8;
  return {
    collapsed: Math.min(
      expanded,
      Math.max(parseFloat(css.minHeight) || 0, (expanded + 8) / 2),
    ),
    expanded,
  };
}

function clampHeight(height: number, bounds: Bounds) {
  return Math.max(bounds.collapsed, Math.min(bounds.expanded, height));
}

/** Two detents for the existing native opportunity dialog, not a second modal. */
export function useSheetGesture({
  mobile,
  animateInteractions,
  jobId,
}: {
  mobile: boolean;
  animateInteractions: boolean;
  jobId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const destination = useRef(false);
  const motionAllowed = useRef(animateInteractions);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const generation = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const updateScrollAction = useRef(() => {});

  const stop = useCallback(() => {
    generation.current += 1;
    animation.current?.stop();
    animation.current = null;
  }, []);

  const release = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.owner.hasPointerCapture?.(active.pointer))
      active.owner.releasePointerCapture(active.pointer);
    dialog.current?.removeAttribute("data-sheet-dragging");
  }, []);

  const cancel = useCallback(() => {
    stop();
    release();
    dialog.current?.style.removeProperty("height");
  }, [release, stop]);

  const snap = useCallback(
    (next: boolean, animated: boolean, velocity = 0) => {
      const element = dialog.current;
      if (!element) return;
      const from = element.getBoundingClientRect().height;
      const bounds = boundsFor(element);
      const to = next ? bounds.expanded : bounds.collapsed;
      stop();
      release();
      destination.current = next;
      setExpanded(next);
      if (!animated || !motionAllowed.current || Math.abs(from - to) < 1) {
        element.style.removeProperty("height");
        return;
      }
      const revision = generation.current;
      element.style.height = `${from}px`;
      // A real height keeps the native scrolling viewport and persistent footer
      // correct throughout resizing. One bounded style write per frame; no React
      // renders or layout reads on the move/update path. See docs/mobile-sheet-motion.md.
      const control = animate(from, to, {
        type: "spring",
        stiffness: 720,
        damping: 48,
        mass: 0.8,
        velocity: Math.max(-2500, Math.min(2500, velocity)),
        restDelta: 0.75,
        restSpeed: 15,
        onUpdate: (height) => {
          if (generation.current === revision)
            element.style.height = `${clampHeight(height, bounds)}px`;
        },
      });
      animation.current = control;
      void control.finished.then(
        () => {
          if (animation.current !== control) return;
          animation.current = null;
          element.style.removeProperty("height");
        },
        () => {},
      );
    },
    [release, stop],
  );

  useLayoutEffect(() => {
    motionAllowed.current = animateInteractions;
    if (!animateInteractions) cancel();
  }, [animateInteractions, cancel]);

  useLayoutEffect(() => {
    const element = dialog.current;
    const scroller = body.current;
    const grabber = handle.current;
    if (!mobile || !element || !scroller || !grabber) return;
    const directional =
      typeof CSS !== "undefined" &&
      CSS.supports("touch-action", "pan-x pan-down pinch-zoom");
    let lastScroll = -Infinity;
    let cooldown: ReturnType<typeof setTimeout>;

    const updateScrolling = () => {
      // Declare intent BEFORE a touch begins. The browser owns content scrolling
      // for that entire gesture; reaching the top cannot suddenly resize a sheet.
      scroller.style.touchAction = !destination.current
        ? "pan-x pinch-zoom"
        : directional &&
            scroller.scrollTop <= 0 &&
            performance.now() - lastScroll >= scrollCooldown
          ? // pan-down permits scrolling down the content (finger moves up).
            "pan-x pan-down pinch-zoom"
          : "pan-x pan-y pinch-zoom";
    };
    updateScrollAction.current = updateScrolling;
    const onScroll = () => {
      lastScroll = performance.now();
      updateScrolling();
      clearTimeout(cooldown);
      cooldown = setTimeout(updateScrolling, scrollCooldown);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) {
        if (gesture.current) snap(destination.current, true);
        return;
      }
      if (event.button !== 0 || gesture.current) return;
      const owner = event.currentTarget as HTMLElement;
      if (
        owner === scroller &&
        (event.pointerType === "mouse" ||
          (event.target as Element).closest(interactive) ||
          window.getSelection()?.isCollapsed === false ||
          (destination.current &&
            (!directional ||
              scroller.scrollTop > 0 ||
              performance.now() - lastScroll < scrollCooldown)))
      )
        return;
      suppressClick.current = false;
      const height = element.getBoundingClientRect().height;
      const bounds = boundsFor(element);
      if (animation.current) {
        stop();
        element.style.height = `${height}px`;
      }
      gesture.current = {
        pointer: event.pointerId,
        owner,
        x: event.clientX,
        y: event.clientY,
        height,
        bounds,
        active: false,
        samples: [{ y: event.clientY, time: event.timeStamp }],
      };
    };
    const move = (event: PointerEvent) => {
      const drag = gesture.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const dy = event.clientY - drag.y;
      if (!drag.active) {
        if (
          Math.max(Math.abs(dy), Math.abs(event.clientX - drag.x)) < threshold
        )
          return;
        if (Math.abs(event.clientX - drag.x) > Math.abs(dy)) {
          snap(destination.current, true);
          return;
        }
        drag.active = true;
        suppressClick.current = true;
        drag.owner.setPointerCapture(event.pointerId);
        element.setAttribute("data-sheet-dragging", "");
      }
      drag.samples = drag.samples.filter(
        (sample) => event.timeStamp - sample.time <= 80,
      );
      drag.samples.push({ y: event.clientY, time: event.timeStamp });
      element.style.height = `${clampHeight(drag.height - dy, drag.bounds)}px`;
    };
    const up = (event: PointerEvent) => {
      const drag = gesture.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      if (!drag.active) {
        release();
        if (element.style.height) snap(destination.current, true);
        return;
      }
      const first = drag.samples.find(
        (sample) => event.timeStamp - sample.time <= 80,
      );
      const elapsed = first ? event.timeStamp - first.time : 0;
      const velocity =
        first && elapsed > 0
          ? (-(event.clientY - first.y) / elapsed) * 1000
          : 0;
      const height = clampHeight(
        drag.height - (event.clientY - drag.y),
        drag.bounds,
      );
      // Short flicks and a last-moment reversal use recent velocity, not the
      // average of the whole drag. Pausing before release removes momentum.
      const projected = height + velocity * 0.16;
      snap(
        projected > (drag.bounds.collapsed + drag.bounds.expanded) / 2,
        true,
        velocity,
      );
      updateScrolling();
    };
    const interrupted = (event: PointerEvent) => {
      // Touch starts with implicit capture on the hit child. Transferring it to
      // the scroller emits a bubbled loss from that child; our drag still owns
      // capture and must continue. Only losing the owner's capture cancels it.
      if (
        event.type === "lostpointercapture" &&
        event.target !== gesture.current?.owner
      )
        return;
      if (gesture.current?.pointer === event.pointerId) {
        snap(destination.current, true);
        updateScrolling();
      }
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const resize = () => {
      cancel();
      updateScrolling();
    };
    const targets: HTMLElement[] = [grabber, scroller];
    for (const target of targets) {
      target.addEventListener("pointerdown", down);
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", interrupted);
      target.addEventListener("lostpointercapture", interrupted);
      target.addEventListener("click", click, true);
    }
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    updateScrolling();
    return () => {
      cancel();
      clearTimeout(cooldown);
      for (const target of targets) {
        target.removeEventListener("pointerdown", down);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", interrupted);
        target.removeEventListener("lostpointercapture", interrupted);
        target.removeEventListener("click", click, true);
      }
      scroller.removeEventListener("scroll", onScroll);
      updateScrollAction.current = () => {};
      scroller.style.removeProperty("touch-action");
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [mobile, jobId, cancel, release, snap, stop]);

  // Taps/keyboard commands also change the declared scrolling behavior.
  useLayoutEffect(() => updateScrollAction.current(), [expanded]);

  return { dialog, body, handle, expanded, snap, cancel };
}
