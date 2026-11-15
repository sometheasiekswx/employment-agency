"use client";

import { useLayoutEffect, useRef } from "react";

interface Position {
  x: number;
  y: number;
}

const movingParts =
  ":scope > header, :scope > .discover-card, :scope > .discover-match-heading, :scope > .discover-stack-heading";
const settling = { duration: 200, easing: "cubic-bezier(.16,1,.3,1)" };

/** Measured grid placement and FLIP share one lifecycle, including resizes. */
export function useBoardLayout(scope: string, animate: boolean) {
  const board = useRef<HTMLDivElement>(null);
  const memory = useRef({
    scope: "",
    columns: 0,
    width: 0,
    minimumHeight: 0,
    placements: new Map<string, number>(),
    positions: new Map<HTMLElement, Position>(),
    animations: new Map<HTMLElement, Animation>(),
  });
  const motion = useRef(animate);

  useLayoutEffect(() => {
    motion.current = animate;
    if (!animate) {
      memory.current.animations.forEach((animation) => animation.cancel());
      memory.current.animations.clear();
    }
  }, [animate]);

  useLayoutEffect(() => {
    const element = board.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const state = memory.current;
    const sections = [
      ...element.querySelectorAll<HTMLElement>(".discover-column"),
    ];
    let frame = 0;
    const pack = () => {
      const width = element.getBoundingClientRect().width;
      const resized = state.width !== 0 && Math.abs(state.width - width) > 0.5;
      state.width = width;
      // Release old explicit tracks before measuring the responsive grid. A
      // former third column otherwise creates an implicit track on mobile.
      sections.forEach((section) => {
        section.style.gridColumnStart = "";
        section.style.gridRowStart = "";
      });
      const style = getComputedStyle(element);
      const columns = style.gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      const reset = state.scope !== scope || state.columns !== columns;
      if (reset) {
        state.scope = scope;
        state.columns = columns;
        state.placements.clear();
        state.minimumHeight = 0;
      }
      const row = parseFloat(style.getPropertyValue("--discover-row-size"));
      const gap = parseFloat(style.getPropertyValue("--discover-group-gap"));
      if (!columns || !row) return;
      const spans = sections.map((section) =>
        Math.ceil((section.getBoundingClientRect().height + gap) / row),
      );
      const ends = Array<number>(columns).fill(0);
      sections.forEach((section, index) => {
        const id = section.dataset.companyId!;
        let column = state.placements.get(id);
        if (column === undefined) {
          column = ends.indexOf(Math.min(...ends));
          state.placements.set(id, column);
        }
        section.style.gridColumnStart = String(column + 1);
        section.style.gridRowStart = String(ends[column] + 1);
        section.style.gridRowEnd = `span ${spans[index]}`;
        ends[column] += spans[index];
      });
      element.dataset.compact = "true";
      // Keep the scroll extent while reviewing, including near the page bottom.
      // Otherwise the browser clamps scrollY when the tallest column shrinks.
      state.minimumHeight = Math.max(
        state.minimumHeight,
        Math.max(...ends) * row,
      );
      element.style.minHeight = `${state.minimumHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`;

      const origin = element.getBoundingClientRect();
      const parts = sections.flatMap((section) => [
        ...section.querySelectorAll<HTMLElement>(movingParts),
      ]);
      // Finish every read before writing transforms. Current transforms let a
      // rapid second action continue from the visible position, not the old end.
      const measured = parts.map((part) => {
        const animation = state.animations.get(part);
        const matrix = animation
          ? new DOMMatrixReadOnly(getComputedStyle(part).transform)
          : undefined;
        const offset = { x: matrix?.m41 ?? 0, y: matrix?.m42 ?? 0 };
        const rect = part.getBoundingClientRect();
        return {
          part,
          animation,
          offset,
          position: {
            x: rect.x - origin.x - offset.x,
            y: rect.y - origin.y - offset.y,
          },
        };
      });
      for (const [part, animation] of state.animations) {
        if (!part.isConnected || reset || resized) {
          animation.cancel();
          state.animations.delete(part);
        }
      }
      const next = new Map<HTMLElement, Position>();
      const track = (part: HTMLElement, animation: Animation) => {
        state.animations.set(part, animation);
        void animation.finished
          .catch(() => {})
          .finally(() => {
            if (state.animations.get(part) === animation)
              state.animations.delete(part);
          });
      };
      for (const { part, animation, offset, position } of measured) {
        const previous = state.positions.get(part);
        next.set(part, position);
        // Resizing follows the viewport directly; mutation motion should not
        // trail behind a window resize or an inspector changing board width.
        if (
          reset ||
          resized ||
          !motion.current ||
          typeof part.animate !== "function"
        )
          continue;
        if (!previous) {
          // Restored content arrives while its neighbours make room, avoiding
          // a fully opaque card covering the moving content during Undo.
          track(
            part,
            part.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 160,
              easing: "ease-out",
            }),
          );
          continue;
        }
        if (
          Math.abs(previous.x - position.x) < 0.5 &&
          Math.abs(previous.y - position.y) < 0.5
        )
          continue;
        const dx = previous.x + offset.x - position.x;
        const dy = previous.y + offset.y - position.y;
        animation?.cancel();
        const movement = part.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          settling,
        );
        track(part, movement);
      }
      state.positions = next;
    };

    // Measure each committed render, including compact-card/header changes
    // whose IDs did not change. This runs before focus restoration and paint.
    pack();
    // Font/image/viewport changes can resize the grid itself. Defer observer
    // writes to the next frame to avoid a ResizeObserver feedback loop.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(pack);
    });
    observer.observe(element);
    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  useLayoutEffect(() => {
    const animations = memory.current.animations;
    return () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
  }, []);
  return board;
}
