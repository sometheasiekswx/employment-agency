"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
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
import { displayDate, safeUrl } from "@/lib/format";
import type { Application, Fact, RankedJob } from "@/lib/models";
import {
  advertisedSalary,
  applicationHref,
  requirementEvidence,
  roleStatus,
} from "./discovery";

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
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onSave: () => Promise<void>;
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
  onPrevious,
  onNext,
  onClose,
  onSave,
  onPrepare,
}: InspectorProps) {
  const { job, match } = row;
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const documentLink = useRef<HTMLAnchorElement>(null);
  const saveErrorNotice = useRef<HTMLParagraphElement>(null);
  const prepareFocusIntent = useRef<{
    jobId: string;
    previousVersion: string;
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

  useEffect(() => {
    if (!mobile) {
      closeButton.current?.focus({ preventScroll: true });
      return;
    }
    const element = dialog.current;
    if (!element) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    element.addEventListener("cancel", cancel);
    element.addEventListener("close", onClose);
    element.showModal();
    return () => {
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("close", onClose);
      if (element.open) element.close();
    };
  }, [mobile, onClose]);

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
    if (mobile && saveError)
      saveErrorNotice.current?.focus({ preventScroll: true });
  }, [mobile, saveError]);

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
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
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
            onClick={onPrevious}
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
            onClick={onNext}
          >
            <ChevronRight size={17} />
          </button>
          <button
            ref={closeButton}
            type="button"
            className="discover-icon-button"
            aria-label="Close opportunity details"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="discover-inspector-body" key={job.id}>
        <div className="discover-inspector-company">
          <span className="discover-employer-mark" aria-hidden="true">
            {job.employer.slice(0, 1)}
          </span>
          <strong>{job.employer}</strong>
          <span className={`discover-status ${status.tone}`}>
            {status.label}
          </span>
        </div>
        <h2 id={titleId}>{job.title}</h2>
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
        aria-labelledby={titleId}
        className={`discover-inspector discover-dialog ${expanded ? "is-expanded" : ""}`}
      >
        {content}
      </dialog>
    );
  return (
    <aside
      aria-labelledby={titleId}
      className="discover-inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {content}
    </aside>
  );
}
