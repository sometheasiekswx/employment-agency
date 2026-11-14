"use client";

import { useEffect, useState } from "react";
import { Action, Check, Form, TextArea, text } from "@/components/controls";
import { ContextHelp } from "@/components/context-help";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";
import type { RankedJob } from "@/lib/models";
import styles from "./discovery-panel.module.css";

interface PublicLink {
  url: string;
  title: string;
}

interface DiscoveryRun {
  id: string;
  status: "running" | "complete" | "stopped" | "timed_out" | "failed";
  early_results: boolean;
  new_job_count: number;
  error?: string;
  notice?: string;
  sources: {
    label: string;
    url?: string;
    status: string;
    note?: string;
    last_verified_at?: string;
    job_count: number;
    imported_count: number;
  }[];
  jobs: (RankedJob & { new_to_workspace: boolean })[];
  pages: (PublicLink & { text: string; links: PublicLink[] })[];
  leads: (PublicLink & { employer: string; location: string })[];
}

const sourceStatus: Record<string, string> = {
  queued: "Queued",
  fetching: "Checking",
  retrieved: "Checked",
  partial: "Partial",
  blocked: "Blocked",
  deferred: "Deferred",
  failed: "Failed",
  timed_out: "Timed out",
  stopped: "Stopped",
  skipped: "Skipped",
};

