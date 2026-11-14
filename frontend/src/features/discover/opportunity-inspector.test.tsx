import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { RankedJob } from "@/lib/models";
import { OpportunityInspector } from "./opportunity-inspector";

const motion = vi.hoisted(() => ({ animate: vi.fn() }));
vi.mock("motion", () => ({ animate: motion.animate }));
const originalAnimate = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate",
);

afterAll(() => {
  if (originalAnimate)
    Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
});

const animations: {
  element: HTMLElement;
  keyframes: { transform: string[]; opacity: number[] };
  finish: () => void;
  cancel: ReturnType<typeof vi.fn>;
}[] = [];
const sheetAnimations: {
  from: number;
  to: number;
  finish: () => void;
  stop: ReturnType<typeof vi.fn>;
}[] = [];

const row: RankedJob = {
  job: { id: "one", employer: "Example Company", title: "Engineer" },
  match: {
    eligible_for_preparation: true,
    hard_conflicts: [],
    unknowns: [],
    gaps: [],
    evidence: [],
    preferences: [],
    salary_expectation: {},
  },
};

function inspectorProps() {
  return {
    row,
    facts: [],
    timezone: "UTC",
    mobile: false,
    position: 0,
    count: 2,
    rankingCurrent: true,
    saving: false,
    saveError: "",
    animateInteractions: true,
    motionRevision: 1,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onPrepare: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  animations.length = 0;
  sheetAnimations.length = 0;
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: vi.fn(),
  });
  motion.animate.mockReset().mockImplementation((element, keyframes) => {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const cancel = vi.fn();
    const stop = vi.fn();
    if (typeof element === "number")
      sheetAnimations.push({ from: element, to: keyframes, finish, stop });
    else animations.push({ element, keyframes, finish, cancel });
    return { finished, cancel, stop };
  });
});

it("keeps a same-role reselection open when the earlier close finishes late", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  const surface = screen.getByRole("dialog");
  expect(surface).toHaveStyle({ opacity: "0.82" });
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  const close = animations.at(-1)!;
  expect(props.onClose).not.toHaveBeenCalled();

  view.rerender(<OpportunityInspector {...props} motionRevision={2} />);
  expect(close.cancel).toHaveBeenCalledOnce();
  await act(async () => close.finish());
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);

  await act(async () => animations.at(-1)!.finish());
  expect(surface.style.transform).toBe("");
  expect(surface.style.opacity).toBe("");
  expect(surface.style.willChange).toBe("");
});

it.each([true, false])(
  "copies the exact job reference or exposes it for manual copy (clipboard available: %s)",
  async (available) => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockImplementation(async () => {
      if (!available) throw new Error("Clipboard denied");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const url = available
      ? "https://jobs.example.test/positions/42"
      : undefined;
    const label =
      "Cloud Engineer — Example Company (job ID: 0123456789abcdef0123456789abcdef)";
    const reference = url ? `${label}\n${url}` : label;
    try {
      const props = inspectorProps();
      const view = render(
        <OpportunityInspector
          {...props}
          row={{
            ...row,
            job: {
              ...row.job,
              id: "0123456789abcdef0123456789abcdef",
              title: "Cloud\nEngineer",
              url,
            },
          }}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Copy job reference" }),
      );
      expect(writeText).toHaveBeenCalledExactlyOnceWith(reference);
      if (available) await screen.findByText("Copied");
      else {
        expect(
          await screen.findByRole("textbox", {
            name: "Select and copy the job reference",
          }),
        ).toHaveValue(reference);
      }
      view.rerender(
        <OpportunityInspector
          {...props}
          row={{ ...row, job: { ...row.job, id: "two", employer: "" } }}
        />,
      );
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Copy job reference" }),
      );
      expect(writeText).toHaveBeenLastCalledWith("Engineer (job ID: two)");
      if (available) await screen.findByText("Copied");
      else await screen.findByRole("textbox");
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  },
);

it("completes an intended close immediately when keyboard input or reduced motion disables animation", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  const close = animations.at(-1)!;
  view.rerender(
    <OpportunityInspector {...props} animateInteractions={false} />,
  );
  expect(close.cancel).toHaveBeenCalledOnce();
  const surface = screen.getByRole("dialog");
  expect(surface.style.transform).toBe("");
  expect(surface.style.opacity).toBe("");
  await act(async () => close.finish());
  expect(props.onClose).toHaveBeenCalledOnce();
});

