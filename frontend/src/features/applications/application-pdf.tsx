"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";
import { EditorPdfPreview } from "./editor-pdf-preview";
import "./editor-navigation.css";

export function ApplicationPdf({
  id,
  name,
  readingText,
}: {
  id: string;
  name: "resume.pdf" | "cover-letter.pdf";
  readingText: boolean;
}) {
  const { client } = useWorkspace();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<
    { bytes: Uint8Array } | { error: string }
  >();
  useEffect(() => {
    let active = true;
    client.readDocument(id, name).then(
      (bytes) => {
        if (active) setResult({ bytes });
      },
      (error) => {
        if (active) setResult({ error: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [client, id, name, retry]);

  if (!result) return <p role="status">Loading PDF preview…</p>;
  if ("error" in result)
    return (
      <div className="application-preview-error">
        <p role="alert">PDF preview unavailable. {result.error}</p>
        <button
          type="button"
          onClick={() => {
            setResult(undefined);
            setRetry((value) => value + 1);
          }}
        >
          Retry preview
        </button>
      </div>
    );
  return (
    <EditorPdfPreview
      pdf={result.bytes}
      zoomed={false}
      readingText={readingText}
    />
  );
}
