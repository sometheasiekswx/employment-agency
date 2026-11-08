"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { safeUrl } from "@/lib/format";
import type { Job } from "@/lib/models";
import { publicPreviewEnabled } from "@/lib/public-preview";
import "./opportunity-source-preview.css";

export type OpportunitySourceKind = "listing" | "careers" | "source";

type PreviewJob = Pick<
  Job,
  "title" | "employer" | "location" | "city" | "description" | "url"
>;

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

export function OpportunitySourcePreview({
  job,
  kind,
  url,
  onClose,
}: {
  job: PreviewJob;
  kind: OpportunitySourceKind;
  url: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const title = useId();
  const listing = kind === "listing";
  const frame =
    listing && !publicPreviewEnabled() ? websiteFrameUrl(url) : undefined;
  const destination =
    kind === "careers"
      ? "Careers site"
      : listing
        ? "Original listing"
        : "Listing source";

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    close.current?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
    };
  }, []);

  const dismiss = () => {
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="discover-source-preview"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
    >
      <header>
        <h2 id={title}>{listing ? "Listing preview" : "Company preview"}</h2>
        <button
          ref={close}
          type="button"
          className="secondary"
          onClick={dismiss}
        >
          Close
        </button>
      </header>
      <div className="discover-source-preview-body">
        {frame && (
          <div className="discover-website-preview">
            <iframe
              src={frame}
              title="Listing website preview"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
            <p className="discover-source-label">
              Saved listing details are below if the website restricts the
              preview.
            </p>
          </div>
        )}
        <h3>{listing ? job.title : job.employer}</h3>
        <p>
          {(listing
            ? [job.employer, job.location || job.city]
            : [job.title, job.location || job.city]
          )
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="discover-source-label">
          {destination} · {new URL(url).host}
        </p>
        {listing && job.description && (
          <p className="discover-job-description">{job.description}</p>
        )}
      </div>
      <footer>
        <a
          className="button"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </footer>
    </dialog>
  );
}

export function OpportunityListingLink({
  job,
  children,
}: {
  job: PreviewJob;
  children: string;
}) {
  const opener = useRef<HTMLAnchorElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const url = safeUrl(job.url);
  if (!url) return null;

  return (
    <>
      <a
        ref={opener}
        href={url}
        rel="noreferrer"
        aria-haspopup="dialog"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          setPreviewUrl(url);
        }}
      >
        {children}
      </a>
      {previewUrl && (
        <OpportunitySourcePreview
          job={job}
          kind="listing"
          url={previewUrl}
          onClose={() => {
            setPreviewUrl(undefined);
            opener.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
