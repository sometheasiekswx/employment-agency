"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  CircleHelp,
  FileText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Action,
  Check,
  Field,
  Form,
  checked,
  values,
} from "@/components/controls";
import { displayDate } from "@/lib/format";
import { PREVIEW_READ_ONLY, publicPreviewEnabled } from "@/lib/public-preview";
import { FactForm } from "./fact-form";
import { MasterPanel } from "./master-panel";
import { DemoResumePanel } from "./demo-resume-panel";

export function CareerPage() {
  const { state, client, run, notify } = useWorkspace();
  const identity = state.identity;
  const facts = state.facts.filter((fact) => !fact.retired);
  const retired = state.facts.filter((fact) => fact.retired);
  const confirmed = facts.filter((fact) => fact.confirmed && !fact.conflict);
  const needsReview = facts.filter((fact) => !fact.confirmed || fact.conflict);
  const skills = confirmed.filter(
    (fact) => fact.category === "skill" || fact.category === "skills",
  );
  const [retiringId, setRetiringId] = useState("");
  const [factActionPending, setFactActionPending] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const retireOpener = useRef<HTMLButtonElement | null>(null);
  const retirementHeading = useRef<HTMLHeadingElement>(null);
  const retiredDetails = useRef<HTMLDetailsElement>(null);
  const retiredSummary = useRef<HTMLElement>(null);
  const activeFacts = useRef(new Map<string, HTMLDivElement>());
  const focusIntent = useRef<{
    kind: "retired" | "restored";
    id: string;
  } | null>(null);
  const preview = Boolean(client.preview) || publicPreviewEnabled();
  const publicResume = client.demoDrafts?.demoResume?.pdf;
  useEffect(() => {
    if (retiringId) retirementHeading.current?.focus();
  }, [retiringId]);
  useEffect(() => {
    const intent = focusIntent.current;
    if (!intent) return;
    const fact = state.facts.find((item) => item.id === intent.id);
    if (intent.kind === "retired" && fact?.retired && retiredDetails.current) {
      retiredDetails.current.open = true;
      retiredSummary.current?.focus();
      focusIntent.current = null;
    } else if (intent.kind === "restored" && fact && !fact.retired) {
      const element = activeFacts.current.get(intent.id);
      if (element) {
        element.focus();
        focusIntent.current = null;
      }
    }
  }, [state.facts, focusSignal]);
  const initials =
    identity.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name[0])
      .join("") || "U";
  return (
    <div className="career-page secondary-page">
      <p className="secondary-page-intro">
        {publicResume
          ? "Browse the public résumé and the career evidence drawn from it."
          : "Manage your profile and review the evidence used in your application drafts."}
      </p>
      <div className="career-profile-summary">
        <div className="career-avatar" aria-hidden="true">
          {initials}
        </div>
        <div>
          <h2>{identity.name || "Your career profile"}</h2>
          <p>
            {identity.location ||
              (publicResume
                ? "Public career profile"
                : "Add your location and relocation preferences.")}
          </p>
          <span>
            {confirmed.length} confirmed facts · {needsReview.length} need
            review
          </span>
        </div>
        <nav
          className="career-profile-actions"
          aria-label="Career profile sections"
        >
          {!publicResume && (
            <a href="#career-details" className="button secondary">
              <UserRound size={15} aria-hidden="true" />
              Edit profile
            </a>
          )}
          {!client.demoDrafts && (
            <a href="#master-resume" className="button secondary">
              Master resume
            </a>
          )}
          <a href="#import-resume" className="button primary">
            Import resume
          </a>
        </nav>
      </div>
      <div className="career-evidence-grid">
        <div className="career-evidence-main">
          {skills.length > 0 && (
            <section className="secondary-panel career-skills">
              <h2>Skills</h2>
              <div className="career-skill-tags">
                {skills.map((fact) => (
                  <span key={fact.id}>{fact.text}</span>
                ))}
              </div>
            </section>
          )}
          <section className="secondary-panel career-facts">
            <div className="secondary-section-heading">
              <h2>Career facts</h2>
              <span className="pill">{confirmed.length} confirmed</span>
            </div>
            <p className="muted">
              Only confirmed, conflict-free facts are used. Editing resets
              confirmation. A shared conflict key identifies competing versions
              of a claim.
            </p>
            {facts.map((fact) => (
              <div
                className="fact career-fact"
                key={fact.id}
                id={`career-fact-${fact.id}`}
                tabIndex={-1}
                ref={(element) => {
                  if (element) activeFacts.current.set(fact.id, element);
                  else activeFacts.current.delete(fact.id);
                }}
              >
                <div className="career-fact-heading">
                  {fact.confirmed && !fact.conflict ? (
                    <CircleCheck size={17} aria-hidden="true" />
                  ) : (
                    <CircleHelp size={17} aria-hidden="true" />
                  )}
                  <span
                    className={`pill ${fact.conflict ? "career-fact-conflict" : fact.confirmed ? "career-fact-confirmed" : "career-fact-pending"}`}
                  >
                    {fact.conflict
                      ? "Conflict — resolve before use"
                      : fact.confirmed
                        ? "Confirmed"
                        : "Needs your confirmation"}
                  </span>
                  {fact.category && (
                    <span className="career-fact-category">
                      {fact.category}
                    </span>
                  )}
                </div>
                <p>{fact.text}</p>
                <small>
                  {[fact.association, fact.dates, fact.source?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                <div className="actions">
                  {!fact.confirmed && !fact.conflict && (
                    <Action
                      className="positive"
                      disabled={factActionPending}
                      run={async () => {
                        await run("confirm", { id: fact.id });
                      }}
                    >
                      Confirm
                    </Action>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={preview || factActionPending}
                    title={preview ? PREVIEW_READ_ONLY : undefined}
                    aria-expanded={retiringId === fact.id}
                    aria-controls={
                      retiringId === fact.id
                        ? `retire-fact-${fact.id}`
                        : undefined
                    }
                    onClick={(event) => {
                      focusIntent.current = null;
                      retireOpener.current = event.currentTarget;
                      setRetiringId(fact.id);
                      if (retiringId === fact.id)
                        retirementHeading.current?.focus();
                    }}
                  >
                    Retire
                  </button>
                </div>
                {retiringId === fact.id && (
                  <Form
                    id={`retire-fact-${fact.id}`}
                    aria-labelledby={`retire-fact-heading-${fact.id}`}
                    onBusyChange={setFactActionPending}
                    onSave={async () => {
                      focusIntent.current = null;
                      await run(
                        "retire",
                        { id: fact.id },
                        "Career fact retired. You can restore it from Retired facts.",
                      );
                      focusIntent.current = { kind: "retired", id: fact.id };
                      setRetiringId("");
                      setFocusSignal((value) => value + 1);
                    }}
                  >
                    <h3
                      id={`retire-fact-heading-${fact.id}`}
                      ref={retirementHeading}
                      tabIndex={-1}
                    >
                      Retire this career fact?
                    </h3>
                    <p>
                      It will be excluded from future drafts. Its text and
                      source history stay preserved. You can restore it later
                      for review and confirmation.
                    </p>
                    <div className="actions">
                      <button className="danger" disabled={preview}>
                        Retire fact
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          focusIntent.current = null;
                          setRetiringId("");
                          retireOpener.current?.focus();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </Form>
                )}
                <details>
                  <summary>Edit fact</summary>
                  <FactForm fact={fact} />
                </details>
              </div>
            ))}
            {!facts.length && (
              <p className="empty">
                {retired.length
                  ? "No active career facts. Restore a retired fact or add new evidence below."
                  : "No career facts yet. Import a resume or add your first experience below."}
              </p>
            )}
            <details ref={retiredDetails}>
              <summary ref={retiredSummary}>
                Retired facts ({retired.length})
              </summary>
              <p className="muted">
                Retired facts stay out of drafts. Restore a fact to review it
                and confirm it again before use.
              </p>
              {retired.map((fact) => (
                <div className="fact career-fact" key={fact.id}>
                  <p>{fact.text}</p>
                  <small>
                    {[fact.association, fact.dates, fact.source?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {fact.source?.at && (
                    <p className="muted">
                      Source recorded{" "}
                      {displayDate(fact.source.at, state._workspace.timezone)}
                    </p>
                  )}
                  <div className="actions">
                    <Action
                      disabled={preview || factActionPending}
                      run={async () => {
                        focusIntent.current = null;
                        setFactActionPending(true);
                        try {
                          await run(
                            "restore-fact",
                            { id: fact.id },
                            "Career fact restored. Review and confirm it before use.",
                          );
                          focusIntent.current = {
                            kind: "restored",
                            id: fact.id,
                          };
                          setFocusSignal((value) => value + 1);
                        } finally {
                          setFactActionPending(false);
                        }
                      }}
                    >
                      Restore
                    </Action>
                  </div>
                </div>
              ))}
              {!retired.length && <p className="empty">No retired facts.</p>}
            </details>
          </section>
        </div>
        <aside
          className="career-evidence-aside"
          aria-label="Master resume and confirmation"
        >
          {client.demoDrafts ? (
            <DemoResumePanel session={client.demoDrafts} />
          ) : (
            <MasterPanel />
          )}
          <section
            className="secondary-panel career-confirmation"
            data-review-needed={needsReview.length > 0}
          >
            <h2>Needs confirmation</h2>
            <div className="secondary-inline-note">
              {needsReview.length ? (
                <CircleHelp size={19} aria-hidden="true" />
              ) : (
                <ShieldCheck size={19} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {needsReview.length
                    ? `${needsReview.length} career facts to review`
                    : "Your career facts are reviewed"}
                </strong>
                <p>
                  {needsReview.length
                    ? "Review imported statements and resolve conflicting claims before using them in an application."
                    : "New imports and edits will appear here for your review."}
                </p>
              </div>
            </div>
            <p className="muted">
              Work rights and sponsorship are checked separately for each role.
            </p>
          </section>
        </aside>
      </div>
      <div className="secondary-two-column career-editing-grid">
        <section className="secondary-panel" id="career-details">
          <div className="secondary-section-heading">
            <h2>Your details</h2>
            <UserRound size={18} aria-hidden="true" />
          </div>
          <Form
            onSave={async (data) => {
              await run("identity", values(data));
            }}
          >
            <Field
              label="Name"
              name="name"
              defaultValue={identity.name}
              autoComplete="name"
            />
            <Field
              label="Email"
              name="email"
              type="email"
              defaultValue={identity.email}
              autoComplete="email"
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={identity.phone}
              autoComplete="tel"
            />
            <Field
              label="Current location / relocation statement"
              name="location"
              defaultValue={identity.location}
            />
            <Field
              label="Languages"
              name="languages"
              defaultValue={identity.languages}
            />
            <button>Save details</button>
          </Form>
        </section>
        {!client.demoDrafts && (
          <section className="secondary-panel">
            <div className="secondary-section-heading">
              <h2 id="import-resume" tabIndex={-1}>
                Build your career evidence
              </h2>
              <FileText size={18} aria-hidden="true" />
            </div>
            <p>
              Import your master resume, then review extracted statements. Add
              experience that never made it onto your resume.
            </p>
            <Form
              onSave={async (data) => {
                const file = data.get("file");
                const limit = (client.hosted ? 2 : 10) * 1024 * 1024;
                if (!(file instanceof File) || !file.size || file.size > limit)
                  throw new Error(
                    `Choose a file up to ${client.hosted ? 2 : 10} MB.`,
                  );
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = "";
                for (let index = 0; index < bytes.length; index += 8192)
                  binary += String.fromCharCode(
                    ...bytes.subarray(index, index + 8192),
                  );
                const result = await run<{
                  candidates: number;
                  truncated?: boolean;
                }>(
                  "import",
                  {
                    name: file.name,
                    data: btoa(binary),
                    use_as_master: checked(data, "use_as_master"),
                  },
                  "",
                );
                notify(
                  `${result.candidates} candidate facts imported; review before confirming.${result.truncated ? " Import truncated at 500 candidates." : ""}`,
                );
              }}
            >
              <Field
                label="Resume file"
                name="file"
                type="file"
                accept=".pdf,.docx,.tex,.txt,.md"
                required
              />
              <Check
                label="Use this file as my master resume"
                name="use_as_master"
                defaultChecked
              />
              <small>
                Up to {client.hosted ? 2 : 10} MB. Scanned files need OCR text.
                Imported TeX is never executed.
              </small>
              <button>Import for review</button>
            </Form>
            <details>
              <summary>Add experience or a skill</summary>
              <FactForm />
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
