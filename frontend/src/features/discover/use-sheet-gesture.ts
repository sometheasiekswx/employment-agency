"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion";

const threshold = 8;
const scrollCooldown = 100;
const interactive =
  "button, a, input, textarea, select, summary, [contenteditable], [role='button']";
const editable = "input, textarea, select, [contenteditable]";
const headerRegion = ".discover-sheet-header";
const footerRegion = ".discover-inspector-footer";

type Bounds = { collapsed: number; expanded: number };
type Sample = { y: number; time: number };
type Gesture = {
  pointer: number;
  owner: HTMLElement;
  x: number;
  y: number;
  height: number;
  initialHeight: number;
  lastY: number;
  intentY: number;
  direction: number;
  readsContent: boolean;
  startedExpanded: boolean;
  scrollBase: number;
  addedScroll: number;
  maximumScroll: number | null;
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
      Math.max(parseFloat(css.minHeight) || 0, (expanded + 8) * 0.6),
    ),
    expanded,
  };
}

function clampHeight(height: number, bounds: Bounds) {
  return Math.max(0, Math.min(bounds.expanded, height));
}

function visibleHeight(element: HTMLElement) {
  const transform = getComputedStyle(element).transform;
  const matrix = transform.match(/^matrix(3d)?\(([^)]+)\)$/);
  const values = matrix?.[2].split(",").map(Number);
  const translation = transform.match(/^translate3d\(([^)]+)\)$/);
  const offset =
    values?.[matrix?.[1] ? 13 : 5] ??
    parseFloat(translation?.[1].split(",")[1] || "0");
  return element.getBoundingClientRect().height - offset;
}

function renderHeight(element: HTMLElement, height: number, bounds: Bounds) {
  const value = clampHeight(height, bounds);
  element.style.height = `${Math.max(bounds.collapsed, value)}px`;
  element.style.transform = `translate3d(0px, ${Math.max(0, bounds.collapsed - value)}px, 0px)`;
}

