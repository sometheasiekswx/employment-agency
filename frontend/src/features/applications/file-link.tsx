"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";

export function FileLink({
  id,
  name,
  children,
  history = false,
  download = false,
}: {
  id: string;
  name: string;
  children: React.ReactNode;
  history?: boolean;
  download?: boolean;
}) {
  const { client, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const href = client.preview
    ? client.previewFileUrl(id, name, history)
    : history
      ? `/history/files/${id}/${encodeURIComponent(name)}`
      : `/files/${id}/${encodeURIComponent(name)}`;
  return (
    <>
      <a
        className="button"
        href={href}
        target={download ? undefined : "_blank"}
        rel="noopener"
        download={download || undefined}
        aria-disabled={busy || !href}
        onClick={async (event) => {
          if (!client.hosted) return;
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await client.binary(history ? "history-file" : "file", {
              id,
              name,
            });
          } catch (error) {
            const message = errorMessage(error);
            setError(message);
            notify(message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </a>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
