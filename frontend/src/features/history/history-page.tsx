"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Action } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";
import type { HistoryVersion } from "@/lib/models";
import { FileLink } from "@/features/applications/file-link";

export function HistoryPage() {
  const { client, run } = useWorkspace();
  const [versions, setVersions] = useState<HistoryVersion[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [adopted, setAdopted] = useState("");
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
      <section>
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
  if (!versions) return <p role="status">Loading application history…</p>;
  const cities = Array.from(new Set(versions.map((item) => item.city)));
  return (
    <>
      <p>
        Preserved documents by city, company, role and date. Historical versions
        do not imply that a job is open or an application was submitted.
      </p>
      {!versions.length && (
        <section>
          <p>No application history yet.</p>
        </section>
      )}
      {cities.map((city) => (
        <section key={city}>
          <h2>{city}</h2>
          {Array.from(
            new Set(
              versions
                .filter((item) => item.city === city)
                .map((item) => item.company),
            ),
          ).map((company) => {
            const items = versions.filter(
              (item) => item.city === city && item.company === company,
            );
            return (
              <details key={company}>
                <summary>
                  {company}{" "}
                  <span className="pill">{items.length} versions</span>
                </summary>
                {Array.from(new Set(items.map((item) => item.job))).map(
                  (job) => (
                    <div key={job}>
                      <h3>{job}</h3>
                      {items
                        .filter((item) => item.job === job)
                        .sort((a, b) =>
                          b.generated_at.localeCompare(a.generated_at),
                        )
                        .map((version) => (
                          <details key={version.id}>
                            <summary>
                              {version.label}
                              {version.date_uncertain
                                ? " — date needs confirmation"
                                : ""}
                            </summary>
                            <p>{version.source}</p>
                            <ul className="history-files">
                              {version.files.map((name) => (
                                <li key={name}>
                                  <FileLink id={version.id} name={name} history>
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
                                New draft saved. The previously verified version
                                was restored.{" "}
                                <Link href="/">Review the new draft</Link>
                              </p>
                            )}
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
    </>
  );
}
