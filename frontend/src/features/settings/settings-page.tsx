"use client";

import { ArchiveRestore, Cloud, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Action, Field, Form, text } from "@/components/controls";
import { WorkspaceSettings } from "./workspace-settings";
import { downloadBlob } from "@/lib/api";

export function SettingsPage() {
  const { state, client, run, notify, clearSession } = useWorkspace();
  const exportWorkspace = async () => {
    if (client.hosted) await client.binary("export");
    else {
      const result = await client.action<{ file: string }>("export");
      const response = await fetch(`/exports/${result.file}`);
      if (!response.ok)
        throw new Error("Export download failed. Please try again.");
      downloadBlob(await response.blob(), "career-workspace.zip");
    }
    notify("Export ready. It contains private data.");
  };
  return (
    <div className="settings-page secondary-page">
      <p className="secondary-page-intro">
        Your workspace, privacy and recovery options.
      </p>
      <WorkspaceSettings />
      <div className="secondary-inline-note settings-control-note">
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <strong>You stay in control</strong>
          <p>
            Prepare and review your documents here. Submission decisions remain
            yours.
          </p>
        </div>
      </div>
      {client.hosted ? (
        <section className="secondary-panel settings-account-panel">
          <div className="secondary-section-heading">
            <h2>Account and recovery</h2>
            <Cloud size={18} aria-hidden="true" />
          </div>
          <p>
            Export a portable copy before major changes. Pilot limits: 2 MB
            imports, 25 application packages, 3 MB compressed workspace, 50 MB
            cumulative snapshot storage and 250 saves. No paid AI is enabled.
          </p>
          <div className="actions">
            <Action run={exportWorkspace}>Export private workspace</Action>
            <Action
              run={async () => {
                await client.auth?.logout();
                clearSession();
              }}
            >
              Sign out
            </Action>
          </div>
          <div className="settings-danger-zone">
            <h3>Delete account and all hosted data</h3>
            <p>
              This permanently deletes your cloud account and stored snapshots.
              Export first if you want to keep a copy. Local files are
              unaffected.
            </p>
            <Form
              onSave={async (data) => {
                const confirmation = text(data, "confirmation");
                if (confirmation !== "DELETE")
                  throw new Error(
                    "Type DELETE to confirm account and data deletion.",
                  );
                await client.action("delete-account", { confirmation });
                clearSession();
              }}
            >
              <Field label="Type DELETE" name="confirmation" />
              <button className="danger">Delete account and data</button>
            </Form>
          </div>
        </section>
      ) : (
        <div className="secondary-two-column settings-controls-grid">
          <section className="secondary-panel settings-consent-panel">
            <div className="secondary-section-heading">
              <h2>AI disclosure consent</h2>
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <p>
              Granting consent allows{" "}
              <strong>confirmed career facts and job descriptions</strong> to be
              shared with the selected provider for{" "}
              <strong>selecting application facts</strong>. Contact details and
              salary minimums are not included.
            </p>
            {["agent", "openai"].map((provider) => (
              <div className="settings-consent-provider" key={provider}>
                <h3>
                  {provider === "agent"
                    ? "Connected coding agent"
                    : "OpenAI API"}
                </h3>
                <p className="settings-consent-status">
                  {state.consents[provider]
                    ? "Consent granted"
                    : "No consent granted"}
                </p>
                <div className="actions">
                  {[true, false].map((grant) => (
                    <Action
                      key={String(grant)}
                      run={async () => {
                        await run("consent", {
                          provider,
                          grant,
                          purpose: "select_application_facts",
                          categories: ["confirmed_facts", "job_description"],
                        });
                      }}
                    >
                      {grant ? "Grant consent" : "Revoke"}
                    </Action>
                  ))}
                </div>
              </div>
            ))}
            <p className="muted">
              Revocation prevents future app-controlled requests; it cannot
              recall previously disclosed data. API keys stay in the launcher
              environment. An independently connected agent has its own access
              boundary.
            </p>
          </section>
          <section className="secondary-panel settings-recovery-panel">
            <div className="secondary-section-heading">
              <h2>Recovery and upgrades</h2>
              <ArchiveRestore size={18} aria-hidden="true" />
            </div>
            <p>
              Exports include private facts and applications, but exclude
              credentials and consent grants. Restore to a new workspace;
              existing files are never overwritten.
            </p>
            <Action run={exportWorkspace}>Export private workspace</Action>
            <pre>employment-agency restore backup.zip NEW_FOLDER</pre>
            <p className="muted">
              Keep your installed release pinned. A copy on this computer is not
              an off-device backup.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
