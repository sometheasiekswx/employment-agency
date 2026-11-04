"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check as CheckIcon,
  Compass,
  MapPin,
  ShieldCheck,
} from "lucide-react";
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

export function SearchPage() {
  const { state, client, profileId, selectProfile, run } = useWorkspace();
  const profile = state.profiles.find((item) => item.id === profileId);
  const [editing, setEditing] = useState<Job>();
  const { canLeave } = useDraft();
  return (
    <div className="search-preferences-page secondary-page">
      <div className="secondary-page-intro-row">
        <p className="secondary-page-intro">
          Choose where your next role could take you.
        </p>
        <Link
          href="/discover/"
          className="button secondary"
          onNavigate={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          <Compass size={16} aria-hidden="true" />
          Discover roles
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="search-preferences-grid">
        <section className="secondary-panel search-locations-panel">
          <h2>Preferred locations</h2>
          <p className="muted">
            Location and work eligibility are checked separately.
          </p>
          <div className="search-location-list">
            {profile?.locations.map((location, index) => (
              <div className="search-location" key={`${location}-${index}`}>
                <span className="search-location-icon">
                  <MapPin size={20} aria-hidden="true" />
                </span>
                <div>
                  <strong>{location}</strong>
                  <span>Priority {index + 1}</span>
                </div>
                <CheckIcon size={17} aria-label="Included" />
              </div>
            ))}
            {!profile?.locations.length && (
              <p className="empty">
                Add locations to a search profile to shape your shortlist.
              </p>
            )}
          </div>
          <div className="secondary-inline-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              Unknown eligibility remains explicit. Only confirmed work rights
              belong in your profile.
            </p>
          </div>
        </section>
        <section className="secondary-panel search-profile-panel">
          <h2>What you are looking for</h2>
          <Select
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
          />
          <details>
            <summary>Create another profile</summary>
            <ProfileForm />
          </details>
          {profile ? (
            <details key={profile.id} open>
              <summary>Edit {profile.name}</summary>
              <ProfileForm profile={profile} />
            </details>
          ) : (
            <p>Start by saving your first search profile.</p>
          )}
        </section>
      </div>
      <div className="secondary-two-column search-tools-grid">
        <section className="secondary-panel search-sources-panel">
          <h2>Live sources</h2>
          <p>
            Search configured employer boards. Coverage is limited to these
            boards and imported jobs;{" "}
            {client.hosted
              ? "paste other adverts below."
              : "use your coding agent for broader research."}
          </p>
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
              ]}
            />
            <Field label="Employer board identifier" name="board" required />
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
          <h2>Add an opportunity</h2>
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
