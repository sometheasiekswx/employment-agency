"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Action, Field, Form, TextArea, text } from "@/components/controls";
import { useDraft } from "@/components/unsaved";
import { errorMessage } from "@/lib/format";
import type { Application, Job } from "@/lib/models";

type Attempt = {
  id: string;
  application_id: string;
  channel: string;
  status: string;
  note: string;
  fingerprint?: string;
  binding: {
    job_id: string;
    resume: string;
    sha256: string;
    cover_letter?: { path: string; sha256: string };
  };
  payload: {
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
    url?: string;
    site_review?: {
      review_text: string;
      fields: { label: string; value: string }[];
    };
  };
  receipt?: Record<string, string>;
};
type Connections = {
  connection?: { status: string; note?: string };
  gmail: { connected: boolean; email?: string };
  codex_installed: boolean;
  attempts: Attempt[];
};

export function ApplyForMe({
  app,
  job,
  opener,
  onClose,
}: {
  app: Application;
  job: Partial<Job>;
  opener: HTMLButtonElement;
  onClose: () => void;
}) {
  const { state, client, refresh, profileId } = useWorkspace();
  const { canLeave } = useDraft();
  const open = true;
  const [connections, setConnections] = useState<Connections>();
  const [attempt, setAttempt] = useState<Attempt>();
  const [version, setVersion] = useState(app.id);
  const [channel, setChannel] = useState("gmail");
  const [error, setError] = useState("");
  const [previewFiles, setPreviewFiles] = useState<{
    key: string;
    urls: Record<string, string>;
  }>({ key: "", urls: {} });
  const dialog = useRef<HTMLDialogElement>(null);
  const working =
    attempt && ["preparing", "executing"].includes(attempt.status);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = opener;
    let alive = true;
    client
      .action<Connections>("apply-status")
      .then((result) => {
        if (!alive) return;
        setConnections(result);
        const previous = result.attempts.findLast(
          (item) => item.binding.job_id === app.job_id,
        );
        if (previous) setAttempt(previous);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>("#content")?.focus();
    };
  }, [open, client, app.job_id, opener]);
  const previewId = attempt?.application_id;
  const resumeHash = attempt?.binding.sha256;
  const coverHash = attempt?.binding.cover_letter?.sha256;
  const previewKey = attempt ? `${attempt.id}:${resumeHash}:${coverHash}` : "";
  const previews = previewFiles.key === previewKey ? previewFiles.urls : {};
  useEffect(() => {
    if (!previewId || !resumeHash) return;
    let alive = true;
    const urls: string[] = [];
    const load = async (role: string, expected: string) => {
      const response = await fetch(`/files/${previewId}/${role}.pdf`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Cannot load the selected document. Validate its version before applying.",
        );
      const bytes = await response.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== expected)
        throw new Error(
          "Document changed since preparation. Cancel and review a new version.",
        );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      if (!alive) {
        URL.revokeObjectURL(url);
        return;
      }
      urls.push(url);
      setPreviewFiles((previous) => ({
        key: previewKey,
        urls: {
          ...(previous.key === previewKey ? previous.urls : {}),
          [role]: url,
        },
      }));
    };
    load("resume", resumeHash).catch((e) => {
      if (alive) setError(errorMessage(e));
    });
    if (coverHash)
      load("cover-letter", coverHash).catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewId, resumeHash, coverHash, previewKey]);
  const connecting = connections?.connection?.status === "connecting";
  useEffect(() => {
    if (!connecting) return;
    const timer = setInterval(() => {
      client
        .action<Connections>("apply-status")
        .then(setConnections)
        .catch((e) => setError(errorMessage(e)));
    }, 1500);
    return () => clearInterval(timer);
  }, [connecting, client]);
  const attemptId = attempt?.id;
  useEffect(() => {
    if (!open || !attemptId) return;
    let alive = true;
    const timer = setInterval(() => {
      client
        .action<Attempt>("apply-get", { id: attemptId })
        .then((result) => {
          if (alive) setAttempt(result);
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, client, attemptId]); // Poll only the selected attempt; no extra workspace writer.

  const operation = async (name: string, extra = {}) => {
    if (!attempt) return;
    setAttempt(
      await client.action<Attempt>(name, { id: attempt.id, ...extra }),
    );
  };
  const close = () => {
    if (working || !canLeave()) return;
    onClose();
    refresh().catch(() => {});
  };
  return (
    <>
      {open && (
        <dialog
          ref={dialog}
          className="apply-dialog"
          aria-labelledby={`apply-title-${app.id}`}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <h2 id={`apply-title-${app.id}`}>
              Apply for {job.title || app.title}
            </h2>
            <button disabled={Boolean(working)} onClick={close}>
              Close
            </button>
          </header>
          <p>{job.employer || app.employer}</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {!attempt && app.status === "submitted" && (
            <p>
              This was recorded manually; no automated submission receipt
              exists.
            </p>
          )}
          {!attempt && app.status !== "submitted" && (
            <>
              <p>
                Use a résumé tailored to this listing. You will review the exact
                document and destination before submission.
              </p>
              <p>
                Gmail:{" "}
                {connections?.gmail.connected
                  ? connections.gmail.email
                  : "Not connected"}
              </p>
              {!connections?.gmail.connected && (
                <details>
                  <summary>Connect Gmail</summary>
                  <p>
                    Choose your Google Desktop client file. Google will open in
                    your browser to request permission. Credentials stay in
                    macOS Keychain.
                  </p>
                  <Form
                    onSave={async (data) => {
                      const file = data.get("gmail_client");
                      if (!(file instanceof File) || file.size > 20000)
                        throw new Error(
                          "Choose a Google Desktop client JSON file smaller than 20 KB.",
                        );
                      setConnections(
                        await client.action<Connections>(
                          "apply-connect-gmail",
                          { client: JSON.parse(await file.text()) },
                        ),
                      );
                    }}
                  >
                    <Field
                      label="Google Desktop client file"
                      name="gmail_client"
                      type="file"
                      accept=".json"
                      required
                    />
                    <button disabled={connecting}>Connect Gmail</button>
                  </Form>
                  {connections?.connection?.note && (
                    <p role="status">{connections.connection.note}</p>
                  )}
                </details>
              )}
              <details>
                <summary>Tailor a new version with Codex</summary>
                <p>
                  Codex receives confirmed facts and this job description to
                  select evidence. Your existing version is preserved.
                </p>
                <Form
                  onSave={async (data) => {
                    if (data.get("consent") !== "on")
                      throw new Error(
                        "Confirm the disclosure categories before using Codex.",
                      );
                    await client.action("consent", {
                      provider: "agent",
                      grant: true,
                      purpose: "select_application_facts",
                      categories: ["confirmed_facts", "job_description"],
                    });
                    const created = await client.action<Application>(
                      "apply-tailor",
                      { application_id: app.id, profile_id: profileId },
                    );
                    setVersion(created.id);
                    await refresh();
                  }}
                >
                  <label className="check">
                    <input type="checkbox" name="consent" required />
                    Allow Codex to receive confirmed facts and the job
                    description
                  </label>
                  <button
                    disabled={!connections?.codex_installed || !profileId}
                  >
                    Create tailored version
                  </button>
                </Form>
                {version !== app.id && (
                  <p role="status">
                    New tailored version selected for this application.
                  </p>
                )}
              </details>
              <Form
                onSave={async (data) => {
                  setAttempt(
                    await client.action<Attempt>("apply-start", {
                      application_id: version,
                      channel,
                      to: text(data, "to"),
                      subject: text(data, "subject"),
                      body: text(data, "body"),
                      disclosure_confirmed: data.get("disclose") === "on",
                    }),
                  );
                }}
              >
                <label>
                  Application method
                  <select
                    value={channel}
                    onChange={(event) => setChannel(event.target.value)}
                  >
                    <option value="gmail">Gmail</option>
                    <option value="linkedin">
                      LinkedIn Easy Apply · experimental
                    </option>
                  </select>
                </label>
                {channel === "gmail" ? (
                  <>
                    <Field
                      label="To"
                      name="to"
                      type="email"
                      defaultValue={job.email || ""}
                      required
                    />
                    <Field
                      label="Subject"
                      name="subject"
                      defaultValue={`Application: ${job.title || app.title}`}
                      required
                    />
                    <TextArea
                      label="Application message"
                      name="body"
                      required
                      defaultValue={`Hello,\n\nPlease find my tailored résumé and cover letter for the ${job.title || app.title} position attached.\n\nRegards,\n${state.identity.name || ""}`}
                    />
                  </>
                ) : (
                  <p>
                    Use your dedicated visible browser to sign in and complete
                    verification. Unsupported questions and forms pause for you.
                    LinkedIn can restrict automation. Verify the signed-in
                    account before final approval.
                  </p>
                )}
                <label className="check">
                  <input type="checkbox" name="disclose" required />
                  Allow disclosure of this custom résumé, cover letter and
                  contact details to the selected destination during preparation
                </label>
                <button
                  disabled={
                    channel === "gmail" && !connections?.gmail.connected
                  }
                >
                  Prepare application
                </button>
              </Form>
            </>
          )}
          {attempt && (
            <section aria-label="Application attempt">
              <p role="status">
                <strong>{attempt.status.replaceAll("_", " ")}</strong> ·{" "}
                {attempt.note}
              </p>
              <p>Custom résumé: {attempt.binding.resume.split("/").at(-1)}</p>
              <iframe
                title="Custom résumé for this listing"
                src={previews.resume}
              />
              {previews.resume && (
                <p>
                  <a
                    href={previews.resume}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open résumé PDF
                  </a>
                </p>
              )}
              {attempt.binding.cover_letter && (
                <>
                  <p>
                    Cover letter:{" "}
                    {attempt.binding.cover_letter.path.split("/").at(-1)}
                  </p>
                  <iframe
                    title="Cover letter for this listing"
                    src={previews["cover-letter"]}
                  />
                  {previews["cover-letter"] && (
                    <p>
                      <a
                        href={previews["cover-letter"]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open cover letter PDF
                      </a>
                    </p>
                  )}
                  <details>
                    <summary>Cover letter integrity</summary>
                    <code>{attempt.binding.cover_letter.sha256}</code>
                  </details>
                </>
              )}
              <details>
                <summary>Résumé integrity</summary>
                <code>{attempt.binding.sha256}</code>
              </details>
              <p>{attempt.payload.from && `From: ${attempt.payload.from}`}</p>
              <p>Destination: {attempt.payload.to || attempt.payload.url}</p>
              {attempt.payload.subject && <h3>{attempt.payload.subject}</h3>}
              {attempt.payload.body && <pre>{attempt.payload.body}</pre>}
              {attempt.payload.site_review && (
                <>
                  <h3>Website review</h3>
                  <pre>{attempt.payload.site_review.review_text}</pre>
                  {attempt.payload.site_review.fields.map((field, i) => (
                    <p key={i}>
                      {field.label}: {field.value}
                    </p>
                  ))}
                </>
              )}
              {attempt.status === "awaiting_approval" && (
                <Form
                  onSave={async (data) => {
                    if (data.get("approved") !== "on")
                      throw new Error(
                        "Review the résumé, account, destination and answers first.",
                      );
                    await operation("apply-approve", {
                      approved: true,
                      fingerprint: attempt.fingerprint,
                    });
                  }}
                >
                  <label className="check">
                    <input type="checkbox" name="approved" required />I reviewed
                    this exact résumé, sending account, destination and all
                    answers
                  </label>
                  <button
                    className="positive"
                    disabled={
                      !previews.resume ||
                      Boolean(coverHash && !previews["cover-letter"])
                    }
                  >
                    {attempt.channel === "gmail"
                      ? "Send application"
                      : "Submit application"}
                  </button>
                </Form>
              )}
              {attempt.status === "needs_user" &&
                attempt.channel === "linkedin" && (
                  <Action run={() => operation("apply-resume")}>
                    Resume after browser assistance
                  </Action>
                )}
              {[
                "preparing",
                "awaiting_approval",
                "needs_user",
                "failed",
              ].includes(attempt.status) && (
                <Action run={() => operation("apply-cancel")}>
                  Cancel attempt
                </Action>
              )}
              {attempt.status === "unknown" && (
                <Form
                  onSave={async (data) => {
                    await operation("apply-resolve", {
                      outcome: text(data, "outcome"),
                      evidence: text(data, "evidence"),
                      ...(state._workspace.snapshot ? { occurred_at: text(data, "occurred_at") } : {}),
                    });
                  }}
                >
                  <p>
                    Check Gmail Sent or the job-site receipt yourself before
                    resolving. This will not send again.
                  </p>
                  <label>
                    Verified outcome
                    <select name="outcome">
                      <option value="confirmed">
                        I verified it was sent/submitted
                      </option>
                      <option value="not_sent">
                        I verified it was not sent
                      </option>
                    </select>
                  </label>
                  <TextArea
                    label="Evidence checked"
                    name="evidence"
                    minLength={10}
                    required
                  />
                  {state._workspace.snapshot && (
                    <label>
                      Actual submission date (if submitted)
                      <input name="occurred_at" type="date" />
                    </label>
                  )}
                  <button>Record verified outcome</button>
                </Form>
              )}
              {["cancelled", "not_sent", "failed"].includes(attempt.status) && (
                <button
                  onClick={() => {
                    setAttempt(undefined);
                    setError("");
                  }}
                >
                  Prepare a new attempt
                </button>
              )}
              {attempt.receipt && (
                <details open>
                  <summary>Submission evidence</summary>
                  <pre>{JSON.stringify(attempt.receipt, null, 2)}</pre>
                </details>
              )}
            </section>
          )}
        </dialog>
      )}
    </>
  );
}
