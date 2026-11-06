"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import "./public-preview.css";

export function PublicPreviewNotice() {
  return (
    <aside
      className="public-preview-notice"
      aria-label="Public preview information"
    >
      <ShieldCheck size={18} aria-hidden="true" />
      <p>
        <strong>Fictional public preview.</strong> No sign-in. Bookmarks,
        removed roles and reasons stay in this browser; documents are examples.
        Document editing, uploads and employer submissions are disabled.
      </p>
      <a
        href="https://github.com/sometheasiekswx/employment-agency#quickstart"
        target="_blank"
        rel="noopener noreferrer"
      >
        Get the local app <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </aside>
  );
}
