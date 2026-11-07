"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion";

const threshold = 8;
const interactive =
  "button, a, input, textarea, select, summary, [contenteditable], [role='button']";
const editable = "input, textarea, select, [contenteditable]";
const headerRegion = ".discover-sheet-header";
const footerRegion = ".discover-inspector-footer";

type Bounds = { collapsed: number; expanded: number };
type Sample = { y: number; height: number; time: number };
type Gesture = {
  pointer: number;
  owner: HTMLElement;
  scroller: HTMLElement;
  x: number;
  y: number;
  height: number;
  initialHeight: number;
  lastY: number;
  intentY: number;
  direction: number;
  readsContent: boolean;
  startedExpanded: boolean;
  startingScroll: number;
  scrollTop: number;
  scrollFloor: number;
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

function restoreReading(drag: Gesture) {
  if (drag.scrollTop !== drag.startingScroll)
    drag.scroller.scrollTop = drag.startingScroll;
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
      stop();
      release();
      if (!preservePresentation) {
        dialog.current?.style.removeProperty("height");
        dialog.current?.style.removeProperty("transform");
        if (active) restoreReading(active);
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
    // Reading momentum stays inside the content, including at the top edge.
    // Only a finger still in contact can transfer travel to the sheet.
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
    const abortDrag = () => {
      const drag = gesture.current;
      if (!drag) return;
      restoreReading(drag);
      snap(destination.current, true);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) {
        abortDrag();
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
      const owner = fromBody ? scroller : element;
      callbacks.current.onGrab(element);
      const bounds = boundsFor(element);
      const presentationHeight = clampHeight(visibleHeight(element), bounds);
      const fromExpandedBody =
        fromBody &&
        destination.current &&
        bounds.expanded - presentationHeight < 1;
      const height = fromExpandedBody ? bounds.expanded : presentationHeight;
      stop();
      // Establish transient geometry even for a tap that interrupts arrival.
      // Pointer-up can then settle the frozen presentation back to its detent.
      renderHeight(element, height, bounds);
      const startingScroll = Math.max(0, scroller.scrollTop);
      gesture.current = {
        pointer: event.pointerId,
        owner,
        scroller,
        x: event.clientX,
        y: event.clientY,
        height,
        initialHeight: height,
        lastY: event.clientY,
        intentY: event.clientY,
        direction: 0,
        readsContent: fromBody || fromFooter,
        startedExpanded: destination.current,
        startingScroll,
        scrollTop: startingScroll,
        scrollFloor: fromExpandedBody ? 0 : startingScroll,
        maximumScroll: null,
        bounds,
        active: false,
        samples: [{ y: event.clientY, height, time: event.timeStamp }],
      };
    };
    const move = (event: PointerEvent) => {
      const drag = gesture.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const dy = event.clientY - drag.y;
      if (!drag.active) {
        // Small sideways drift must not permanently abandon an upward gesture.
        // The sheet owns vertical touch movement; pinch zoom remains native.
        if (Math.abs(event.clientX - drag.x) >= threshold)
          suppressClick.current = true;
        if (Math.abs(dy) < threshold) return;
        drag.active = true;
        suppressClick.current = true;
        drag.owner.setPointerCapture(event.pointerId);
        element.setAttribute("data-sheet-dragging", "");
      }
      drag.samples = drag.samples.filter(
        (sample) => event.timeStamp - sample.time <= 80,
      );
      let remaining = drag.lastY - event.clientY;
      drag.lastY = event.clientY;
      // Keep deliberate reversal intent through a pause without interpreting
      // subpixel touch noise as a new direction.
      const intent = drag.intentY - event.clientY;
      if (Math.abs(intent) >= 4) {
        drag.direction = Math.sign(intent);
        drag.intentY = event.clientY;
      }
      // A touch starting in the expanded body unwinds reading to the top.
      // Peek and grip drags unwind only the reading added by this contact.
      const availableScroll = drag.scrollTop - drag.scrollFloor;
      if (remaining < 0 && availableScroll > 0) {
        const consumed = Math.min(-remaining, availableScroll);
        drag.scrollTop -= consumed;
        scroller.scrollTop = drag.scrollTop;
        remaining += consumed;
      }
      const resized = clampHeight(drag.height + remaining, drag.bounds);
      if (resized !== drag.height) {
        remaining -= resized - drag.height;
        drag.height = resized;
        renderHeight(element, resized, drag.bounds);
      }
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
          drag.scrollTop = Math.max(0, scroller.scrollTop);
          drag.scrollFloor = Math.min(drag.scrollFloor, drag.scrollTop);
        }
        drag.scrollTop = Math.min(
          drag.maximumScroll,
          drag.scrollTop + remaining,
        );
        scroller.scrollTop = drag.scrollTop;
      }
      drag.samples.push({
        y: event.clientY,
        height: drag.height,
        time: event.timeStamp,
      });
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
      const rate = elapsed > 0 ? 1000 / elapsed : 0;
      const fingerVelocity = first ? (first.y - event.clientY) * rate : 0;
      const height = drag.height;
      const reading = drag.readsContent && height === drag.bounds.expanded;
      // Project from recent sheet movement so travel consumed by reading
      // cannot turn a small pull into a flick. A pause clears both velocities.
      const sheetVelocity = first ? (height - first.height) * rate : 0;
      const projected = height + sheetVelocity * 0.16;
      const travel = drag.bounds.collapsed - height;
      const distance = travel >= drag.bounds.collapsed * 0.25;
      const flick =
        travel >= 32 &&
        sheetVelocity <= -600 &&
        projected < drag.bounds.collapsed * 0.75;
      if (drag.direction < 0 && (distance || flick)) {
        release();
        callbacks.current.onDismiss();
        return;
      }
      const growth = height - drag.initialHeight;
      const expandDistance = Math.max(
        threshold,
        (drag.bounds.expanded - drag.initialHeight) * 0.2,
      );
      // Every region uses the same release rule. A deliberate flick can commit
      // before the distance threshold; tiny touch noise cannot.
      const expanding =
        drag.direction > 0 &&
        (drag.startedExpanded ||
          growth >= expandDistance ||
          (growth >= 32 && sheetVelocity >= 600));
      const next =
        (reading && drag.startedExpanded) ||
        expanding ||
        drag.scrollTop > drag.scrollFloor ||
        ((drag.startedExpanded || drag.direction <= 0) &&
          projected > (drag.bounds.collapsed + drag.bounds.expanded) / 2);
      snap(next, true, sheetVelocity);
      if (next && reading)
        continueReading(Math.max(-2500, Math.min(2500, fingerVelocity)));
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
      if (gesture.current?.pointer === event.pointerId) abortDrag();
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const resize = () => cancel();
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
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", interrupted);
    element.addEventListener("lostpointercapture", interrupted);
    element.addEventListener("click", click, true);
    element.addEventListener("wheel", wheel, { passive: false });
    // An arrival can move a pending press off its original hit target before
    // the drag threshold is reached. Finish that press even when pointer-up
    // lands outside the toolbar; active drags still use owner capture.
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", interrupted);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      cancel();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", interrupted);
      element.removeEventListener("lostpointercapture", interrupted);
      element.removeEventListener("click", click, true);
      element.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", interrupted);
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

  return { dialog, body, handle, expanded, snap, cancel };
}
