"use client";

import Link from "next/link";
import { useId } from "react";
import { Select } from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { useWorkspace } from "@/components/workspace-provider";
import type { Application } from "@/lib/models";
import { applicationVersionLabels } from "./version-labels";

export function ApplicationVersions({
  application,
  onSelect,
}: {
  application: Application;
  onSelect: (application: Application) => void;
}) {
  const { state } = useWorkspace();
  const { canLeave } = useDraft();
  const dateId = useId();
  const versions = applicationVersionLabels(
    state.applications,
    application,
    state._workspace.timezone,
  );
  const selected = versions.find(
    (version) => version.application.id === application.id,
  );
  // History groups use the preserved folder names, which can differ from
  // original job labels after filesystem punctuation has been normalized.
  const parts = application.folder?.split("/");
  const canonical = parts?.[0] === "applications" && parts.length >= 5;
  const historyQuery = new URLSearchParams({
    role: canonical ? parts[3] : application.title,
    employer: canonical ? parts[2] : application.employer,
  });

  return (
    <div className="application-versions">
      <Select
        label="Document version"
        name="document_version"
        value={application.id}
        aria-describedby={selected ? dateId : undefined}
        options={versions.map((version) => [
          version.application.id,
          version === selected ? version.title : version.label,
        ])}
        onChange={(event) => {
          const version = versions.find(
            (item) => item.application.id === event.target.value,
          );
          if (version && version.application.id !== application.id)
            onSelect(version.application);
        }}
      />
      <p className="application-version-help">
        {selected && <span id={dateId}>{selected.date}</span>}
        <span>
          New drafts keep the original. Submitted snapshots stay unchanged.
        </span>
      </p>
      <Link
        href={`/history/?${historyQuery}`}
        onNavigate={(event) => {
          if (!canLeave()) event.preventDefault();
        }}
      >
        View application history
      </Link>
    </div>
  );
}
