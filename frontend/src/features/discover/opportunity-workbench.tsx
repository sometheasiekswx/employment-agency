"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, CircleMinus, RotateCcw, X } from "lucide-react";
import { OpportunityApplication } from "@/features/applications/opportunity-application";
import { ApplicationVersions } from "@/features/applications/application-versions";
import type { Application, Job } from "@/lib/models";
import { currentRemoval } from "@/lib/job-removal";
import "./opportunities.css";

export function OpportunityWorkbench({
  application,
  job,
  panel,
  overviewAvailable = true,
  mobile,
  onPanel,
  onClose,
  onVersion,
  onRemove,
  onRestore,
  removalFeedback,
}: {
  application: Application;
  job: Partial<Job>;
  panel: "overview" | "documents" | "activity";
  overviewAvailable?: boolean;
  mobile: boolean;
  onPanel: (panel: "overview" | "documents" | "activity") => void;
  onClose: () => boolean | void;
  onVersion: (application: Application) => void;
  onRemove?: () => void;
  onRestore?: () => void;
  removalFeedback?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const active = panel !== "overview" || !overviewAvailable;
  const removed = Boolean(currentRemoval(job));
  const removalAction = removed ? onRestore : onRemove;
  const modal = useRef(false);
  const compact = useRef(mobile);
  useLayoutEffect(() => {
    compact.current = mobile;
  }, [mobile]);
  useLayoutEffect(() => {
    if (!active) return;
    const element = dialog.current;
    if (element) {
      const cancel = (event: Event) => {
        if (event.target !== element) return;
        event.preventDefault();
        onClose();
      };
      const closed = (event: Event) => {
        // A responsive mode change closes and immediately reopens this same
        // node. Ignore that queued close and nested editor close events.
        if (event.target !== element || element.open) return;
        if (onClose() === false && !element.open) {
          if (modal.current) element.showModal();
          else element.show();
        }
      };
      element.addEventListener("cancel", cancel);
      element.addEventListener("close", closed);
      modal.current = compact.current;
      if (modal.current) {
        element.showModal();
        heading.current?.focus({ preventScroll: true });
      } else {
        element.show();
        close.current?.focus({ preventScroll: true });
      }
      return () => {
        element.removeEventListener("cancel", cancel);
        element.removeEventListener("close", closed);
        if (element.open) element.close();
      };
    }
  }, [active, onClose]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!active || !element) return;
    const updateMode = () => {
      if (modal.current === mobile || element.querySelector("dialog[open]"))
        return;
      // Keep the editor and its state mounted across the breakpoint. Defer
      // changing the parent top-layer mode until any nested modal has closed.
      const focused = document.activeElement as HTMLElement | null;
      element.close();
      modal.current = mobile;
      if (mobile) element.showModal();
      else element.show();
      if (focused?.isConnected && element.contains(focused))
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
  }, [mobile, active]);
  const content = (
    <>
      <header className="opportunities-workbench-header">
        <div>
          <p>{application.employer}</p>
          <h2 id="opportunity-workbench-title" ref={heading} tabIndex={-1}>
            {application.title}
          </h2>
        </div>
        <div className="opportunities-workbench-actions">
          <button
            ref={close}
            type="button"
            className="discover-icon-button"
            aria-label="Close application workspace"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <nav className="opportunities-detail-tabs" aria-label="Role workspace">
        <button
          type="button"
          aria-pressed={panel === "overview"}
          onClick={() => onPanel("overview")}
        >
          <ArrowLeft size={14} /> Overview
        </button>
        <button
          type="button"
          aria-pressed={panel === "documents"}
          onClick={() => onPanel("documents")}
        >
          Documents
        </button>
        <button
          type="button"
          aria-pressed={panel === "activity"}
          onClick={() => onPanel("activity")}
        >
          Activity
        </button>
      </nav>
      {panel !== "overview" && (
        <ApplicationVersions application={application} onSelect={onVersion} />
      )}
      <div className="opportunities-workbench-scroll">
        {removalFeedback}
        {panel === "overview" && (
          <section className="opportunities-overview-unavailable">
            <h3>Listing overview unavailable</h3>
            <p>
              This role is outside the current results or its listing is no
              longer available. Your saved documents and activity are still
              available.
            </p>
            <button type="button" onClick={() => onPanel("documents")}>
              Review saved documents
            </button>
          </section>
        )}
        <div hidden={panel === "overview"}>
          <OpportunityApplication
            key={application.id}
            application={application}
            job={job}
            tab={panel === "activity" ? "activity" : "documents"}
          />
        </div>
        {removalAction && (
          <div className="opportunities-role-actions">
            <button
              type="button"
              className="secondary"
              aria-label={`${removed ? "Restore" : "Remove"} ${application.title}`}
              onClick={removalAction}
            >
              {removed ? (
                <RotateCcw size={17} aria-hidden="true" />
              ) : (
                <CircleMinus size={17} aria-hidden="true" />
              )}
              {removed ? "Restore" : "Remove"}
            </button>
          </div>
        )}
      </div>
    </>
  );
  return (
    <dialog
      ref={dialog}
      hidden={!active}
      className={`opportunities-workbench${mobile ? " opportunities-workbench-dialog" : ""}`}
      aria-labelledby="opportunity-workbench-title"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          event.target instanceof Element &&
          event.target.closest("dialog") === event.currentTarget
        ) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {content}
    </dialog>
  );
}
