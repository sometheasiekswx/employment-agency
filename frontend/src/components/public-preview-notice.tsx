"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { DemoResume } from "@/lib/demo-drafts";
import "./public-preview.css";

export function PublicPreviewNotice({ resume }: { resume?: DemoResume }) {
  return (
    <aside
      className="public-preview-notice"
      aria-label="Public preview information"
    >
      <ShieldCheck size={18} aria-hidden="true" />
      <p>
        <strong>
          {resume?.pdf ? `${resume.name} · Public demo` : "Public demo"}
        </strong>{" "}
        Employer listings can close. Application history includes sample
        records. Imported résumés and new drafts stay in this tab. The demo
        sends no applications.
      </p>
      <div className="public-preview-links">
        {resume?.pdf && (
          <a href={resume.pdf} target="_blank" rel="noopener noreferrer">
            View résumé (PDF) <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
        <a
          href="https://github.com/sometheasiekswx/employment-agency#quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get the local app <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}
