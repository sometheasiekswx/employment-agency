"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderClock, ShieldCheck } from "lucide-react";
import { Action, Field, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { displayDate, errorMessage } from "@/lib/format";
import type { HistoryVersion } from "@/lib/models";
import { FileLink } from "@/features/applications/file-link";

export function HistoryPage() {
  const { state, client, run } = useWorkspace();
  const [versions, setVersions] = useState<HistoryVersion[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [adopted, setAdopted] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  useEffect(() => {
    let alive = true;
    client
      .action<HistoryVersion[]>("history")
      .then((result) => {
        if (alive) setVersions(result);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [client, attempt]);
  if (error)
    return (
      <section className="history-page secondary-panel">
        <p role="alert">{error}</p>
        <button
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </button>
      </section>
    );
  if (!versions)
    return (
      <div className="history-page secondary-page">
        <p role="status">Loading application history…</p>
      </div>
    );
  const allCities = Array.from(new Set(versions.map((item) => item.city)));
  const search = query.trim().toLocaleLowerCase();
  const filteredVersions = versions.filter(
    (version) =>
      (!location || version.city === location) &&
      (!search ||
        [
          version.city,
          version.company,
          version.job,
          version.label,
          version.source,
        ].some((value) => value.toLocaleLowerCase().includes(search))),
  );
  const cities = Array.from(new Set(filteredVersions.map((item) => item.city)));
  return (
    <div className="history-page secondary-page">
      <p className="secondary-page-intro">
        Every document version, kept in context.
      </p>
      <div className="secondary-inline-note history-preservation-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          Preserved documents by city, company, role and date. Historical
          versions do not imply that a job is open or an application was
          submitted.
        </p>
      </div>
      {versions.length > 0 && (
        <div className="history-toolbar">
          <Field
            label="Search history"
            name="history_search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Role, employer or document"
          />
          <Select
            label="Location"
            name="history_location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            options={[
              ["", "All locations"],
              ...allCities.map((city) => [city, city] as const),
            ]}
          />
          <span className="history-result-count" role="status">
            {filteredVersions.length}{" "}
            {filteredVersions.length === 1 ? "version" : "versions"}
          </span>
        </div>
      )}
      {!versions.length && (
        <section className="secondary-panel history-empty">
          <FolderClock size={27} aria-hidden="true" />
          <p>No application history yet.</p>
        </section>
      )}
      {versions.length > 0 && !filteredVersions.length && (
        <p className="empty">No versions match these filters.</p>
      )}
      {cities.map((city) => (
        <section className="secondary-panel history-city-group" key={city}>
          <div className="secondary-section-heading">
            <h2>{city}</h2>
            <span className="pill">
              {filteredVersions.filter((item) => item.city === city).length}{" "}
              {filteredVersions.filter((item) => item.city === city).length ===
              1
                ? "version"
                : "versions"}
            </span>
          </div>
          {Array.from(
            new Set(
              filteredVersions
                .filter((item) => item.city === city)
                .map((item) => item.company),
            ),
          ).map((company) => {
            const items = filteredVersions.filter(
              (item) => item.city === city && item.company === company,
            );
            return (
              <details className="history-employer" key={company} open>
                <summary>
                  {company}{" "}
                  <span className="pill">
                    {items.length} {items.length === 1 ? "version" : "versions"}
                  </span>
                </summary>
                {Array.from(new Set(items.map((item) => item.job))).map(
                  (job) => (
                    <div className="history-role-group" key={job}>
                      <h3>{job}</h3>
                      {items
                        .filter((item) => item.job === job)
                        .sort((a, b) =>
                          b.generated_at.localeCompare(a.generated_at),
                        )
                        .map((version) => (
                          <details className="history-version" key={version.id}>
                            <summary>
                              <FileText size={17} aria-hidden="true" />
                              <span className="history-version-title">
                                {version.label}
                                {version.date_uncertain
                                  ? " — date needs confirmation"
                                  : ""}
                              </span>
                              <span className="history-version-date">
                                {displayDate(
                                  version.generated_at,
                                  state._workspace.timezone,
                                )}
                              </span>
                            </summary>
                            <div className="history-version-content">
                              <p>{version.source}</p>
                              <ul className="history-files">
                                {version.files.map((name) => (
                                  <li key={name}>
                                    <FileLink
                                      id={version.id}
                                      name={name}
                                      history
                                    >
                                      {name}
                                    </FileLink>
                                  </li>
                                ))}
                              </ul>
                              {!client.hosted && (
                                <Action
                                  run={async () => {
                                    await run("history-adopt", {
                                      id: version.id,
                                    });
                                    setAdopted(version.id);
                                  }}
                                >
                                  Validate external edits as a new draft
                                </Action>
                              )}
                              {adopted === version.id && (
                                <p role="status">
                                  New draft saved. The previously verified
                                  version was restored.{" "}
                                  <Link href="/">Review the new draft</Link>
                                </p>
                              )}
                            </div>
                          </details>
                        ))}
                    </div>
                  ),
                )}
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
