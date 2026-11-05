"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { animate, type AnimationOptions } from "motion";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Action } from "@/components/controls";
import { applicationHref, displayDate, safeUrl } from "@/lib/format";
import type { Application, Fact, RankedJob } from "@/lib/models";
import { advertisedSalary, requirementEvidence, roleStatus } from "./discovery";
import "./inspector-motion.css";

type InspectorAnimation = ReturnType<typeof animate>;
type AnimationSlot = { current: InspectorAnimation | null };
type InspectorFrame = { x: number; y: number; opacity: number };

const arrival = { type: "spring", duration: 0.46, bounce: 0.08 } as const;
const settle = { duration: 0.2, ease: [0.16, 1, 0.3, 1] } as const;
const restingFrame = { x: 0, y: 0, opacity: 1 };

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
      onComplete?.();
    },
    () => {
      if (slot.current === animation) stopMotion(slot, element);
    },
  );
}

interface InspectorProps {
  row: RankedJob;
  application?: Application;
  facts: Fact[];
  timezone: string;
  mobile: boolean;
  position: number;
  count: number;
  rankingCurrent: boolean;
  saving: boolean;
  saveError: string;
  preview?: boolean;
  animateInteractions?: boolean;
  motionRevision?: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onSave: (button?: HTMLButtonElement) => Promise<void>;
  onPrepare: () => Promise<void>;
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
  saving,
  saveError,
  preview = false,
  animateInteractions = false,
  motionRevision = 0,
  onPrevious,
  onNext,
  onClose,
  onSave,
  onPrepare,
}: InspectorProps) {
  const { job, match } = row;
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const surfaceAnimation = useRef<InspectorAnimation | null>(null);
  const bodyAnimation = useRef<InspectorAnimation | null>(null);
  const closeGeneration = useRef(0);
  const closing = useRef(false);
  const previousMotion = useRef<{
    surface: HTMLElement;
    jobId: string;
    position: number;
    revision: number;
  } | null>(null);
  const expansionOrigin = useRef<{ element: HTMLElement; top: number } | null>(
    null,
  );
  const title = useRef<HTMLHeadingElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const documentLink = useRef<HTMLAnchorElement>(null);
  const saveErrorNotice = useRef<HTMLParagraphElement>(null);
  const prepareFocusIntent = useRef<{
    jobId: string;
    previousVersion: string;
  } | null>(null);
  const navigationFocusIntent = useRef<{
    jobId: string;
    button: HTMLButtonElement;
  } | null>(null);
  const [prepareFocusSignal, setPrepareFocusSignal] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const evidence = requirementEvidence(match.evidence, facts);
  const status = roleStatus(job, application);
  const advert = safeUrl(job.url);
  const submitted = application?.status === "submitted";
  const historicalSubmission =
    job.prior_application === "submitted" && !submitted;
  const hasDecision =
    Boolean(application) ||
    Boolean(
      job.prior_application === "submitted" ||
      job.prior_application === "rejected",
    );

  const closeImmediately = useCallback(() => {
    closeGeneration.current += 1;
    closing.current = false;
    stopMotion(surfaceAnimation, mobile ? dialog.current : inspector.current);
    stopMotion(bodyAnimation, body.current);
    onClose();
  }, [mobile, onClose]);

  useLayoutEffect(() => {
    if (!mobile) {
      closeButton.current?.focus({ preventScroll: true });
      return;
    }
    const element = dialog.current;
    if (!element) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      closeImmediately();
    };
    element.addEventListener("cancel", cancel);
    element.addEventListener("close", closeImmediately);
    element.showModal();
    return () => {
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("close", closeImmediately);
      if (element.open) element.close();
    };
  }, [mobile, closeImmediately]);

  useLayoutEffect(() => {
    const element = mobile ? dialog.current : inspector.current;
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
      if (wasClosing && !reselected) onClose();
      return;
    }

    if (newSurface || wasClosing) {
      playMotion(
        surfaceAnimation,
        element,
        newSurface
          ? {
              x: mobile ? 0 : 24,
              y: 0,
              opacity: 0.82,
            }
          : currentFrame(element),
        restingFrame,
        arrival,
      );
      if (mobile && body.current) {
        // The native sheet and its complete footer remain anchored. Its
        // scrolling assessment carries the arrival and dismissal movement.
        playMotion(
          bodyAnimation,
          body.current,
          newSurface ? { x: 0, y: 24, opacity: 1 } : currentFrame(body.current),
          restingFrame,
          arrival,
        );
      }
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
  }, [animateInteractions, mobile, motionRevision, job.id, position, onClose]);

  useLayoutEffect(() => {
    const origin = expansionOrigin.current;
    expansionOrigin.current = null;
    const element = body.current;
    if (
      !animateInteractions ||
      !origin ||
      !element ||
      origin.element !== element
    )
      return;
    const offset = Math.max(
      -48,
      Math.min(48, origin.top - element.getBoundingClientRect().top),
    );
    // Only the scrolling content carries continuity. Native sheet geometry and
    // its footer immediately take their usable destination positions.
    playMotion(
      bodyAnimation,
      element,
      { x: 0, y: offset, opacity: 1 },
      restingFrame,
      { type: "spring", duration: 0.36, bounce: 0 },
    );
  }, [expanded, animateInteractions]);

  useLayoutEffect(
    () => () => {
      closeGeneration.current += 1;
      stopMotion(surfaceAnimation, previousMotion.current?.surface ?? null);
      stopMotion(bodyAnimation, body.current);
      previousMotion.current = null;
      closing.current = false;
    },
    [],
  );

  const requestClose = (pointer: boolean) => {
    const element = mobile ? dialog.current : inspector.current;
    if (!pointer || !animateInteractions || !element) {
      closeImmediately();
      return;
    }
    const generation = ++closeGeneration.current;
    closing.current = true;
    const departure = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;
    if (mobile && body.current) {
      playMotion(
        bodyAnimation,
        body.current,
        currentFrame(body.current),
        { x: 0, y: 20, opacity: 1 },
        departure,
      );
    }
    playMotion(
      surfaceAnimation,
      element,
      currentFrame(element),
      {
        x: mobile ? 0 : 18,
        y: 0,
        opacity: 0.6,
      },
      departure,
      () => {
        if (generation !== closeGeneration.current) return;
        closing.current = false;
        onClose();
      },
    );
  };

  useEffect(() => {
    const intent = prepareFocusIntent.current;
    if (!intent) return;
    if (intent.jobId !== job.id) {
      prepareFocusIntent.current = null;
      return;
    }
    if (application && application.id !== intent.previousVersion) {
      documentLink.current?.focus({ preventScroll: true });
      prepareFocusIntent.current = null;
    }
  }, [prepareFocusSignal, application, job.id]);

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

  const warnings = [
    ...new Set([
      ...match.unknowns,
      ...match.gaps.map((gap) => `Missing evidence: ${gap}`),
    ]),
  ];
  const content = (
    <>
      {mobile && (
        <button
          className="discover-sheet-expand"
          type="button"
          aria-expanded={expanded}
          onClick={(event) => {
            if (animateInteractions && event.detail > 0 && body.current) {
              expansionOrigin.current = {
                element: body.current,
                top: body.current.getBoundingClientRect().top,
              };
              stopMotion(bodyAnimation, body.current);
            } else {
              expansionOrigin.current = null;
              stopMotion(bodyAnimation, body.current);
            }
            setExpanded((value) => !value);
          }}
        >
          <ChevronUp size={16} />
          {expanded ? "Collapse details" : "Expand details"}
        </button>
      )}
      <header className="discover-inspector-toolbar">
        <span>Opportunity details</span>
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
      <div ref={body} className="discover-inspector-body" key={job.id}>
        <div className="discover-inspector-company">
          <span className="discover-employer-mark" aria-hidden="true">
            {job.employer.slice(0, 1)}
          </span>
          <strong>{job.employer}</strong>
          <span className={`discover-status ${status.tone}`}>
            {status.label}
          </span>
        </div>
        <h2 id={titleId} ref={title} tabIndex={-1}>
          {job.title}
        </h2>
        <p className="discover-role-location">
          <span>
            <MapPin size={15} />
            {job.location || job.city || "Location unconfirmed"}
          </span>
          <span>{job.work_arrangement || "Work arrangement unconfirmed"}</span>
        </p>
        <p className="discover-inspector-salary">{advertisedSalary(job)}</p>
        <p className="discover-source-label">
          {advert
            ? "Employer / source listing"
            : "Imported job record · Source link unavailable"}
        </p>
        <section className="discover-evidence-section">
          <h3>
            <Sparkles size={17} /> Why this fits
          </h3>
          <p className="discover-explanation">
            Related evidence is a starting point. Verify the full requirement.
          </p>
          {evidence.length ? (
            evidence.map((item, index) => (
              <div
                className="discover-evidence-row"
                key={`${item.requirement}-${index}`}
              >
                <span
                  className={
                    item.facts.length
                      ? "discover-evidence-mark"
                      : "discover-evidence-mark missing"
                  }
                >
                  {item.facts.length ? (
                    <Check size={15} />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                </span>
                <div>
                  <strong>{item.requirement}</strong>
                  {!item.facts.length && (
                    <p>No confirmed supporting evidence</p>
                  )}
                  {item.facts.length > 0 && (
                    <details>
                      <summary title={item.assessment}>
                        Related evidence ({item.facts.length}{" "}
                        {item.facts.length === 1 ? "fact" : "facts"})
                      </summary>
                      <ul>
                        {item.facts.map((fact) => (
                          <li key={fact.id}>
                            {fact.text}
                            {fact.source?.name && (
                              <small>Source: {fact.source.name}</small>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="discover-explanation">
              No structured requirements are available. Read the original
              listing and add the missing requirements in Search preferences.
            </p>
          )}
        </section>
        <section className="discover-evidence-section">
          <h3>Requirements to check</h3>
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
          {!warnings.length && !match.hard_conflicts.length && (
            <p className="discover-explanation">
              No additional checks were flagged by this assessment. Review the
              full advert before applying.
            </p>
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
            The recorded submission keeps its exact document snapshot.
          </p>
        )}
        {historicalSubmission && (
          <p className="discover-submission-note">
            <ShieldCheck size={17} />
            An earlier submission is recorded. Local draft documents remain a
            separate version.
          </p>
        )}
      </div>
      <footer className="discover-inspector-footer">
        <div className="discover-inspector-actions">
          {application ? (
            <Link
              ref={documentLink}
              className="button discover-primary"
              href={applicationHref(application)}
            >
              <FileText size={17} />
              {submitted
                ? "View submission"
                : application.status === "rejected"
                  ? "View decision"
                  : historicalSubmission
                    ? "Review preserved draft"
                    : "Review documents"}
            </Link>
          ) : hasDecision ? (
            <Link
              className="button discover-primary"
              href={`/?section=${job.prior_application === "rejected" ? "rejected" : "submitted"}`}
            >
              <FileText size={17} />
              View application records
            </Link>
          ) : (
            <Action
              className="discover-primary"
              disabled={!rankingCurrent || !match.eligible_for_preparation}
              run={async () => {
                prepareFocusIntent.current = {
                  jobId: job.id,
                  previousVersion: "",
                };
                try {
                  await onPrepare();
                  setPrepareFocusSignal((value) => value + 1);
                } catch (error) {
                  prepareFocusIntent.current = null;
                  throw error;
                }
              }}
            >
              <Sparkles size={17} />
              Prepare draft
            </Action>
          )}
          {advert && (
            <a
              className="button discover-advert"
              aria-label="View advert"
              href={advert}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowUpRight size={17} />
              <span>View advert</span>
            </a>
          )}
          <Action
            previewAllowed
            keepContentWhileBusy
            data-opportunity-id={job.id}
            className={`discover-icon-button ${job.saved ? "is-saved" : ""}`}
            disabled={saving}
            aria-label={`${job.saved ? "Unsave" : "Save"} ${job.title}`}
            aria-pressed={Boolean(job.saved)}
            run={onSave}
          >
            <Bookmark size={17} fill={job.saved ? "currentColor" : "none"} />
          </Action>
        </div>
        {mobile && saveError && (
          <p
            ref={saveErrorNotice}
            className="discover-inspector-save-error"
            role="alert"
            tabIndex={-1}
          >
            {saveError} The saved change could not be confirmed; retry the save
            control.
          </p>
        )}
        {!hasDecision && !match.eligible_for_preparation && (
          <p className="discover-preparation-note">
            Resolve the flagged requirements or update your search profile
            before preparing a draft.
          </p>
        )}
        {preview && !application && (
          <p className="discover-preparation-note">
            View the existing example documents in Applications. Prepare your
            own drafts with the local app.
          </p>
        )}
        <p className="discover-footer-note">
          <ShieldCheck size={14} />
          {submitted
            ? "Submitted documents stay preserved."
            : "You review the documents and control submission."}
        </p>
      </footer>
    </>
  );

  if (mobile)
    return (
      <dialog
        ref={dialog}
        data-inspector-motion={animateInteractions ? "on" : "off"}
        aria-labelledby={titleId}
        className={`discover-inspector discover-dialog ${expanded ? "is-expanded" : ""}`}
      >
        {content}
      </dialog>
    );
  return (
    <aside
      ref={inspector}
      data-inspector-motion={animateInteractions ? "on" : "off"}
      aria-labelledby={titleId}
      className="discover-inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeImmediately();
        }
      }}
    >
      {content}
    </aside>
  );
}
