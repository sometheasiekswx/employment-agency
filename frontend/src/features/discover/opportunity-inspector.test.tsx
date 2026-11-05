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
    animations.push({ element, keyframes, finish, cancel });
    return { finished, cancel };
  });
});

it("keeps a same-role reselection open when the earlier close finishes late", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  const surface = screen.getByRole("complementary");
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
  expect(screen.getAllByRole("complementary")).toHaveLength(1);

  await act(async () => animations.at(-1)!.finish());
  expect(surface.style.transform).toBe("");
  expect(surface.style.opacity).toBe("");
  expect(surface.style.willChange).toBe("");
});

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
  const surface = screen.getByRole("complementary");
  expect(surface.style.transform).toBe("");
  expect(surface.style.opacity).toBe("");
  await act(async () => close.finish());
  expect(props.onClose).toHaveBeenCalledOnce();
});

it("closes keyboard and native cancellation paths without an exit delay", () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
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

it("retargets mobile content on rapid expansion while keeping the footer static", () => {
  render(<OpportunityInspector {...inspectorProps()} mobile />);
  const dialog = screen.getByRole("dialog");
  const body = dialog.querySelector<HTMLElement>(".discover-inspector-body")!;
  const footer = dialog.querySelector<HTMLElement>(
    ".discover-inspector-footer",
  )!;
  vi.spyOn(body, "getBoundingClientRect")
    .mockReturnValueOnce({ top: 450 } as DOMRect)
    .mockReturnValueOnce({ top: 90 } as DOMRect)
    .mockReturnValueOnce({ top: 115 } as DOMRect)
    .mockReturnValueOnce({ top: 450 } as DOMRect);
  fireEvent.click(screen.getByRole("button", { name: "Expand details" }), {
    detail: 1,
  });
  const expand = animations.at(-1)!;
  expect(expand.keyframes.transform).toEqual([
    "translate3d(0px, 48px, 0px)",
    "translate3d(0px, 0px, 0px)",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Collapse details" }), {
    detail: 1,
  });
  expect(expand.cancel).toHaveBeenCalledOnce();
  expect(animations.at(-1)!.keyframes.transform).toEqual([
    "translate3d(0px, -48px, 0px)",
    "translate3d(0px, 0px, 0px)",
  ]);
  expect(footer.style.transform).toBe("");
  expect(
    screen.getByRole("button", { name: "Expand details" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("retargets a native computed exit matrix to an explicit translation identity", async () => {
  const props = inspectorProps();
  const view = render(<OpportunityInspector {...props} />);
  const surface = screen.getByRole("complementary");
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

it("keeps the entire mobile footer stationary during entrance and departure", () => {
  render(<OpportunityInspector {...inspectorProps()} mobile />);
  const surface = screen.getByRole("dialog");
  const body = surface.querySelector<HTMLElement>(".discover-inspector-body")!;
  const footer = surface.querySelector<HTMLElement>(
    ".discover-inspector-footer",
  )!;
  const identity = "translate3d(0px, 0px, 0px)";
  expect(
    animations.find((animation) => animation.element === surface)?.keyframes
      .transform,
  ).toEqual([identity, identity]);
  expect(
    animations.find((animation) => animation.element === body)?.keyframes
      .transform,
  ).toEqual(["translate3d(0px, 24px, 0px)", identity]);
  fireEvent.click(
    screen.getByRole("button", { name: "Close opportunity details" }),
    { detail: 1 },
  );
  expect(animations.at(-1)!.keyframes.transform).toEqual([identity, identity]);
  expect(
    animations.filter((animation) => animation.element === footer),
  ).toHaveLength(0);
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
