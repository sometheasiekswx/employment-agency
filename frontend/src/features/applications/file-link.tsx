"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";

export function FileLink({
  id,
  name,
  children,
  history = false,
}: {
  id: string;
  name: string;
  children: React.ReactNode;
  history?: boolean;
}) {
  const { client, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const href = history
    ? `/history/files/${id}/${encodeURIComponent(name)}`
    : `/files/${id}/${encodeURIComponent(name)}`;
  return (
    <a
      className="button"
      href={href}
      target="_blank"
      rel="noopener"
      aria-disabled={busy}
      onClick={async (event) => {
        if (!client.hosted) return;
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          await client.binary(history ? "history-file" : "file", { id, name });
        } catch (error) {
          notify(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </a>
  );
}