it("closes keyboard and native cancellation paths without an exit delay", () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(animations).toHaveLength(1);

  view.unmount();
  const mobileProps = inspectorProps();
  render(<OpportunityInspector {...mobileProps} mobile />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("open");
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(mobileProps.onClose).toHaveBeenCalledOnce();
});

it("restores the visible native sheet and focus when a close is rejected by a draft guard", async () => {
  const props = {
    ...inspectorProps(),
    mobile: true,
    onClose: vi.fn(() => false),
  };
  render(<OpportunityInspector {...props} />);
  const dialog = screen.getByRole("dialog");
  const close = screen.getByRole("button", {
    name: "Close opportunity details",
  });
  fireEvent.click(close, { detail: 1 });
  await act(async () => animations.at(-1)!.finish());
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(dialog).toHaveAttribute("open");
  expect(dialog.style.transform).toBe("translate3d(0px, 0px, 0px)");
  expect(dialog.style.opacity).toBe("1");
  expect(close).toHaveFocus();
  (dialog as HTMLDialogElement).open = false;
  fireEvent(dialog, new Event("close"));
  expect(dialog).toHaveAttribute("open");
});

it("resizes from the live height on rapid reversal and ignores stale completions", async () => {
  render(<OpportunityInspector {...inspectorProps()} mobile />);
  const dialog = screen.getByRole("dialog");
  const body = dialog.querySelector<HTMLElement>(".discover-inspector-body")!;
  const footer = dialog.querySelector<HTMLElement>(
    ".discover-inspector-footer",
  )!;
  dialog.style.minHeight = "400px";
  dialog.style.maxHeight = "836px";
  vi.spyOn(dialog, "getBoundingClientRect")
    .mockReturnValueOnce({ height: 506.4 } as DOMRect)
    .mockReturnValueOnce({ height: 700 } as DOMRect);
  fireEvent.click(
    screen.getByRole("button", { name: "Resize opportunity details" }),
    {
      detail: 1,
    },
  );
  const expand = sheetAnimations.at(-1)!;
  expect(expand.from).toBe(506.4);
  expect(expand.to).toBe(836);
  fireEvent.click(
    screen.getByRole("button", { name: "Resize opportunity details" }),
    {
      detail: 1,
    },
  );
  expect(expand.stop).toHaveBeenCalledOnce();
  expect(sheetAnimations.at(-1)!.from).toBe(700);
  expect(sheetAnimations.at(-1)!.to).toBe(506.4);
  await act(async () => expand.finish());
  expect(dialog.style.height).toBe("700px");
  await act(async () => sheetAnimations.at(-1)!.finish());
  expect(dialog.style.height).toBe("");
  expect(body.style.height).toBe("");
  expect(footer.style.transform).toBe("");
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it.each(["pointerup", "pointercancel"])(
  "settles an interrupted arrival when pending %s lands outside the toolbar",
  async (completion) => {
    render(<OpportunityInspector {...inspectorProps()} mobile />);
    const dialog = screen.getByRole("dialog");
    const toolbar = dialog.querySelector<HTMLElement>(
      ".discover-inspector-toolbar",
    )!;
    dialog.style.minHeight = "480px";
    dialog.style.maxHeight = "836px";
    dialog.style.transform = "translate3d(0px, 81px, 0px)";
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      height: 506.4,
    } as DOMRect);
    const pointer = (type: string) =>
      Object.assign(new Event(type, { bubbles: true }), {
        isPrimary: true,
        pointerId: 7,
        pointerType: "mouse",
        button: 0,
        clientX: 36,
        clientY: 530,
      });

    fireEvent(toolbar, pointer("pointerdown"));
    expect(dialog.style.height).not.toBe("");
    // The moving surface can change the release hit target before a drag has
    // activated pointer capture. Completion must still release and settle it.
    fireEvent(window, pointer(completion));
    expect(sheetAnimations).toHaveLength(1);
    expect(sheetAnimations[0].to).toBe(506.4);
    await act(async () => sheetAnimations[0].finish());
    expect(dialog.style.height).toBe("");
    expect(dialog.style.transform).toBe("");
    expect(dialog).toHaveAttribute("open");
  },
);

