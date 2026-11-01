"use client";

import type { Application } from "@/lib/models";
import BellToggle from "./bell-toggle";
export function ReviewStatus({
  status,
  form,
  busy,
}: {
  status: Application["status"];
  form: string;
  busy: boolean;
}) {
  if (status !== "draft" && status !== "reviewed") {
    return (
      <span className="pill" data-status={status}>
        {status}
      </span>
    );
  }
  const reviewed = status === "reviewed";
  return (
    <BellToggle
      className="review-status"
      offLabel="Draft"
      onLabel="Reviewed"
      label={
        reviewed ? "Reviewed — switch to Draft" : "Draft — switch to Reviewed"
      }
      pressed={reviewed}
      busy={busy}
      badge={false}
      color="var(--ink)"
      background="var(--secondary)"
      onColor="var(--link)"
      onBackground="var(--accent-soft)"
      buttonProps={{
        type: "submit",
        form,
        name: "status",
        value: reviewed ? "draft" : "reviewed",
        "data-status": status,
      }}
    />
  );
}
