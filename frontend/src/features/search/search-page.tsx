"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Compass, MapPin, Plus, ShieldCheck } from "lucide-react";
import {
  Action,
  Field,
  Form,
  Select,
  text,
  values,
} from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { useDraft } from "@/components/unsaved";
import type { Job } from "@/lib/models";
import { ProfileForm } from "./profile-form";
import { JobForm } from "./job-form";
import { SearchResults } from "./search-results";
import { Runs } from "./runs";
import { DiscoveryPanel } from "./discovery-panel";

export function SearchPage() {
  const { state, client, profileId, selectProfile, run } = useWorkspace();
  const local = !client.hosted && !client.preview;
  const profile = state.profiles.find((item) => item.id === profileId);
  const [editing, setEditing] = useState<Job>();
  const { canLeave } = useDraft();
  const opportunityHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const focusOpportunity = () => {
      if (window.location.hash === "#add-opportunity")
        opportunityHeading.current?.focus();
    };
    focusOpportunity();
    window.addEventListener("hashchange", focusOpportunity);
    return () => window.removeEventListener("hashchange", focusOpportunity);
  }, []);
  return (
    <div className="search-preferences-page secondary-page">
      <nav className="search-page-actions" aria-label="Opportunity tools">
        <Link
          href="/discover/"
          className="button secondary"
          onNavigate={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          <Compass size={16} aria-hidden="true" />
          Discover roles
        </Link>
        {!local && (
          <a href="#rank-jobs" className="button secondary">Rank saved jobs</a>
        )}
        <a href="#add-opportunity" className="button primary">
          <Plus size={16} aria-hidden="true" />
          Add opportunity
        </a>
      </nav>
      {local && <DiscoveryPanel key={state._workspace.path} />}
      <div className="search-preferences-grid">
        <section className="secondary-panel search-profile-panel">
          <h2>Search profiles</h2>
          {state.profiles.length > 0 && <Select
            label="Active profile"
            name="active_profile"
            options={state.profiles.map((profile) => [
              profile.id,
              profile.name,
            ])}
            value={profileId}
            onChange={(event) => {
              if (canLeave()) selectProfile(event.target.value);
            }}
          />}
          <details key={state.profiles.length ? "additional-profile" : "first-profile"} open={state.profiles.length === 0 ? true : undefined}>
            <summary>{state.profiles.length ? "Create another profile" : "Create your first profile"}</summary>
            <ProfileForm />
          </details>
          {profile ? (
            <details key={profile.id} open>
              <summary>Edit {profile.name}</summary>
              <ProfileForm profile={profile} />
            </details>
          ) : null}
        </section>
        <section className="secondary-panel search-locations-panel">
          <h2>Preferred locations</h2>
          {profile?.locations.length ? (
            <ol className="search-location-list" role="list">
              {profile.locations.map((location, index) => (
                <li className="search-location" key={`${location}-${index}`}>
                  <span className="search-location-icon">
                    <MapPin size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{location}</strong>
                    <span>Priority {index + 1}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">
              Add locations to a search profile to shape your shortlist.
            </p>
          )}
          <div className="secondary-inline-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              Location preferences and work rights are checked separately. Add
              only work rights you can confirm.
            </p>
          </div>
        </section>
      </div>
      <div className="secondary-two-column search-tools-grid">
        <section className="secondary-panel search-sources-panel">
          <h2>Live sources</h2>
          <Form
            onSave={async (data) => {
              await run("source", values(data));
            }}
          >
            <Select
              label="Adapter"
              name="kind"
              options={[
                ["greenhouse", "Greenhouse"],
                ["lever", "Lever"],
                ...(local ? [
                  ["smartrecruiters", "SmartRecruiters"],
                  ["ashby", "Ashby"],
                  ["workable", "Workable"],
                  ["weworkremotely", "We Work Remotely RSS"],
                  ["remotive", "Remotive"],
                ] as const : []),
              ]}
            />
            <Field label="Employer board identifier" name="board" required
              aria-describedby={local ? "public-feed-identifiers" : undefined} />
            {local && <small id="public-feed-identifiers">
              For a remote feed, enter a category. We Work Remotely accepts all, programming, full-stack, or devops. Remotive accepts
              all, software-dev, devops, product, data, or qa.
            </small>}
            <button>Add source</button>
          </Form>
          {state.sources.map((source) => (
            <div className="search-source-row" key={source.id}>
              <p>
                {source.kind}: {source.board}{" "}
                <span className="pill">{source.status}</span>
              </p>
              <Action
                run={async () => {
                  await run("discover", { id: source.id });
                }}
              >
                Refresh
              </Action>
              <small>
                {source.checked_at || "Not checked"} {source.error}
              </small>
            </div>
          ))}
        </section>
        <section className="secondary-panel search-import-panel">
          <h2 id="add-opportunity" ref={opportunityHeading} tabIndex={-1}>
            Add an opportunity
          </h2>
          <Form
            onSave={async (data) => {
              await run("url", { url: text(data, "url") });
            }}
          >
            <Field
              label="Job URL with JobPosting structured data"
              name="url"
              type="url"
              required
            />
            <button>Import URL</button>
          </Form>
          <details key={editing?.id || "new-job"} open={Boolean(editing)}>
            <summary>
              {editing
                ? "Edit job details"
                : "Paste an advert or add details manually"}
            </summary>
            <JobForm job={editing} onSaved={() => setEditing(undefined)} />
          </details>
          <details>
            <summary>Saved jobs ({state.jobs.length})</summary>
            {state.jobs.map((job) => (
              <p className="search-saved-job" key={job.id}>
                {job.title} · {job.employer}{" "}
                <button
                  onClick={() => {
                    if (canLeave()) setEditing(job);
                  }}
                >
                  Edit details
                </button>
              </p>
            ))}
          </details>
        </section>
      </div>
      <div className="search-preparation-tools">
        <SearchResults key={profileId} />
        <Runs />
      </div>
    </div>
  );
}
