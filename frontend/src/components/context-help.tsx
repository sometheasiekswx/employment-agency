import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function ContextHelp({
  topic,
  children,
}: {
  topic: string;
  children: ReactNode;
}) {
  return (
    <details className="context-help">
      <summary>
        <Info size={16} aria-hidden="true" />
        <span>{topic}</span>
      </summary>
      <div className="context-help-content">{children}</div>
    </details>
  );
}