it("supports instant arrow-key resizing without changing focus or replacing the native dialog", () => {
  render(
    <OpportunityInspector
      {...inspectorProps()}
      mobile
      animateInteractions={false}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const handle = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  handle.focus();
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(handle).toHaveAttribute("aria-expanded", "true");
  expect(handle).toHaveFocus();
  expect(dialog).toHaveAttribute("open");
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(handle).toHaveAttribute("aria-expanded", "false");
  expect(sheetAnimations).toHaveLength(0);
});

function touchFixture() {
  const props = { ...inspectorProps(), mobile: true };
  const view = render(<OpportunityInspector {...props} />);
  const dialog = screen.getByRole("dialog");
  const body = dialog.querySelector<HTMLElement>(".discover-inspector-body")!;
  const height = () =>
    parseFloat(dialog.style.height) ||
    (dialog.classList.contains("is-expanded") ? 836 : 506.4);
  dialog.style.minHeight = "480px";
  dialog.style.maxHeight = "836px";
  vi.spyOn(dialog, "getBoundingClientRect").mockImplementation(
    () => ({ height: height() }) as DOMRect,
  );
  Object.defineProperties(body, {
    clientHeight: { get: () => height() - 230 },
    scrollHeight: { value: 1400 },
  });
  for (const node of [dialog, body]) {
    node.setPointerCapture = vi.fn();
    node.hasPointerCapture = () => false;
  }
  const point = (
    type: string,
    y: number,
    time: number,
    target: HTMLElement | Window = body,
    primary = true,
    x = 190,
  ) => {
    const event = new Event(type, { bubbles: true });
    for (const [key, value] of Object.entries({
      isPrimary: primary,
      pointerId: primary ? 1 : 2,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
      timeStamp: time,
    }))
      Object.defineProperty(event, key, { value });
    fireEvent(target, event);
  };
  return { props, dialog, body, point, view };
}

it.each(["body", "grip", "company", "footer"])(
  "uses the same release distance in the %s region",
  async (region) => {
    const { dialog, body, point } = touchFixture();
    const grip = screen.getByRole("button", {
      name: "Resize opportunity details",
    });
    const target =
      region === "body"
        ? body
        : region === "grip"
          ? grip
          : dialog.querySelector<HTMLElement>(
              region === "company"
                ? ".discover-inspector-company"
                : ".discover-inspector-footer",
            )!;
    point("pointerdown", 700, 0, target);
    point("pointermove", 680, 200, target);
    point("pointerup", 680, 450, window);
    expect(grip).toHaveAttribute("aria-expanded", "false");
    await act(async () => sheetAnimations.at(-1)?.finish());
    point("pointerdown", 700, 600, target);
    point("pointermove", 630, 800, target);
    point("pointerup", 630, 1050, window);
    expect(grip).toHaveAttribute("aria-expanded", "true");
  },
);

it("accepts a deliberate upward flick from the grip before its distance threshold", () => {
  const { point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  point("pointerdown", 700, 0, grip);
  point("pointermove", 668, 30, grip);
  point("pointerup", 668, 40, window);
  expect(grip).toHaveAttribute("aria-expanded", "true");
});

it("does not let projected momentum expand a tiny upward flick", () => {
  const { point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  point("pointerdown", 700, 0);
  point("pointermove", 680, 10);
  point("pointerup", 680, 20, window);
  expect(grip).toHaveAttribute("aria-expanded", "false");
});

it("keeps a partly expanded body draggable during settling", async () => {
  const { dialog, point } = touchFixture();
  point("pointerdown", 700, 0);
  point("pointermove", 630, 100);
  point("pointerup", 630, 250, window);
  const previous = sheetAnimations.at(-1)!;
  dialog.style.height = "620px";
  point("pointerdown", 700, 400);
  point("pointermove", 660, 500);
  expect(previous.stop).toHaveBeenCalledOnce();
  expect(parseFloat(dialog.style.height)).toBe(660);
  point("pointerup", 660, 650, window);
  const resumed = sheetAnimations.at(-1)!;
  await act(async () => previous.finish());
  expect(dialog.style.height).not.toBe("");
  await act(async () => resumed.finish());
  expect(dialog.style.height).toBe("");
  expect(dialog.getBoundingClientRect().height).toBe(836);
});

it("lets an upward drag develop after a small initial sideways movement", () => {
  const { dialog, point } = touchFixture();
  point("pointerdown", 700, 0);
  point("pointermove", 696, 50, undefined, true, 204);
  point("pointermove", 620, 150, undefined, true, 208);
  expect(parseFloat(dialog.style.height)).toBeCloseTo(586.4);
  point("pointerup", 620, 350, window);
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "true");
});

it("expands a deliberate short body swipe and sends excess travel into reading before release", async () => {
  const { body, point } = touchFixture();
  point("pointerdown", 700, 0);
  point("pointermove", 630, 100);
  point("pointerup", 630, 250, window);
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "true");
  await act(async () => sheetAnimations.at(-1)!.finish());

  fireEvent.keyDown(
    screen.getByRole("button", { name: "Resize opportunity details" }),
    { key: "ArrowDown" },
  );
  point("pointerdown", 700, 300);
  point("pointermove", 230, 600);
  expect(body.scrollTop).toBeGreaterThan(100);
  point("pointerup", 230, 750, window);
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "true");
});

