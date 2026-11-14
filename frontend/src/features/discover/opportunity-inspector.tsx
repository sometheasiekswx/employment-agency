"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { animate, type AnimationOptions } from "motion";
import {
  Bookmark,
  CircleMinus,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Action } from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { displayDate, safeUrl } from "@/lib/format";
import type { Application, Fact, RankedJob } from "@/lib/models";
import {
  advertisedSalary,
  remainingEvidenceGaps,
  requirementEvidence,
  pendingActionLabel,
  roleStatus,
} from "./discovery";
import { OpportunityCareerEvidence } from "./opportunity-career-evidence";
import { OpportunityListingLink } from "./opportunity-listing-link";
import { useSheetGesture } from "./use-sheet-gesture";
import { currentRemoval } from "@/lib/job-removal";
import "./inspector-motion.css";

type InspectorAnimation = ReturnType<typeof animate>;
type AnimationSlot = { current: InspectorAnimation | null };
type InspectorFrame = { x: number; y: number; opacity: number };
export type RolePanel = "overview" | "documents" | "files" | "activity";

const arrival = { type: "spring", duration: 0.46, bounce: 0.08 } as const;
const settle = { duration: 0.2, ease: [0.16, 1, 0.3, 1] } as const;
const restingFrame = { x: 0, y: 0, opacity: 1 };

function isBackdropPointer(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } =
    event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left ||
    event.clientX > right ||
    event.clientY < top ||
    event.clientY > bottom
  );
}

function frameTransform({ x, y }: InspectorFrame) {
  return `translate3d(${x}px, ${y}px, 0px)`;
}

function currentFrame(element: HTMLElement): InspectorFrame {
  const style = getComputedStyle(element);
  const matrix = style.transform.match(/^matrix(3d)?\(([^)]+)\)$/);
  const values = matrix?.[2].split(",").map(Number);
  const translation = style.transform.match(/^translate3d\(([^)]+)\)$/);
  const coordinates = translation?.[1].split(",").map(parseFloat);
  // Computed styles are matrices in browsers. Keep only our translation so
  // interruption always interpolates matching translate3d keyframes.
  const x = values?.[matrix?.[1] ? 12 : 4] ?? coordinates?.[0] ?? 0;
  const y = values?.[matrix?.[1] ? 13 : 5] ?? coordinates?.[1] ?? 0;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    opacity: Number(style.opacity) || 1,
  };
}

function freezeSurface(slot: AnimationSlot, element: HTMLElement) {
  const frame = currentFrame(element);
  stopMotion(slot, element);
  element.style.transform = frameTransform(frame);
}

function stopMotion(slot: AnimationSlot, element: HTMLElement | null) {
  const animation = slot.current;
  slot.current = null;
  // stop() commits an intermediate MotionValue and can reapply it next frame.
  // Our explicit start frames allow cancellation without that frozen value.
  animation?.cancel();
  element?.style.removeProperty("transform");
  element?.style.removeProperty("opacity");
  element?.style.removeProperty("will-change");
}

function playMotion(
  slot: AnimationSlot,
  element: HTMLElement,
  from: InspectorFrame,
  to: InspectorFrame,
  options: AnimationOptions,
  onComplete?: () => void,
  retainEnd = false,
) {
  stopMotion(slot, element);
  // Unsupported runtimes retain the ordinary visible, interactive surface.
  if (typeof element.animate !== "function") {
    onComplete?.();
    return;
  }
  element.style.transform = frameTransform(from);
  element.style.opacity = String(from.opacity);
  element.style.willChange = "transform, opacity";
  const animation = animate(
    element,
    {
      transform: [frameTransform(from), frameTransform(to)],
      opacity: [from.opacity, to.opacity],
    },
    options,
  );
  slot.current = animation;
  void animation.finished.then(
    () => {
      if (slot.current !== animation) return;
      stopMotion(slot, element);
      if (retainEnd) {
        element.style.transform = frameTransform(to);
        element.style.opacity = String(to.opacity);
      }
      onComplete?.();
    },
    () => {
      if (slot.current === animation) stopMotion(slot, element);
    },
  );
}

