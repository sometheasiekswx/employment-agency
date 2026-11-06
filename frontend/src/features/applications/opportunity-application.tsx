"use client";

import { useEffect, useRef, useState } from "react";
import type { Application, EditorDocument, Job } from "@/lib/models";
import { ApplicationCard } from "./application-card";
import { ApplyForMe } from "./apply-for-me";
import { DocumentEditor } from "./document-editor";
import "./applications.css";

type OpportunityApplicationProps = {
  application: Application;
  job: Partial<Job>;
  tab: "documents" | "activity";
};

/** Keep this mounted when changing tabs so review drafts stay with the record. */
export function OpportunityApplication(props: OpportunityApplicationProps) {
  return <ApplicationWorkspace key={props.application.id} {...props} />;
}

function ApplicationWorkspace({
  application,
  job,
  tab,
}: OpportunityApplicationProps) {
  const workspace = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<{
    document: EditorDocument;
    opener: HTMLButtonElement;
  }>();
  const [applying, setApplying] = useState<HTMLButtonElement>();

  useEffect(() => {
    if (editing || applying || !returnFocus.current) return;
    const opener = returnFocus.current;
    returnFocus.current = null;
    if (opener.isConnected && !opener.closest("[hidden], [inert]"))
      opener.focus({ preventScroll: true });
    else workspace.current?.focus({ preventScroll: true });
  }, [editing, applying]);

  return (
    <div className="opportunity-application" ref={workspace} tabIndex={-1}>
      <ApplicationCard
        app={application}
        job={job}
        view={tab}
        onEdit={(document, opener) => {
          returnFocus.current = opener;
          setEditing({ document, opener });
        }}
        onApply={(opener) => {
          returnFocus.current = opener;
          setApplying(opener);
        }}
      />
      {editing && (
        <DocumentEditor
          document={editing.document}
          opener={editing.opener}
          onClose={() => setEditing(undefined)}
        />
      )}
      {applying && (
        <ApplyForMe
          app={application}
          job={job}
          opener={applying}
          onClose={() => setApplying(undefined)}
        />
      )}
    </div>
  );
}
