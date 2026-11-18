"use client";

import { useLayoutEffect, useRef } from "react";
import {
  createGooeyEngine,
  GOOEY_MARGIN,
  type GooeyLayout,
  type GooeyPalette,
} from "./gooey-selection-engine";
import "./gooey-selection.css";

const staticPreference = "(prefers-reduced-motion: reduce), (forced-colors: active)";

function rgb(value: string): GooeyPalette["pillRgb"] {
  // Computed sRGB colors serialize as rgb(a) or color(srgb), including color-mix().
  const srgb = value.startsWith("color(srgb ");
  const channels = value.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
  const [red = 0, green = 0, blue = 0, alpha = 1] = channels;
  const divisor = srgb ? 1 : 255;
  return [red / divisor, green / divisor, blue / divisor, alpha];
}

function readPalette(layer: HTMLElement): GooeyPalette {
  const style = getComputedStyle(layer);
  return {
    pillRgb: rgb(style.color),
    hoverRgb: rgb(style.outlineColor),
    shadow: Number(style.getPropertyValue("--gooey-shadow")),
  };
}

function matchesLayout(previous: GooeyLayout | null, next: GooeyLayout) {
  return previous && previous.width === next.width && previous.height === next.height &&
    previous.ratio === next.ratio && previous.rects.length === next.rects.length &&
    previous.rects.every((rect, index) => {
      const nextRect = next.rects[index];
      return rect.x === nextRect.x && rect.y === nextRect.y &&
        rect.w === nextRect.w && rect.h === nextRect.h;
    });
}