/** Two detents for the existing native opportunity dialog, not a second modal. */
export function useSheetGesture({
  mobile,
  animateInteractions,
  jobId,
  onDismiss,
  onGrab,
}: {
  mobile: boolean;
  animateInteractions: boolean;
  jobId: string;
  onDismiss: () => void;
  onGrab: (element: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const destination = useRef(false);
  const motionAllowed = useRef(animateInteractions);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const scrollAnimation = useRef<ReturnType<typeof animate> | null>(null);
  const scrollGeneration = useRef(0);
  const generation = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const updateScrollAction = useRef(() => {});
  const callbacks = useRef({ onDismiss, onGrab });
  useLayoutEffect(() => {
    callbacks.current = { onDismiss, onGrab };
  }, [onDismiss, onGrab]);

  const stopReading = useCallback(() => {
    scrollGeneration.current += 1;
    scrollAnimation.current?.stop();
    scrollAnimation.current = null;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    animation.current?.stop();
    animation.current = null;
    stopReading();
  }, [stopReading]);

  const release = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.owner.hasPointerCapture?.(active.pointer))
      active.owner.releasePointerCapture(active.pointer);
    dialog.current?.removeAttribute("data-sheet-dragging");
  }, []);

  const cancel = useCallback(
    (preservePresentation = false) => {
      const active = gesture.current;
      if (
        !preservePresentation &&
        active &&
        active.addedScroll > 0 &&
        body.current
      )
        body.current.scrollTop = active.scrollBase;
      stop();
      release();
      if (!preservePresentation) {
        dialog.current?.style.removeProperty("height");
        dialog.current?.style.removeProperty("transform");
      }
    },
    [release, stop],
  );

  const snap = useCallback(
    (next: boolean, animated: boolean, velocity = 0) => {
      const element = dialog.current;
      if (!element) return;
      const from = visibleHeight(element);
      const bounds = boundsFor(element);
      const to = next ? bounds.expanded : bounds.collapsed;
      stop();
      release();
      destination.current = next;
      setExpanded(next);
      if (!animated || !motionAllowed.current || Math.abs(from - to) < 1) {
        element.style.removeProperty("height");
        element.style.removeProperty("transform");
        return;
      }
      const revision = generation.current;
      renderHeight(element, from, bounds);
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
            renderHeight(element, height, bounds);
        },
      });
      animation.current = control;
      void control.finished.then(
        () => {
          if (animation.current !== control) return;
          animation.current = null;
          element.style.removeProperty("height");
          element.style.removeProperty("transform");
        },
        () => {},
      );
    },
    [release, stop],
  );

  const continueReading = useCallback((velocity: number) => {
    const scroller = body.current;
    if (!scroller || !motionAllowed.current || Math.abs(velocity) < 80) return;
    const from = scroller.scrollTop;
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const target = Math.max(0, Math.min(maximum, from + velocity * 0.24));
    if (Math.abs(target - from) < 1) return;
    const revision = scrollGeneration.current;
    // Only the contact that began in peek needs a small inertial continuation.
    // Its next contact is ordinary native scrolling. Power/timeConstant preserve
    // the release speed; the bounded target avoids artificial edge bouncing.
    const control = animate(from, target, {
      type: "inertia",
      velocity,
      power: 0.24,
      timeConstant: 240,
      modifyTarget: () => target,
      restDelta: 0.75,
      onUpdate: (value) => {
        if (scrollGeneration.current === revision) scroller.scrollTop = value;
      },
    });
    scrollAnimation.current = control;
    void control.finished.then(
      () => {
        if (scrollAnimation.current === control) scrollAnimation.current = null;
      },
      () => {},
    );
  }, []);

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
        if (gesture.current) {
          if (gesture.current.addedScroll > 0)
            scroller.scrollTop = gesture.current.scrollBase;
          snap(destination.current, true);
        }
        return;
      }
      if (event.button !== 0 || gesture.current) return;
      // A cancelled drag may never emit a click. A new press must not inherit
      // its suppression, including presses on controls excluded from dragging.
      suppressClick.current = false;
      stopReading();
      const target = event.target as Element;
      const fromHeader = Boolean(target.closest(headerRegion));
      const fromBody = !fromHeader && scroller.contains(target);
      const fromFooter = Boolean(target.closest(footerRegion));
      if (!fromHeader && !fromBody && !fromFooter) return;
      if (
        target.closest(editable) ||
        window.getSelection()?.isCollapsed === false
      )
        return;
      // Keep mouse text selection and ordinary button operation. Touch links
      // and disclosures remain taps until clear vertical intent takes over.
      if (
        event.pointerType === "mouse" &&
        (fromBody || (target !== grabber && target.closest(interactive)))
      )
        return;
      if (
        fromBody &&
        destination.current &&
        (!directional ||
          scroller.scrollTop > 0 ||
          performance.now() - lastScroll < scrollCooldown)
      )
        return;
      const owner = fromBody ? scroller : element;
      callbacks.current.onGrab(element);
      const height = visibleHeight(element);
      const bounds = boundsFor(element);
      stop();
      // Establish transient geometry even for a tap that interrupts arrival.
      // Pointer-up can then settle the frozen presentation back to its detent.
      renderHeight(element, height, bounds);
      gesture.current = {
        pointer: event.pointerId,
        owner,
        x: event.clientX,
        y: event.clientY,
        height,
        initialHeight: height,
        lastY: event.clientY,
        intentY: event.clientY,
        direction: 0,
        readsContent: fromBody || fromFooter,
        startedExpanded: destination.current,
        scrollBase: scroller.scrollTop,
        addedScroll: 0,
        maximumScroll: null,
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
      let remaining = drag.lastY - event.clientY;
      drag.lastY = event.clientY;
      // Keep deliberate reversal intent through a pause without interpreting
      // subpixel touch noise as a new direction.
      const intent = drag.intentY - event.clientY;
      if (Math.abs(intent) >= 4) {
        drag.direction = Math.sign(intent);
        drag.intentY = event.clientY;
      }
      // Reverse only scrolling added by this contact, then lower the surface.
      // Pre-existing content position must not trap a downward peek gesture.
      if (remaining < 0 && drag.addedScroll > 0) {
        const consumed = Math.min(-remaining, drag.addedScroll);
        drag.addedScroll -= consumed;
        scroller.scrollTop = drag.scrollBase + drag.addedScroll;
        remaining += consumed;
      }
      const resized = clampHeight(drag.height + remaining, drag.bounds);
      remaining -= resized - drag.height;
      drag.height = resized;
      renderHeight(element, resized, drag.bounds);
      if (
        drag.readsContent &&
        remaining > 0 &&
        resized === drag.bounds.expanded
      ) {
        if (drag.maximumScroll === null) {
          // Measure once at the expansion boundary, not on every pointer move.
          drag.maximumScroll = Math.max(
            0,
            scroller.scrollHeight - scroller.clientHeight,
          );
          drag.scrollBase = scroller.scrollTop;
        }
        const consumed = Math.min(
          remaining,
          Math.max(0, drag.maximumScroll - drag.scrollBase - drag.addedScroll),
        );
        drag.addedScroll += consumed;
        scroller.scrollTop = drag.scrollBase + drag.addedScroll;
      }
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
      const height = drag.height;
      // Short flicks and a last-moment reversal use recent velocity, not the
      // average of the whole drag. Pausing before release removes momentum.
      const projected = height + velocity * 0.16;
      const travel = drag.bounds.collapsed - height;
      const distance = travel >= drag.bounds.collapsed * 0.25;
      const flick =
        travel >= 32 &&
        velocity <= -600 &&
        projected < drag.bounds.collapsed * 0.75;
      if (drag.direction < 0 && (distance || flick)) {
        release();
        callbacks.current.onDismiss();
        return;
      }
      const reading =
        drag.readsContent &&
        !drag.startedExpanded &&
        ((height > drag.initialHeight + threshold && drag.direction > 0) ||
          drag.addedScroll > 0);
      const next =
        reading ||
        projected > (drag.bounds.collapsed + drag.bounds.expanded) / 2;
      snap(next, true, velocity);
      if (next && drag.addedScroll > 0)
        continueReading(Math.max(-2500, Math.min(2500, velocity)));
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
        if (gesture.current.addedScroll > 0)
          scroller.scrollTop = gesture.current.scrollBase;
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
    const wheel = (event: WheelEvent) => {
      stopReading();
      if (
        destination.current ||
        event.ctrlKey ||
        event.deltaY <= 0 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        (event.target as Element).closest(editable)
      )
        return;
      event.preventDefault();
      callbacks.current.onGrab(element);
      snap(true, true);
    };
    // One delegated listener covers header, reading content and footer controls.
    // A vertical footer swipe resizes/reads; a tap retains its ordinary action.
    const targets = [element];
    for (const target of targets) {
      target.addEventListener("pointerdown", down);
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", interrupted);
      target.addEventListener("lostpointercapture", interrupted);
      target.addEventListener("click", click, true);
    }
    scroller.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", wheel, { passive: false });
    // An arrival can move a pending press off its original hit target before
    // the drag threshold is reached. Finish that press even when pointer-up
    // lands outside the toolbar; active drags still use owner capture.
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", interrupted);
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
      element.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", interrupted);
      updateScrollAction.current = () => {};
      scroller.style.removeProperty("touch-action");
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [
    mobile,
    jobId,
    cancel,
    release,
    snap,
    stop,
    stopReading,
    continueReading,
  ]);

  // Taps/keyboard commands also change the declared scrolling behavior.
  useLayoutEffect(() => updateScrollAction.current(), [expanded]);

  return { dialog, body, handle, expanded, snap, cancel };
}
