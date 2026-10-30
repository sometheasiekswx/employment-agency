"use client";

import { useState } from "react";
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
    <>
      <div className="grid">
        <section>
          <h2>Search profiles</h2>
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
            <details key={profile.id}>
              <summary>Edit {profile.name}</summary>
              <ProfileForm profile={profile} />
            </details>
          ) : (
            <p>Start by saving your first search profile.</p>
          )}
        </section>
        <section>
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
            <div key={source.id}>
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
      </div>
      <section>
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
            <p key={job.id}>
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
      <SearchResults key={profileId} />
      <Runs />
    </>
  );
}
