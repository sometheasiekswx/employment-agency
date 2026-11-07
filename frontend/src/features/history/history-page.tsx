"use client";

import { startTransition, useEffect, useOptimistic, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, FolderClock, MapPin, ShieldCheck } from "lucide-react";
import { Action, Field, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { applicationHref, errorMessage } from "@/lib/format";
import type { Application, HistoryVersion } from "@/lib/models";
import { FileLink } from "@/features/applications/file-link";
import { historyVersionLabel } from "@/features/applications/version-labels";

export function HistoryPage() {
  const { state, client, run } = useWorkspace();
  const params = useSearchParams();
  const [routeQuery, setOptimisticQuery] = useOptimistic(params.toString());
  const filters = new URLSearchParams(routeQuery);
  const role = filters.get("role") || "";
  const employer = filters.get("employer") || "";
  const query = filters.get("q") || "";
  const location = filters.get("location") || "";
  const scoped = Boolean(role || employer);
  const cleared = new URLSearchParams(filters);
  cleared.delete("role");
  cleared.delete("employer");
  const clearHref = `/history/${cleared.size ? `?${cleared}` : ""}`;
  const [versions, setVersions] = useState<HistoryVersion[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [adopted, setAdopted] = useState<{
    versionId: string;
    application: Application;
  }>();
  const updateFilter = (name: "q" | "location", value: string) => {
    const next = new URLSearchParams(filters);
    if (value) next.set(name, value);
    else next.delete(name);
    startTransition(() => {
      setOptimisticQuery(next.toString());
      window.history.replaceState(
        null,
        "",
        `/history/${next.size ? `?${next}` : ""}`,
      );
    });
  };
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
  const labelledVersions = versions.map((version) => ({
    ...version,
    display: historyVersionLabel(
      version,
      state.applications,
      state._workspace.timezone,
    ),
  }));
  const scopedVersions = labelledVersions.filter(
    (version) =>
      (!role || version.job === role) &&
      (!employer || version.company === employer),
  );
  const allCities = Array.from(
    new Set(scopedVersions.map((item) => item.city)),
  );
  if (location && !allCities.includes(location)) allCities.push(location);
  const search = query.trim().toLocaleLowerCase();
  const filteredVersions = scopedVersions.filter(
    (version) =>
      (!location || version.city === location) &&
      (!search ||
        [
          version.city,
          version.company,
          version.job,
          version.label,
          version.source,
          version.display.title,
          version.display.date,
          ...version.display.records.map((record) => record.label),
        ].some((value) => value.toLocaleLowerCase().includes(search))),
  );
  const cities = Array.from(new Set(filteredVersions.map((item) => item.city)));
  return (
    <div className="history-page secondary-page">
      <p className="secondary-page-intro">
        Find the exact document version saved for a role.
      </p>
      {scoped && (
        <div
          className="secondary-inline-note history-role-context"
          role="region"
          aria-label="Selected application history"
        >
          <p>
            History for <strong>{role || "all roles"}</strong> at{" "}
            <strong>{employer || "all employers"}</strong>.
          </p>
          <Link href={clearHref}>Clear role filter</Link>
        </div>
      )}
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
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Role, company or file"
          />
          <Select
            label="Location"
            name="history_location"
            value={location}
            onChange={(event) => updateFilter("location", event.target.value)}
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
        <section className="secondary-panel history-empty">
          <FolderClock size={27} aria-hidden="true" />
          <p>No versions match these filters.</p>
        </section>
      )}
      {cities.map((city) => (
        <section className="secondary-panel history-city-group" key={city}>
          <div className="secondary-section-heading">
            <h2>
              <MapPin size={17} aria-hidden="true" />
              {city}
            </h2>
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
                                {version.display.title}
                                {version.date_uncertain
                                  ? " — date needs confirmation"
                                  : ""}
                              </span>
                              <span className="history-version-date">
                                {version.display.date}
                              </span>
                            </summary>
                            <div className="history-version-content">
                              <p>{version.source}</p>
                              <p>
                                <strong>Storage label:</strong> {version.label}
                              </p>
                              {version.display.records.length > 1 ? (
                                <>
                                  <p>
                                    These documents are shared by separate
                                    application records:
                                  </p>
                                  <ul>
                                    {version.display.records.map((record) => (
                                      <li key={record.application.id}>
                                        {record.label}
                                        {record.note && <> — {record.note}</>}
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              ) : version.display.records.length === 0 ? (
                                <p>
                                  Application status is not recorded for these
                                  preserved documents.
                                </p>
                              ) : version.display.records[0].note ? (
                                <p>{version.display.records[0].note}</p>
                              ) : null}
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
                                    const application = await run<Application>(
                                      "history-adopt",
                                      {
                                        id: version.id,
                                      },
                                    );
                                    setAdopted({
                                      versionId: version.id,
                                      application,
                                    });
                                  }}
                                >
                                  Validate external edits as a new draft
                                </Action>
                              )}
                              {adopted?.versionId === version.id && (
                                <p role="status">
                                  New draft saved. The previously verified
                                  version was restored.{" "}
                                  <Link
                                    href={applicationHref(adopted.application)}
                                  >
                                    Review the new draft
                                  </Link>
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
