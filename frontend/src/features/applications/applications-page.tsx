"use client";

import { useState, useOptimistic, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { useDraft } from "@/components/unsaved";
import { decisionDate, destination, compareDestinations } from "@/lib/format";
import type { Application, EditorDocument } from "@/lib/models";
import { ApplicationCard } from "./application-card";
import { DocumentEditor } from "./document-editor";
import Link from "next/link";
import { FolderOpen } from "lucide-react";

const sections = [
  ["active", "Active"],
  ["submitted", "Submitted"],
  ["rejected", "Rejected"],
] as const;
const group = (app: Application) =>
  ["submitted", "rejected"].includes(app.status) ? app.status : "active";

export function ApplicationsPage() {
  const { state } = useWorkspace();
  const params = useSearchParams();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(
    params.toString(),
  );
  const filters = new URLSearchParams(optimisticQuery);
  const router = useRouter();
  const { canLeave } = useDraft();
  const section = sections.some(([key]) => key === filters.get("section"))
    ? filters.get("section")!
    : "active";
  const selectedCity = filters.get("destination") || "All destinations";
  const includeHistorical = filters.get("history") === "true";
  const [editing, setEditing] = useState<{
    document: EditorDocument;
    opener: HTMLButtonElement;
  }>();
  const setFilter = (name: string, value: string) => {
    if (!canLeave()) return;
    const next = new URLSearchParams(filters);
    next.set(name, value);
    if (name === "section") next.delete("destination");
    startTransition(() => {
      setOptimisticQuery(next.toString());
      router.replace(`/?${next}`, { scroll: false });
    });
  };
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const priorities = state._workspace.preferred_locations;
  const available = state.applications.filter(
    (app) => includeHistorical || !app.archived,
  );
  const visible = available
    .filter((app) => group(app) === section)
    .sort((a, b) =>
      section === "submitted"
        ? decisionDate(b, "submitted").localeCompare(
            decisionDate(a, "submitted"),
          )
        : (b.created_at || "").localeCompare(a.created_at || ""),
    );
  const cityFor = (app: Application) =>
    destination(jobs.get(app.job_id) || {}, priorities);
  if (section !== "submitted")
    visible.sort((a, b) =>
      compareDestinations(cityFor(a), cityFor(b), priorities),
    );
  const cities = [
    "All destinations",
    ...Array.from(new Set(visible.map(cityFor))).sort((a, b) => {
      return compareDestinations(a, b, priorities);
    }),
  ];
  const city = cities.includes(selectedCity)
    ? selectedCity
    : "All destinations";
  const filtered = visible.filter(
    (app) => city === "All destinations" || cityFor(app) === city,
  );
  return (
    <>
      <section className="destination-board" aria-label="Application filters">
        <div
          className="actions segmented-control"
          aria-label="Application sections"
        >
          {sections.map(([key, label]) => (
            <button
              key={key}
              aria-pressed={section === key}
              onClick={() => setFilter("section", key)}
            >
              {label} ({available.filter((app) => group(app) === key).length})
            </button>
          ))}
        </div>
        <Check
          name="include_history"
          label="Include earlier review queues"
          checked={includeHistorical}
          onChange={(event) =>
            setFilter("history", String(event.target.checked))
          }
        />
        <div
          className="destinations"
          role="group"
          aria-label="Filter applications by destination"
        >
          {cities.map((place) => (
            <button
              key={place}
              aria-pressed={city === place}
              onClick={() => setFilter("destination", place)}
            >
              {place}
            </button>
          ))}
        </div>
        <div className="destination-select">
          <Select
            label="Application destination"
            options={cities.map((city) => [city, city])}
            value={city}
            onChange={(event) => setFilter("destination", event.target.value)}
          />
        </div>
        <p role="status" className="result-count">
          {filtered.length} of {visible.length} application packages shown
        </p>
      </section>
      {filtered.map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          job={jobs.get(app.job_id) || {}}
          onEdit={(document, opener) => setEditing({ document, opener })}
        />
      ))}
      {!filtered.length && (
        <div className="empty-state">
          <FolderOpen aria-hidden="true" />
          <h2>No {section} applications.</h2>
          <p>
            {section === "active"
              ? "Start with your career evidence, then prepare a draft from a matching role."
              : "Applications appear here when you record that decision. Your other queues stay available above."}
          </p>
          <Link
            href={section === "active" ? "/career/" : "/?section=active"}
            className="button"
            onNavigate={(event) => {
              if (!canLeave()) event.preventDefault();
            }}
          >
            {section === "active"
              ? "Add your experience"
              : "View active applications"}
          </Link>
        </div>
      )}
      {section === "submitted" &&
        Boolean(state.historical_decisions?.length) && (
          <section>
            <h2>Earlier submission records</h2>
            <p>
              Exact submitted files remain unconfirmed where the original record
              did not identify them.
            </p>
            {state.historical_decisions?.map((item, index) => (
              <p key={index}>
                <strong>{item.employer}</strong> · {item.status}
              </p>
            ))}
          </section>
        )}
      {editing && (
        <DocumentEditor
          document={editing.document}
          opener={editing.opener}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
