"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import { safeUrl } from "@/lib/format";
import type { Job } from "@/lib/models";
import { publicPreviewEnabled } from "@/lib/public-preview";
import "./opportunity-source-preview.css";

type OpportunitySourceKind = "listing" | "careers" | "source";

type PreviewJob = Pick<
  Job,
  "title" | "employer" | "location" | "city" | "description" | "url"
>;

type OpenSource = (
  event: MouseEvent<HTMLAnchorElement>,
  job: PreviewJob,
  kind: OpportunitySourceKind,
) => void;

const SourceContext = createContext<OpenSource>(() => {});

export function useOpenOpportunitySource() {
  return useContext(SourceContext);
}

function isMobileSourceClick(event: MouseEvent<HTMLAnchorElement>) {
  // Installed apps handle the ordinary link navigation in the native browser.
  if (/(?:^|\s)EmploymentAgencyMobile\/1(?:\s|$)/.test(navigator.userAgent))
    return false;
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    window.matchMedia?.("(pointer: coarse) and (hover: none)").matches === true
  );
}

function websiteFrameUrl(url: string) {
  const target = new URL(url);
  const host = target.hostname;
  if (
    target.protocol !== "https:" ||
    target.port ||
    target.username ||
    target.password ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    ) ||
    /\.(?:localhost|local|localdomain|internal|home|lan|test|invalid|example|onion|arpa|ts\.net)$/.test(
      host,
    ) ||
    host.length > 253
  )
    return undefined;
  return `/api/listing-preview-frame?host=${encodeURIComponent(host)}#${encodeURIComponent(target.href)}`;
}

type Source = {
  job: PreviewJob;
  kind: OpportunitySourceKind;
  url: string;
  opener: HTMLAnchorElement;
  frame?: string;
};

type Viewer = {
  source: Source | null;
  frames: string[];
  lastFrame?: string;
  showWebsite: boolean;
};

export function OpportunitySourceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState<Viewer>({
    source: null,
    frames: [],
    showWebsite: false,
  });
  const openSource = useCallback<OpenSource>((event, job, kind) => {
    if (publicPreviewEnabled() || !isMobileSourceClick(event)) return;
    event.preventDefault();
    const opener = event.currentTarget;
    const url = opener.href;
    const frame = websiteFrameUrl(url);
    setViewer((current) => ({
      source: { job, kind, url, opener, frame },
      // Keep the current site and the most recently used alternative. Moving a
      // retained iframe in the DOM would reload it, so its position stays stable.
      frames:
        frame && !current.frames.includes(frame)
          ? [
              ...current.frames.filter((url) => url === current.lastFrame),
              frame,
            ]
          : current.frames,
      lastFrame: frame ?? current.lastFrame,
      showWebsite: false,
    }));
  }, []);

  const { source, frames, showWebsite } = viewer;
  const dialog = useRef<HTMLDialogElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const title = useId();
  const open = source !== null;
  const listing = source?.kind === "listing";
  const host = source ? new URL(source.url).host : "";
  const destination =
    source?.kind === "careers"
      ? "Careers site"
      : listing
        ? "Original listing"
        : "Listing source";

  useLayoutEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    done.current?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
    };
  }, [open]);

  const hidePreview = useCallback(() => {
    setViewer((current) => ({ ...current, source: null, showWebsite: false }));
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("popstate", hidePreview);
    return () => window.removeEventListener("popstate", hidePreview);
  }, [open, hidePreview]);

  const dismiss = () => {
    dialog.current?.close();
    hidePreview();
    if (source?.opener.isConnected)
      source.opener.focus({ preventScroll: true });
  };

  return (
    <SourceContext.Provider value={openSource}>
      {children}
      {(source || frames.length > 0) && (
        <dialog
          ref={dialog}
          className="discover-source-preview"
          aria-labelledby={title}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.stopPropagation();
          }}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }}
        >
          {source && (
            <header>
              <button
                ref={done}
                type="button"
                className="secondary"
                onClick={dismiss}
              >
                Done
              </button>
              <div className="discover-source-heading">
                <h2 id={title}>
                  {listing ? "Listing preview" : "Company preview"}
                </h2>
                <p title={host}>{host}</p>
              </div>
              <a
                className="button"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </header>
          )}
          {source?.frame && (
            <div className="discover-source-controls">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setViewer((current) => ({
                    ...current,
                    showWebsite: !current.showWebsite,
                  }))
                }
              >
                {showWebsite ? "Saved details" : "Show website"}
              </button>
              {showWebsite && (
                <p className="discover-source-label">
                  If the preview stays blank, open it in a new tab.
                </p>
              )}
            </div>
          )}
          {frames.map((frame) => (
            <iframe
              key={frame}
              className="discover-source-website"
              src={frame}
              title={
                frame !== source?.frame
                  ? "Website preview"
                  : listing
                    ? "Listing website preview"
                    : "Company website preview"
              }
              referrerPolicy="no-referrer"
              hidden={!showWebsite || frame !== source?.frame}
            />
          ))}
          {source && (
            <div className="discover-source-preview-body" hidden={showWebsite}>
              <h3>{listing ? source.job.title : source.job.employer}</h3>
              <p>
                {[
                  listing ? source.job.employer : source.job.title,
                  source.job.location || source.job.city,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="discover-source-label">
                {destination} · {host}
              </p>
              {listing && source.job.description && (
                <p className="discover-job-description">
                  {source.job.description}
                </p>
              )}
            </div>
          )}
        </dialog>
      )}
    </SourceContext.Provider>
  );
}

export function OpportunityListingLink({
  job,
  children,
  className,
  label,
}: {
  job: PreviewJob;
  children: string;
  className?: string;
  label?: string;
}) {
  const openSource = useOpenOpportunitySource();
  const url = safeUrl(job.url);
  if (!url) return null;

  return (
    <a
      href={url}
      className={className}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => openSource(event, job, "listing")}
    >
      {children}
    </a>
  );
}