function PublicPageLink({ url, children }: { url?: string; children: string }) {
  if (!url?.startsWith("https://")) return <>{children}</>;
  return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function DiscoveryPanel() {
  const { client, profileId, state, refresh } = useWorkspace();
  const [result, setResult] = useState<DiscoveryRun | null>(null);
  const [pollError, setPollError] = useState("");
  const [pollAttempt, setPollAttempt] = useState(0);
  const running = result?.status === "running";
  const runId = result?.id;
  const settled = result?.sources.filter((source) =>
    !["queued", "fetching"].includes(source.status)).length ?? 0;
  const incomplete = result?.sources.some(source =>
    ["blocked", "failed", "timed_out", "partial", "deferred"].includes(source.status));

  useEffect(() => {
    let mounted = true;
    client.action<DiscoveryRun | null>("discovery-status").then(latest => {
      if (mounted && latest) setResult(current => current ?? latest);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [client]);

  useEffect(() => {
    if (!running || !runId) return;
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;
    const check = async () => {
      try {
        const latest = await client.action<DiscoveryRun>("discovery-status", { id: runId });
        if (!mounted) return;
        setPollError("");
        setResult(current => current?.id === runId && current.status === "running" ? latest : current);
        if (latest.status === "running") timer = setTimeout(check, 1000);
        else await refresh();
      } catch (error) {
        if (mounted) setPollError(errorMessage(error));
      }
    };
    timer = setTimeout(check, 1000);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [client, refresh, runId, running, pollAttempt]);

  return (
    <section className={"secondary-panel " + styles.panel} aria-labelledby="job-discovery">
      <h2 id="job-discovery">Find new jobs</h2>
      <Form onSave={async data => {
        setPollError("");
        if (state._workspace.snapshot) await client.checkCompanyCooldowns();
        const response = await client.action<DiscoveryRun>("discovery-start", {
          profile_id: profileId || undefined,
          source_ids: data.getAll("source_ids"),
          urls: text(data, "urls").split(/\r?\n/).map(line => line.trim()).filter(Boolean),
          render: data.has("render"),
          firecrawl: data.has("firecrawl"),
        });
        setResult(response);
      }}>
        <fieldset disabled={running} className={styles.inputs}>
          <div>
            <TextArea label="Public URLs (one per line)" name="urls" rows={3} maxLength={16000} />
            <ContextHelp topic="Supported sources">
              <p>Use a job listing, careers page, job description PDF or sitemap URL. Add reusable feeds under Live sources.</p>
            </ContextHelp>
          </div>
          {state.sources.length > 0 && (
            <details>
              <summary>Choose feeds ({state.sources.length})</summary>
              <div className={styles.feeds}>
                {state.sources.map(source => (
                  <Check key={source.id} name="source_ids" value={source.id}
                    defaultChecked={state.sources.length <= 16}
                    label={source.kind + " · " + source.board} />
                ))}
              </div>
            </details>
          )}
          <details>
            <summary>Page rendering options</summary>
            <Check name="render" label="Render supplied pages with the local browser" />
            <Check name="firecrawl" label="Allow Firecrawl for up to two public pages" />
            <p>Firecrawl uses your CLI sign-in or configured key and receives the public URL.</p>
          </details>
          <button type="submit" className="button primary">Find jobs</button>
        </fieldset>
      </Form>
      {result && (
        <div className={styles.results}>
          <div className={styles.status}>
            <p role="status">
              {running ? (result.early_results ? "Partial results" : "Searching") :
                result.status === "complete" ? "Search finished" :
                result.status === "stopped" ? "Search stopped" :
                result.status === "timed_out" ? "Search reached its time limit" : "Search failed"}
              {running && ` · ${settled} of ${result.sources.length} checks finished`}
              {" · "}{result.new_job_count} new to this workspace
            </p>
            {running && (
              <Action className="secondary" run={async () => {
                const stopped = await client.action<DiscoveryRun>("discovery-stop", { id: result.id });
                setResult(stopped);
                await refresh();
              }}>
                Stop search
              </Action>
            )}
          </div>
          {pollError && (
            <p role="alert">
              {pollError} <button type="button" onClick={() => setPollAttempt(value => value + 1)}>Check again</button>
            </p>
          )}
          {result.error && <p role="alert">{result.error}</p>}
          {result.notice && <p role="status">{result.notice}</p>}
          <details>
            <summary>{incomplete ? "Source checks (some incomplete)" : "Source checks"}</summary>
            <ul className={styles.rows}>
              {result.sources.map((source, index) => (
                <li key={index}>
                  <span>{source.url ? <PublicPageLink url={source.url}>{source.label}</PublicPageLink> : source.label}</span>
                  <strong>{sourceStatus[source.status] ?? source.status}</strong>
                  {source.note && <small>{source.note}</small>}
                  {source.note && source.last_verified_at &&
                    <small>Previous successful check {new Date(source.last_verified_at).toLocaleString()}</small>}
                </li>
              ))}
            </ul>
          </details>
          {result.jobs.length > 0 && (
            <div>
              <h3>Matching jobs</h3>
              <ul className={styles.rows}>
                {result.jobs.map(({ job, match, new_to_workspace }) => (
                  <li key={job.id}>
                    <PublicPageLink url={job.url}>{job.title}</PublicPageLink>
                    {new_to_workspace && <strong>New to workspace</strong>}
                    <small>{[job.employer, job.location, job.posted_at && "Posted " + job.posted_at.split("T")[0]]
                      .filter(Boolean).join(" · ")}</small>
                    {match.unknowns.length > 0 && <small>{match.unknowns.join(" · ")}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!running && !result.jobs.length && (
            <p>{incomplete ? "No matching vacancies from the sources that could be checked." :
              "No matching vacancies were found in this search."}</p>
          )}
          {result.leads.length > 0 && (
            <details>
              <summary>Listings to review ({result.leads.length})</summary>
              <ul className={styles.rows}>
                {result.leads.map(lead => (
                  <li key={lead.url}>
                    <PublicPageLink url={lead.url}>{lead.title || lead.url}</PublicPageLink>
                    <small>{[lead.employer, lead.location].filter(Boolean).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.pages.length > 0 && (
            <details>
              <summary>Retrieved pages ({result.pages.length})</summary>
              {result.pages.map((page, index) => (
                <details key={index}>
                  <summary>{page.title || page.url}</summary>
                  <PublicPageLink url={page.url}>Open original page</PublicPageLink>
                  {page.text && <p className={styles.pageText}>{page.text}</p>}
                  {page.links.length > 0 && <ul>
                    {page.links.map(link => (
                      <li key={link.url}><PublicPageLink url={link.url}>{link.title || link.url}</PublicPageLink></li>
                    ))}
                  </ul>}
                </details>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