function labelFor(control: HTMLElement, bounds: DOMRect) {
  const box = control.getBoundingClientRect();
  const type = getComputedStyle(control);
  const label = document.createElement("span");
  label.className = `${control.className} gooey-selection-label`;
  label.append(...Array.from(control.childNodes, (child) => child.cloneNode(true)));
  label.querySelectorAll("[data-gooey-anchor]").forEach((anchor) => anchor.remove());
  label.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  Object.assign(label.style, {
    position: "absolute",
    boxSizing: "border-box",
    left: `${box.left - bounds.left}px`,
    top: `${box.top - bounds.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    fontFamily: type.fontFamily,
    fontSize: type.fontSize,
    fontWeight: type.fontWeight,
    lineHeight: type.lineHeight,
    letterSpacing: type.letterSpacing,
    color: "var(--gooey-ink, var(--ink))",
    background: "none",
    boxShadow: "none",
    borderColor: "transparent",
  });
  return label;
}

/** Renders the GooeyNav selection behind native, direct sibling controls.
 * An optional [data-gooey-anchor] defines the visible pill inside a larger hit area.
 */
export function GooeySelection({
  selectedKey,
  activeSelector,
}: {
  selectedKey: string;
  activeSelector: string;
}) {
  const layerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);
  const selectRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const group = layer?.parentElement;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!layer || !group || !canvas || !overlay || typeof window.WebGL2RenderingContext !== "function") return;

    const preference = window.matchMedia(staticPreference);
    let engine: ReturnType<typeof createGooeyEngine> = null;
    let triedContext = false;
    let lostContext = false;
    let layout: GooeyLayout | null = null;
    let items: HTMLElement[] = [];
    let active: HTMLElement | null = null;
    let hovered: HTMLElement | null = null;
    let disposed = false;

    const refreshLayout = (force = false) => {
      if (!engine || preference.matches || lostContext) return;
      const bounds = layer.getBoundingClientRect();
      // Keep the shader's full drawing surface without adding page scroll at the viewport edge.
      const leftBleed = Math.min(GOOEY_MARGIN, Math.max(0, bounds.left));
      const rightBleed = Math.min(GOOEY_MARGIN, Math.max(0, document.documentElement.clientWidth - bounds.right));
      layer.style.setProperty("--gooey-margin", `${GOOEY_MARGIN}px`);
      layer.style.setProperty("--gooey-left-bleed", `${leftBleed}px`);
      layer.style.setProperty("--gooey-right-bleed", `${rightBleed}px`);
      const next: GooeyLayout = {
        width: bounds.width,
        height: bounds.height,
        ratio: Math.min(window.devicePixelRatio || 1, 2),
        rects: items.map((item) => {
          const box = (item.querySelector("[data-gooey-anchor]") ?? item).getBoundingClientRect();
          return { x: box.left - bounds.left, y: box.top - bounds.top, w: box.width, h: box.height };
        }),
      };
      if (!force && matchesLayout(layout, next)) return;
      layout = next;
      overlay.replaceChildren(...items.map((item) => labelFor(item, bounds)));
      engine.resize(next);
    };

    const suspend = () => {
      group.removeAttribute("data-gooey-rendering");
      engine?.stop();
      layout = null;
    };

    const renderSelection = (itemsChanged = false, previousActive: HTMLElement | null = null) => {
      if (preference.matches || lostContext || !active) {
        suspend();
        return;
      }
      const starting = !triedContext;
      if (starting) {
        triedContext = true;
        engine = createGooeyEngine(canvas, overlay, group, readPalette(layer));
      }
      if (!engine) return;
      if (itemsChanged) engine.stop();
      refreshLayout(itemsChanged);
      if (starting && previousActive && !itemsChanged) engine.go(items.indexOf(previousActive));
      engine.go(items.indexOf(active));
      group.setAttribute("data-gooey-rendering", "");
    };

    const resize = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => refreshLayout(true))
      : null;
    resize?.observe(group);

    selectRef.current = () => {
      const nextActive = group.querySelector<HTMLElement>(activeSelector);
      // Both host groups put their native controls directly next to the layer.
      const nextItems = nextActive
        ? Array.from(group.children).filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element.tagName === nextActive.tagName)
        : items;
      const itemsChanged = items.length !== nextItems.length ||
        items.some((item, index) => item !== nextItems[index]);
      if (itemsChanged) {
        for (const item of items) resize?.unobserve(item);
        for (const item of nextItems) resize?.observe(item);
        items = nextItems;
      }
      const previousActive = active;
      active = nextActive;
      // A real change before the first frame still starts from the initial selection.
      if (engine || triedContext || (previousActive && previousActive !== active)) {
        renderSelection(itemsChanged, previousActive);
      }
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
      const target = event.target;
      const index = items.findIndex((item) => item.contains(target));
      if (index < 0) return;
      hovered = items[index];
      if (!preference.matches && !lostContext) engine?.setHover(index);
    };
    const onLeave = () => {
      hovered = null;
      if (!preference.matches && !lostContext) engine?.setHover(-1);
    };

    const syncPreference = () => {
      renderSelection();
      const index = hovered ? items.indexOf(hovered) : -1;
      if (index >= 0 && !preference.matches && !lostContext) engine?.setHover(index);
    };

    const loseContext = (event: Event) => {
      event.preventDefault();
      lostContext = true;
      suspend();
      engine?.destroy();
      engine = null;
    };
    const restoreContext = () => {
      triedContext = false;
      lostContext = false;
      syncPreference();
    };

    // Avoid allocating shaders during a development-only mount that React immediately cleans up.
    const start = requestAnimationFrame(syncPreference);
    const onResize = () => refreshLayout();
    const theme = new MutationObserver(() => {
      if (engine && !preference.matches && !lostContext) engine.updatePalette(readPalette(layer));
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.fonts?.ready.then(() => {
      if (!disposed) refreshLayout(true);
    });
    preference.addEventListener("change", syncPreference);
    window.addEventListener("resize", onResize);
    group.addEventListener("pointerover", onOver);
    group.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("webglcontextlost", loseContext);
    canvas.addEventListener("webglcontextrestored", restoreContext);

    return () => {
      disposed = true;
      cancelAnimationFrame(start);
      suspend();
      engine?.destroy();
      selectRef.current = null;
      overlay.replaceChildren();
      theme.disconnect();
      resize?.disconnect();
      preference.removeEventListener("change", syncPreference);
      window.removeEventListener("resize", onResize);
      group.removeEventListener("pointerover", onOver);
      group.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", loseContext);
      canvas.removeEventListener("webglcontextrestored", restoreContext);
    };
  }, [activeSelector]);

  useLayoutEffect(() => {
    selectRef.current?.();
  }, [activeSelector, selectedKey]);

  return (
    <span ref={layerRef} className="gooey-selection" aria-hidden="true" inert>
      <span className="gooey-selection-canvas-frame">
        <canvas ref={canvasRef} className="gooey-selection-canvas" />
      </span>
      <span ref={overlayRef} className="gooey-selection-text" />
    </span>
  );
}
