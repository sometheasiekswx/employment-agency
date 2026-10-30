"use client";

import { useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { useDraft } from "@/components/unsaved";
import { Check, Field, Form, checked, text } from "@/components/controls";
import { errorMessage, splitList } from "@/lib/format";

function WorkspaceLocation() {
  const { state, client, refresh, notify } = useWorkspace();
  const { canLeave } = useDraft();
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="workspace-location">
        <p>
          <strong>Workspace location</strong>
          <br />
          <span>{state._workspace.path}</span>
        </p>
        <button
          ref={button}
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!canLeave()) return;
            setBusy(true);
            notify("Choose a workspace folder in the folder window.");
            try {
              const result = await client.action<{
                cancelled?: boolean;
                reload?: boolean;
              }>("workspace-browse");
              if (result.cancelled) notify("Folder selection cancelled.");
              else {
                await refresh();
                notify("Workspace opened.");
              }
            } catch (error) {
              notify(errorMessage(error));
            } finally {
              setBusy(false);
              requestAnimationFrame(() => button.current?.focus());
            }
          }}
        >
          {busy ? "Choose a folder…" : "Open Folder"}
        </button>
      </div>
      <p className="muted">
        Choose an existing workspace, or an empty folder to start a new one.
        Your files stay on this computer.
      </p>
    </>
  );
}

export function WorkspaceSetup() {
  const { run } = useWorkspace();
  return (
    <section>
      <h2>Your career workspace</h2>
      <p>
        Keep your master resume, career evidence and applications together here.
      </p>
      <WorkspaceLocation />
      <Form
        onSave={async () => {
          await run("workspace-settings", { setup_complete: true });
        }}
      >
        <button>Save</button>
      </Form>
    </section>
  );
}

export function WorkspaceSettings() {
  const { state, client, run } = useWorkspace();
  const workspace = state._workspace;
  if (client.hosted)
    return (
      <section>
        <h2>Private cloud workspace</h2>
        <p>
          Your data belongs to your signed-in account. Local-folder watching and
          custom LaTeX compilation are available in the local edition.
        </p>
      </section>
    );
  return (
    <section>
      <h2>Workspace files</h2>
      <WorkspaceLocation />
      <Form
        onSave={async (data) => {
          await run("workspace-settings", {
            master: text(data, "master"),
            timezone: text(data, "timezone"),
            preferred_locations: splitList(text(data, "preferred_locations")),
            master_template: checked(data, "master_template"),
          });
        }}
      >
        <Field
          label="Master resume path within this workspace"
          name="master"
          defaultValue={workspace.master}
        />
        <Field
          label="Timezone for version dates"
          name="timezone"
          defaultValue={workspace.timezone}
        />
        <Field
          label="Destination priorities, comma separated"
          name="preferred_locations"
          defaultValue={workspace.preferred_locations.join(", ")}
        />
        <Check
          label="Use my trusted LaTeX master layout (requires an installed compiler)"
          name="master_template"
          defaultChecked={workspace.master_template}
        />
        <button>Save</button>
      </Form>
    </section>
  );
}
