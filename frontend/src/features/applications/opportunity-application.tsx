"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import type { Application, EditorDocument, Job } from "@/lib/models";
import { ApplicationCard } from "./application-card";
import { ApplicationCv } from "./application-cv";
import { DocumentEditor } from "./document-editor";
import { PreviousSubmissionAttempts } from "./submission-records";
import "./applications.css";

type OpportunityApplicationProps = {
  application: Application;
  job: Partial<Job>;
  tab: "overview" | "documents" | "files" | "activity";
  nextAction?: ReactNode;
};

/** Keep this mounted when changing tabs so review drafts stay with the record. */
export function OpportunityApplication(props: OpportunityApplicationProps) {
  return <ApplicationWorkspace key={props.application.id} {...props} />;
}

function ApplicationWorkspace({
  application,
  job,
  tab,
  nextAction,
}: OpportunityApplicationProps) {
  const { client } = useWorkspace();
  const workspace = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<{
    document: EditorDocument;
    opener: HTMLButtonElement;
  }>();

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    const opener = returnFocus.current;
    returnFocus.current = null;
    if (opener.isConnected && !opener.closest("[hidden], [inert]"))
      opener.focus({ preventScroll: true });
    else workspace.current?.focus({ preventScroll: true });
  }, [editing]);

  const edit = (document: EditorDocument, opener: HTMLButtonElement) => {
    if (!opener.isConnected) return;
    returnFocus.current = opener;
    setEditing({ document, opener });
  };

  return (
    <div
      className="opportunity-application"
      data-application-id={application.id}
      ref={workspace}
      tabIndex={-1}
      hidden={tab === "overview"}
    >
      <ApplicationCv
        app={application}
        active={tab === "documents"}
        onEdit={async (opener) =>
          edit(
            await client.action<EditorDocument>("document-editor", {
              id: application.id,
              document: "resume",
            }),
            opener,
          )
        }
      >
        {nextAction}
      </ApplicationCv>
      <ApplicationCard
        app={application}
        job={job}
        view={tab === "activity" ? "activity" : "files"}
        hidden={tab !== "files" && tab !== "activity"}
        onEdit={edit}
      />
      {tab === "activity" && (
        <PreviousSubmissionAttempts
          jobId={application.job_id}
          application={application}
        />
      )}
      {editing && (
        <DocumentEditor
          document={editing.document}
          opener={editing.opener}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