interface InspectorProps {
  companyReview?: ReactNode;
  row: RankedJob;
  application?: Application;
  facts: Fact[];
  timezone: string;
  mobile: boolean;
  position: number;
  count: number;
  rankingCurrent: boolean;
  assessmentAvailable?: boolean;
  hasListingRecord?: boolean;
  onAddEvidence?: (requirement: string, details: string) => Promise<void>;
  saving: boolean;
  saveError: string;
  preview?: boolean;
  animateInteractions?: boolean;
  motionRevision?: number;
  panel?: RolePanel;
  onOpenPanel?: (panel: RolePanel) => void;
  applicationContent?: ReactNode;
  submissionRecord?: ReactNode;
  agentProgress?: ReactNode;
  canChangePending?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => boolean | void;
  onSave: (button?: HTMLButtonElement) => Promise<void>;
  onPrepare: () => Promise<void>;
  onRemove?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  removalFeedback?: ReactNode;
  removalEditor?: ReactNode;
  reasonEditorId?: string;
}

function CopyJobReference({ job }: { job: RankedJob["job"] }) {
  const [result, setResult] = useState<"copied" | "manual">();
  const title = job.title.replace(/\s+/g, " ").trim();
  const company = job.employer.replace(/\s+/g, " ").trim();
  const role = [title, company].filter(Boolean).join(" — ");
  const label = `${role} (job ID: ${job.id})`;
  const listing = safeUrl(job.url);
  const reference = listing ? `${label}\n${listing}` : label;

  return (
    <div className="discover-job-reference">
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(reference);
            setResult("copied");
          } catch {
            setResult("manual");
          }
        }}
      >
        <Copy size={16} aria-hidden="true" /> Copy job reference
      </button>
      <span role="status">
        {result === "copied"
          ? "Copied"
          : result === "manual"
            ? "Clipboard access unavailable"
            : ""}
      </span>
      {result === "manual" && (
        <label>
          Select and copy the job reference
          <textarea
            readOnly
            rows={listing ? 3 : 2}
            value={reference}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}

export function OpportunityInspector({
  row,
  application,
  facts,
  timezone,
  mobile,
  position,
  count,
  rankingCurrent,
  assessmentAvailable = true,
  hasListingRecord = true,
  onAddEvidence,
  companyReview,
  saving,
  saveError,
  preview = false,
  animateInteractions = false,
  motionRevision = 0,
  panel = "overview",
  onOpenPanel,
  applicationContent,
  submissionRecord,
  agentProgress,
  canChangePending = true,
  onPrevious,
  onNext,
  onClose,
  onSave,
  onPrepare,
  onRemove,
  onRestore,
  removalFeedback,
  removalEditor,
  reasonEditorId,
}: InspectorProps) {
  const { canLeave } = useDraft();
  const { job, match } = row;
  const removed = Boolean(currentRemoval(job));
  const titleId = useId();
  const surfaceAnimation = useRef<InspectorAnimation | null>(null);
  const bodyAnimation = useRef<InspectorAnimation | null>(null);
  const closeGeneration = useRef(0);
  const closing = useRef(false);
  const backdropPress = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const previousMotion = useRef<{
    surface: HTMLElement;
    jobId: string;
    position: number;
    revision: number;
  } | null>(null);
  const reasonFocusIntent = useRef("");
  const title = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const assessmentSummary = useRef<HTMLParagraphElement>(null);
  const footer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const saveErrorNotice = useRef<HTMLParagraphElement>(null);
  const [headingOverflow, setHeadingOverflow] = useState(false);
  const navigationFocusIntent = useRef<{
    jobId: string;
    button: HTMLButtonElement;
  } | null>(null);
  const modal = useRef(false);
  const mobileMode = useRef(mobile);
  const readingPanel = useRef({ panel, jobId: job.id });
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const {
    dialog,
    body,
    handle: sheetHandle,
    expanded,
    snap: snapSheet,
    cancel: cancelSheet,
    resetReading,
  } = useSheetGesture({
    mobile,
    animateInteractions,
    jobId: job.id,
    onDismiss: () => requestClose(true),
    onGrab: (element) => freezeSurface(surfaceAnimation, element),
  });
  useLayoutEffect(() => {
    if (!reasonEditorId) {
      reasonFocusIntent.current = "";
      return;
    }
    const intent = `${mobile}:${reasonEditorId}`;
    if (reasonFocusIntent.current === intent) return;
    reasonFocusIntent.current = intent;
    if (mobile) snapSheet(true, animateInteractions);
    body.current?.scrollTo?.({ top: 0 });
    const textarea = body.current?.querySelector<HTMLTextAreaElement>(
      ".removal-reason-editor textarea",
    );
    textarea?.focus({ preventScroll: true });
    if (!mobile) textarea?.scrollIntoView?.({ block: "nearest" });
  }, [reasonEditorId, mobile, snapSheet, animateInteractions, body]);
  const status = roleStatus(job, application, preview);
  const advert = safeUrl(job.url);
  const careers = safeUrl(job.careers_url);
  const companyUrl = job.employer.trim()
    ? careers || (advert && new URL(advert).origin)
    : undefined;
  const submitted = application?.status === "submitted";
  const historicalSubmission =
    job.prior_application === "submitted" && !submitted;
  const hasDecision =
    Boolean(application) ||
    Boolean(
      job.prior_application === "submitted" ||
      job.prior_application === "rejected",
    );
  const readingApplication = panel !== "overview" && Boolean(application);

  const restoreRejectedClose = useCallback(() => {
    closing.current = false;
    cancelSheet();
    stopMotion(surfaceAnimation, dialog.current);
    stopMotion(bodyAnimation, body.current);
    const element = dialog.current;
    // Reset Motion's rendered value as well as inline styles: a queued final
    // render from the rejected exit must not put the modal offscreen again.
    if (element)
      playMotion(surfaceAnimation, element, restingFrame, restingFrame, {
        duration: 0,
      });
    if (element && !element.open) {
      if (modal.current) element.showModal();
      else element.show();
    }
    closeButton.current?.focus({ preventScroll: true });
  }, [body, cancelSheet, dialog]);

  const closeImmediately = useCallback(() => {
    cancelSheet();
    closeGeneration.current += 1;
    closing.current = false;
    stopMotion(surfaceAnimation, dialog.current);
    stopMotion(bodyAnimation, body.current);
    if (onCloseRef.current() === false) restoreRejectedClose();
  }, [cancelSheet, body, dialog, restoreRejectedClose]);

  useLayoutEffect(() => {
    mobileMode.current = mobile;
  }, [mobile]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const cancel = (event: Event) => {
      if (event.target !== element) return;
      event.preventDefault();
      closeImmediately();
    };
    const closed = (event: Event) => {
      if (event.target !== element || element.open) return;
      closeImmediately();
    };
    element.addEventListener("cancel", cancel);
    element.addEventListener("close", closed);
    modal.current = mobileMode.current;
    if (modal.current) element.showModal();
    else element.show();
    (modal.current ? sheetHandle.current : closeButton.current)?.focus({
      preventScroll: true,
    });
    return () => {
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("close", closed);
      if (element.open) element.close();
    };
  }, [closeImmediately, dialog, sheetHandle]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const updateMode = () => {
      if (modal.current === mobile || element.querySelector("dialog[open]"))
        return;
      const focused = document.activeElement as HTMLElement | null;
      element.close();
      modal.current = mobile;
      if (mobile) element.showModal();
      else element.show();
      if (focused && element.contains(focused))
        focused.focus({ preventScroll: true });
    };
    updateMode();
    const observer = new MutationObserver(updateMode);
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, [mobile, dialog]);

  const evidence = requirementEvidence(
    assessmentAvailable ? match.evidence : undefined,
    facts,
    job,
  );
  const evidenceGaps = remainingEvidenceGaps(match.gaps, evidence);
  const openPanel = (next: RolePanel) => {
    if (next !== panel) onOpenPanel?.(next);
  };
  const warnings = [
    ...new Set([
      ...match.unknowns,
      ...evidenceGaps.map((gap) => `Missing evidence: ${gap}`),
    ]),
  ];
  const checks = [
    ...new Set([
      ...match.hard_conflicts,
      ...match.unknowns,
      ...(assessmentAvailable || job.eligibility === "confirmed"
        ? []
        : [
            job.eligibility === "conflict"
              ? "Confirmed work-rights conflict"
              : "Work rights / sponsorship need confirmation",
          ]),
    ]),
  ];
  const summary = [
    ...checks.slice(0, evidenceGaps.length ? 2 : 3),
    ...(evidenceGaps.length ? [`Evidence gap: ${evidenceGaps[0]}`] : []),
  ];
  const hasAssessmentSummary = !readingApplication && summary.length > 0;
  useLayoutEffect(() => {
    const previous = readingPanel.current;
    readingPanel.current = { panel, jobId: job.id };
    if (mobile && readingApplication) snapSheet(true, false);
    else if (mobile && (previous.jobId !== job.id || previous.panel !== panel))
      snapSheet(false, false);
    resetReading();
    if (
      previous.jobId === job.id &&
      previous.panel === "overview" &&
      panel === "documents" &&
      (!document.activeElement ||
        document.activeElement === document.body ||
        dialog.current?.contains(document.activeElement))
    )
      body.current
        ?.querySelector<HTMLElement>(".application-document-toolbar h3")
        ?.focus({ preventScroll: true });
  }, [
    body,
    dialog,
    job.id,
    mobile,
    panel,
    readingApplication,
    resetReading,
    snapSheet,
  ]);

  useLayoutEffect(() => {
    const sheet = dialog.current;
    const reading = body.current;
    const summary = assessmentSummary.current;
    const actions = footer.current;
    if (!mobile || !sheet || !reading) return;
    if (!summary || !actions) {
      sheet.style.removeProperty("--discover-peek-content");
      return;
    }

    function fitAssessment() {
      if (
        !sheet?.open ||
        sheet.style.height ||
        !reading ||
        !summary ||
        !actions
      )
        return;
      const summaryEnd =
        summary.getBoundingClientRect().bottom -
        sheet.getBoundingClientRect().top +
        reading.scrollTop;
      // Leave a little space between the final check and the action bar.
      const contentHeight = Math.ceil(summaryEnd + actions.offsetHeight + 12);
      const height = `${Math.min(contentHeight, Math.round(window.innerHeight * 0.8))}px`;
      if (sheet.style.getPropertyValue("--discover-peek-content") !== height)
        sheet.style.setProperty("--discover-peek-content", height);
    }

    fitAssessment();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fitAssessment);
    observer.observe(summary);
    observer.observe(actions);
    if (title.current) observer.observe(title.current);
    if (reading.previousElementSibling)
      observer.observe(reading.previousElementSibling);
    return () => observer.disconnect();
  }, [mobile, dialog, body, job.id, expanded, hasAssessmentSummary]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = previousMotion.current;
    const newSurface = previous?.surface !== element;
    const wasClosing = closing.current;
    const reselected =
      previous &&
      (previous.jobId !== job.id || previous.revision !== motionRevision);
    closeGeneration.current += 1;
    closing.current = false;
    previousMotion.current = {
      surface: element,
      jobId: job.id,
      position,
      revision: motionRevision,
    };

    if (!animateInteractions) {
      stopMotion(surfaceAnimation, element);
      stopMotion(bodyAnimation, body.current);
      if (wasClosing && !reselected && onClose() === false)
        restoreRejectedClose();
      return;
    }

    if (newSurface || wasClosing) {
      playMotion(
        surfaceAnimation,
        element,
        newSurface
          ? {
              x: mobile ? 0 : 24,
              y: mobile ? element.getBoundingClientRect().height : 0,
              opacity: mobile ? 1 : 0.82,
            }
          : currentFrame(element),
        restingFrame,
        mobile ? { type: "spring", duration: 0.32, bounce: 0 } : arrival,
      );
    }
    if (!newSurface && previous?.jobId !== job.id && body.current) {
      // Replace one body in place; never retain a second interactive assessment.
      playMotion(
        bodyAnimation,
        body.current,
        {
          x: position < previous.position ? -12 : 12,
          y: 0,
          opacity: 0.72,
        },
        restingFrame,
        settle,
      );
    }
  }, [
    animateInteractions,
    mobile,
    motionRevision,
    job.id,
    position,
    onClose,
    body,
    dialog,
    restoreRejectedClose,
  ]);

  useLayoutEffect(() => {
    const element = heading.current;
    if (!mobile || !element || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setHeadingOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [mobile, job.id, job.title, job.employer, job.hiring_employer_verified]);

  useLayoutEffect(
    () => () => {
      closeGeneration.current += 1;
      stopMotion(surfaceAnimation, previousMotion.current?.surface ?? null);
      stopMotion(bodyAnimation, body.current);
      previousMotion.current = null;
      closing.current = false;
    },
    [body],
  );

  const requestClose = (pointer: boolean) => {
    const element = dialog.current;
    if (!pointer || !animateInteractions || !element) {
      closeImmediately();
      return;
    }
    const generation = ++closeGeneration.current;
    closing.current = true;
    const frame = currentFrame(element);
    cancelSheet(true);
    const departure = {
      duration: mobile ? 0.22 : 0.14,
      ease: [0.32, 0.72, 0, 1],
    } as const;
    playMotion(
      surfaceAnimation,
      element,
      frame,
      {
        x: mobile ? 0 : 18,
        y: mobile ? element.getBoundingClientRect().height + 24 : 0,
        opacity: mobile ? 1 : 0.6,
      },
      departure,
      () => {
        if (generation !== closeGeneration.current) return;
        closing.current = false;
        if (onClose() === false) restoreRejectedClose();
      },
      true,
    );
  };

  useEffect(() => {
    const intent = navigationFocusIntent.current;
    if (!intent || intent.jobId === job.id) return;
    navigationFocusIntent.current = null;
    // A newly disabled navigation button can lose focus to body in Chrome.
    // Consume only the user's navigation intent; refreshes never move focus.
    if (
      intent.button.disabled &&
      (document.activeElement === intent.button ||
        document.activeElement === document.body)
    )
      title.current?.focus({ preventScroll: true });
  }, [job.id, position, count]);

  useEffect(() => {
    if (mobile && saveError)
      saveErrorNotice.current?.focus({ preventScroll: true });
  }, [mobile, saveError]);

  const navigate = (button: HTMLButtonElement, change: () => void) => {
    navigationFocusIntent.current =
      button === document.activeElement ? { jobId: job.id, button } : null;
    change();
  };

  const company = (
    <div className="discover-inspector-company">
      <span className="discover-employer-mark" aria-hidden="true">
        {job.employer.slice(0, 1)}
      </span>
      <strong>
        {companyUrl ? (
          <a
            className="discover-source-link"
            href={companyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {job.employer}
          </a>
        ) : (
          job.employer
        )}
      </strong>
      <span className={`discover-status ${status.tone}`}>{status.label}</span>
    </div>
  );
  const roleHeading = (
    <>
      <div
        ref={heading}
        className="role-workspace-heading"
        data-overflow={mobile && headingOverflow ? "true" : undefined}
        tabIndex={mobile && headingOverflow ? 0 : undefined}
      >
        {company}
        {job.hiring_employer_verified === false && (
          <p className="role-employer-unconfirmed">
            Hiring employer unconfirmed
          </p>
        )}
        <h2 id={titleId} ref={title} tabIndex={-1}>
          {advert ? (
            <a
              className="discover-source-link"
              href={advert}
              target="_blank"
              rel="noopener noreferrer"
            >
              {job.title}
            </a>
          ) : (
            job.title
          )}
        </h2>
      </div>
      <div className="role-listing-row">
        {advert ? (
          <OpportunityListingLink url={advert} className="role-listing-link">
            View job listing
          </OpportunityListingLink>
        ) : (
          <p className="role-listing-link muted">Job listing unavailable</p>
        )}
      </div>
      {application && onOpenPanel && (
        <div
          className="opportunities-detail-tabs"
          role="group"
          aria-label="Role workspace"
        >
          {(
            [
              ["overview", "Overview"],
              ["documents", "CV"],
              ["files", "Documents"],
              ["activity", "Activity"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={panel === value}
              onClick={() => openPanel(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
  const preparationNote = (
    <>
      {!preview && !hasDecision && !match.eligible_for_preparation && (
        <p className="discover-preparation-note">
          Resolve the flagged requirements or update your search profile before
          preparing a draft.
        </p>
      )}
      {preview && !application && (
        <p className="discover-preparation-note">
          Uses the résumé selected in{" "}
          <Link href="/career/#import-resume">Career profile</Link>.
        </p>
      )}
    </>
  );
  const content = (
    <>
      <div
        className={
          mobile ? "discover-sheet-header" : "discover-inspector-header"
        }
      >
        {mobile && (
          <button
            ref={sheetHandle}
            className="discover-sheet-expand"
            type="button"
            aria-label="Resize opportunity details"
            aria-expanded={expanded}
            onClick={(event) => {
              stopMotion(bodyAnimation, body.current);
              snapSheet(!expanded, event.detail > 0);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              snapSheet(event.key === "ArrowUp", false);
            }}
          >
            <span className="visually-hidden">
              Drag up to expand or down to close. Tap to resize.
            </span>
          </button>
        )}
        <header className="discover-inspector-toolbar">
          <span>{mobile ? "Role" : "Role workspace"}</span>
          <div className="discover-inspector-navigation">
            <button
              type="button"
              className="discover-icon-button"
              aria-label="Previous opportunity"
              disabled={position === 0}
              onClick={(event) => navigate(event.currentTarget, onPrevious)}
            >
              <ChevronLeft size={17} />
            </button>
            <span aria-live="polite">
              {position + 1} of {count}
            </span>
            <button
              type="button"
              className="discover-icon-button"
              aria-label="Next opportunity"
              disabled={position === count - 1}
              onClick={(event) => navigate(event.currentTarget, onNext)}
            >
              <ChevronRight size={17} />
            </button>
            <button
              ref={closeButton}
              type="button"
              className="discover-icon-button"
              aria-label="Close opportunity details"
              onClick={(event) => requestClose(event.detail > 0)}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        {mobile && roleHeading}
      </div>
      <div ref={body} className="discover-inspector-body">
        {!mobile && roleHeading}
        {/* The role changes independently of the mounted scroll container. */}
        <div key={job.id}>
          {removalEditor}
          {agentProgress}
          {submissionRecord}
          <div hidden={readingApplication}>
            <p className="discover-role-location">
              <span>
                <MapPin size={15} />
                {job.location || job.city || "Location unconfirmed"}
              </span>
              <span>
                {job.work_arrangement || "Work arrangement unconfirmed"}
              </span>
            </p>
            <p className="discover-inspector-salary">{advertisedSalary(job)}</p>
            {hasAssessmentSummary && (
              <p
                ref={assessmentSummary}
                className="discover-assessment-summary"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  <strong>
                    {match.hard_conflicts.length
                      ? "Preparation blocked"
                      : "Check before applying"}
                  </strong>
                  {summary.map((check) => (
                    <span key={check} className="discover-assessment-check">
                      {check}
                    </span>
                  ))}
                </span>
              </p>
            )}
            {!mobile && preparationNote}
            {hasListingRecord && <CopyJobReference job={job} />}
            {companyReview && (
              <details className="role-secondary">
                <summary>Company research</summary>
                {companyReview}
              </details>
            )}
            <OpportunityCareerEvidence
              job={job}
              rows={evidence}
              assessmentAvailable={assessmentAvailable}
              onAddEvidence={onAddEvidence}
            />
            <section className="discover-evidence-section">
              <h3>Listing details</h3>
              {match.hard_conflicts.length > 0 && (
                <div className="discover-checks conflict">
                  <h4>Preparation is blocked</h4>
                  <ul>
                    {match.hard_conflicts.map((conflict) => (
                      <li key={conflict}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div className="discover-checks">
                  <ul>
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="discover-listing-details">
                <div>
                  <dt>Work eligibility</dt>
                  <dd>
                    {job.eligibility === "confirmed"
                      ? "Confirmed in the job record"
                      : job.eligibility === "conflict"
                        ? "Confirmed conflict"
                        : "Needs confirmation"}
                  </dd>
                </div>
                <div>
                  <dt>Sponsorship</dt>
                  <dd>
                    {job.sponsorship === "yes"
                      ? "Advert says available"
                      : job.sponsorship === "no"
                        ? "Advert says unavailable"
                        : "Not stated / unconfirmed"}
                  </dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>{job.availability || "Unconfirmed"}</dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{displayDate(job.checked_at, timezone)}</dd>
                </div>
                <div>
                  <dt>Posted</dt>
                  <dd>{displayDate(job.posted_at, timezone)}</dd>
                </div>
                {job.reposted_at && (
                  <div>
                    <dt>Reposted</dt>
                    <dd>{displayDate(job.reposted_at, timezone)}</dd>
                  </div>
                )}
                <div>
                  <dt>Deadline</dt>
                  <dd>{displayDate(job.closes, timezone)}</dd>
                </div>
              </dl>
            </section>
            {job.description && (
              <section className="discover-evidence-section">
                <h3>About the opportunity</h3>
                <p className="discover-job-description">{job.description}</p>
              </section>
            )}
            {submitted && (
              <p className="discover-submission-note">
                <ShieldCheck size={17} />
                {preview
                  ? "No application was sent."
                  : "The recorded submission keeps its exact document snapshot."}
              </p>
            )}
            {historicalSubmission && (
              <p className="discover-submission-note">
                <ShieldCheck size={17} />
                An earlier submission is recorded.
                {job.submission_time && (
                  <>
                    {" "}
                    {displayDate(job.submission_time.at, timezone)}
                    {job.submission_time.assumed ? " (time assumed)." : "."}
                  </>
                )}
                {application
                  ? " The local draft is a separate version."
                  : " The submitted document version is unknown."}
              </p>
            )}
          </div>
          {applicationContent}
        </div>
      </div>
      <footer ref={footer} className="discover-inspector-footer">
        <div className="discover-inspector-actions">
          {removed && !application && onRestore ? (
            <Action
              previewAllowed
              className="discover-primary"
              aria-label={`Restore ${job.title}`}
              run={onRestore}
            >
              <RotateCcw size={17} /> Restore role
            </Action>
          ) : application ? null : job.prior_application === "rejected" ? (
            <Link className="button discover-primary" href="/?section=rejected">
              <FileText size={17} />
              View application records
            </Link>
          ) : historicalSubmission ? null : (
            <Action
              previewAllowed
              className="discover-primary"
              disabled={
                !rankingCurrent || (!preview && !match.eligible_for_preparation)
              }
              run={async () => {
                if (canLeave()) await onPrepare();
              }}
            >
              <Sparkles size={17} />
              Prepare application
            </Action>
          )}
          {hasListingRecord && canChangePending && (
            <Action
              previewAllowed
              keepContentWhileBusy
              data-opportunity-id={job.id}
              className={`secondary discover-pending-button ${job.saved ? "is-saved" : ""}`}
              disabled={saving}
              aria-pressed={Boolean(job.saved)}
              aria-label={pendingActionLabel(job.saved)}
              run={onSave}
            >
              <Bookmark
                aria-hidden="true"
                size={17}
                fill={job.saved ? "currentColor" : "none"}
              />
              {job.saved ? "To apply" : pendingActionLabel(false)}
            </Action>
          )}
          {removed && application && onRestore && (
            <Action
              previewAllowed
              keepContentWhileBusy
              className="discover-icon-button"
              aria-label={`Restore ${job.title}`}
              title="Restore role"
              run={onRestore}
            >
              <RotateCcw size={17} />
            </Action>
          )}
          {!removed && onRemove && (
            <button
              type="button"
              className="discover-icon-button"
              aria-label={`Remove ${job.title}`}
              title="Remove role"
              onClick={(event) => {
                navigationFocusIntent.current = {
                  jobId: job.id,
                  button: event.currentTarget,
                };
                void onRemove();
              }}
            >
              <CircleMinus size={17} />
            </button>
          )}
        </div>
        {removalFeedback}
        {mobile && saveError && (
          <p
            ref={saveErrorNotice}
            className="discover-inspector-save-error"
            role="alert"
            tabIndex={-1}
          >
            {saveError} Your previous To apply choice is shown. Retry the
            action.
          </p>
        )}
        {mobile && preparationNote}
      </footer>
    </>
  );

  return (
    <dialog
      ref={dialog}
      data-inspector-motion={animateInteractions ? "on" : "off"}
      aria-labelledby={titleId}
      className={`discover-inspector${mobile ? " discover-dialog" : ""}${expanded ? " is-expanded" : ""}${readingApplication ? " is-reading-application" : ""}`}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !modal.current &&
          event.target instanceof Element &&
          event.target.closest("dialog") === event.currentTarget
        ) {
          event.preventDefault();
          closeImmediately();
        }
      }}
      onPointerDown={(event) => {
        backdropPress.current =
          event.isPrimary && event.button === 0 && isBackdropPointer(event)
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null;
      }}
      onPointerMove={(event) => {
        const press = backdropPress.current;
        if (
          press?.id === event.pointerId &&
          Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8
        )
          backdropPress.current = null;
      }}
      onPointerCancel={() => {
        backdropPress.current = null;
      }}
      onPointerUp={(event) => {
        const press = backdropPress.current;
        backdropPress.current = null;
        // Some touch sequences end without a compatibility click.
        if (press?.id === event.pointerId && isBackdropPointer(event))
          requestClose(true);
      }}
    >
      {content}
    </dialog>
  );
}