it.each(["Prepare application", "Apply later", "footer padding"])(
  "expands a short reading swipe beginning on %s without activating an action",
  (region) => {
    const { dialog, props, point } = touchFixture();
    const target =
      region === "footer padding"
        ? dialog.querySelector<HTMLElement>(".discover-inspector-footer")!
        : screen.getByRole("button", { name: region });
    point("pointerdown", 780, 0, target);
    point("pointermove", 710, 100, target);
    point("pointerup", 710, 250, window);
    expect(
      screen.getByRole("button", { name: "Resize opportunity details" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(props.onPrepare).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  },
);

it("continues a footer-origin reading swipe into the content before release", () => {
  const { body, point } = touchFixture();
  const target = screen.getByRole("button", { name: "Prepare application" });
  point("pointerdown", 790, 0, target);
  point("pointermove", 320, 300, target);
  expect(body.scrollTop).toBeGreaterThan(100);
  point("pointerup", 320, 450, window);
  expect(
    screen.getByRole("button", { name: "Resize opportunity details" }),
  ).toHaveAttribute("aria-expanded", "true");
});

it.each(["pointercancel", "second pointer"])(
  "restores owned reading and the committed detent after %s",
  async (cancellation) => {
    const { body, point } = touchFixture();
    point("pointerdown", 700, 0);
    point("pointermove", 220, 150);
    expect(body.scrollTop).toBeGreaterThan(100);
    if (cancellation === "pointercancel")
      point("pointercancel", 220, 200, window);
    else point("pointerdown", 230, 200, body, false);
    expect(body.scrollTop).toBe(0);
    expect(
      screen.getByRole("button", { name: "Resize opportunity details" }),
    ).toHaveAttribute("aria-expanded", "false");
    await act(async () => sheetAnimations.at(-1)!.finish());
  },
);

it("undoes only this contact's reading before lowering the sheet on reversal", () => {
  const { dialog, body, point } = touchFixture();
  point("pointerdown", 700, 0);
  point("pointermove", 200, 200);
  const reading = body.scrollTop;
  expect(reading).toBeGreaterThan(150);
  point("pointermove", 250, 250);
  expect(body.scrollTop).toBeCloseTo(reading - 50);
  expect(parseFloat(dialog.style.height)).toBe(836);
  point("pointermove", 450, 350);
  expect(body.scrollTop).toBe(0);
  expect(parseFloat(dialog.style.height)).toBeLessThan(836);
});

it("scrolls an expanded body to the top and lowers the sheet in the same contact", () => {
  const { dialog, body, point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  fireEvent.keyDown(grip, { key: "ArrowUp" });
  body.scrollTop = 80;
  point("pointerdown", 300, 0);
  point("pointermove", 350, 100);
  expect(body.scrollTop).toBe(30);
  expect(dialog.getBoundingClientRect().height).toBe(836);

  point("pointermove", 590, 200);
  expect(body.scrollTop).toBe(0);
  expect(dialog.getBoundingClientRect().height).toBe(626);
  point("pointerup", 590, 400, window);
  expect(grip).toHaveAttribute("aria-expanded", "false");
});

it("keeps the sheet expanded when a fast scroll barely crosses the top", () => {
  const { dialog, body, point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  fireEvent.keyDown(grip, { key: "ArrowUp" });
  body.scrollTop = 80;
  point("pointerdown", 300, 0);
  point("pointermove", 350, 25);
  point("pointermove", 384, 42);
  expect(body.scrollTop).toBe(0);
  expect(dialog.getBoundingClientRect().height).toBe(832);
  point("pointerup", 384, 45, window);
  expect(grip).toHaveAttribute("aria-expanded", "true");
});

it("stops downward reading momentum at the top of the expanded sheet", () => {
  const { dialog, body, point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  fireEvent.keyDown(grip, { key: "ArrowUp" });
  body.scrollTop = 120;
  point("pointerdown", 300, 0);
  point("pointermove", 400, 25);
  point("pointerup", 400, 30, window);
  expect(body.scrollTop).toBe(20);
  expect(grip).toHaveAttribute("aria-expanded", "true");
  expect(dialog.getBoundingClientRect().height).toBe(836);
  expect(sheetAnimations.at(-1)?.to).toBe(0);
});

it("restores the expanded reading position when a pull is cancelled", () => {
  const { body, point } = touchFixture();
  const grip = screen.getByRole("button", {
    name: "Resize opportunity details",
  });
  fireEvent.keyDown(grip, { key: "ArrowUp" });
  body.scrollTop = 80;
  point("pointerdown", 300, 0);
  point("pointermove", 520, 100);
  expect(body.scrollTop).toBe(0);
  point("pointercancel", 520, 130, window);
  expect(body.scrollTop).toBe(80);
  expect(grip).toHaveAttribute("aria-expanded", "true");
});

it("does not turn small quick downward touch noise into a dismiss", () => {
  const { props, point } = touchFixture();
  point("pointerdown", 500, 0);
  point("pointermove", 512, 10);
  point("pointerup", 512, 11, window);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(animations).toHaveLength(1);
  expect(sheetAnimations.at(-1)!.to).toBe(506.4);
});

it("does not transfer the previous role's contact scroll into a newly selected role", () => {
  const { props, body, point, view, dialog } = touchFixture();
  body.scrollTop = 40;
  point("pointerdown", 700, 0);
  point("pointermove", 200, 200);
  expect(body.scrollTop).toBeGreaterThan(100);
  view.rerender(
    <OpportunityInspector
      {...props}
      row={{ ...row, job: { ...row.job, id: "two", title: "Next role" } }}
    />,
  );
  const nextBody = dialog.querySelector<HTMLElement>(
    ".discover-inspector-body",
  )!;
  expect(nextBody).toBe(body);
  expect(nextBody.scrollTop).toBe(0);
});

it("retains a paused upward reversal instead of dismissing from its earlier downward position", () => {
  const { props, point } = touchFixture();
  point("pointerdown", 500, 0);
  point("pointermove", 700, 200);
  point("pointermove", 670, 250);
  point("pointerup", 670, 450, window);
  expect(props.onClose).not.toHaveBeenCalled();
  // A dismiss would start another surface exit rather than settling to peek.
  expect(animations).toHaveLength(1);
  expect(sheetAnimations.at(-1)!.to).toBe(506.4);
});

it("retargets a native computed exit matrix to an explicit translation identity", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  const surface = screen.getByRole("dialog");
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  const close = animations.at(-1)!;
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    element === surface
      ? ({
          transform: "matrix(1, 0, 0, 1, 11.25, 0)",
          opacity: "0.87",
        } as CSSStyleDeclaration)
      : computedStyle(element),
  );
  view.rerender(<OpportunityInspector {...props} motionRevision={2} />);
  const reopen = animations.at(-1)!;
  expect(reopen.keyframes.transform).toEqual([
    "translate3d(11.25px, 0px, 0px)",
    "translate3d(0px, 0px, 0px)",
  ]);
  await act(async () => close.finish());
  expect(props.onClose).not.toHaveBeenCalled();
  await act(async () => reopen.finish());
  expect(surface.style.transform).toBe("");
});

it("moves the mobile surface from the bottom and exits on the same path", () => {
  render(<OpportunityInspector {...inspectorProps()} mobile />);
  const surface = screen.getByRole("dialog");
  const body = surface.querySelector<HTMLElement>(".discover-inspector-body")!;
  const footer = surface.querySelector<HTMLElement>(
    ".discover-inspector-footer",
  )!;
  const identity = "translate3d(0px, 0px, 0px)";
  expect(
    animations.find((a) => a.element === surface)!.keyframes.transform[1],
  ).toBe(identity);
  expect(animations.filter((a) => a.element === body)).toHaveLength(0);
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    height: 422,
  } as DOMRect);
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  expect(animations.at(-1)!.keyframes.transform[1]).toBe(
    "translate3d(0px, 446px, 0px)",
  );
  expect(animations.filter((a) => a.element === footer)).toHaveLength(0);
  expect(footer.style.transform).toBe("");
});

it("invalidates pending close callbacks on unmount and survives Strict Mode replay", async () => {
  const props = inspectorProps();
  const view = render(
    <StrictMode>
      <OpportunityInspector {...props} />
    </StrictMode>,
  );
  expect(animations).toHaveLength(2);
  expect(animations[0].cancel).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  const close = animations.at(-1)!;
  view.unmount();
  await act(async () => close.finish());
  expect(props.onClose).not.toHaveBeenCalled();
});

it("lets explicit reselection cancel dismissal even when it also disables motion", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  const close = animations.at(-1)!;
  view.rerender(
    <OpportunityInspector
      {...props}
      animateInteractions={false}
      motionRevision={2}
    />,
  );
  await act(async () => close.finish());
  expect(props.onClose).not.toHaveBeenCalled();
});
