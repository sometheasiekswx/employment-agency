"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useDraft } from "./unsaved";

/** Keeps existing application bookmarks usable in the static frontend export. */
export function LegacyOpportunitiesRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const { canLeave } = useDraft();
  const query = new URLSearchParams(params.toString());
  const applicationLink = [
    "application",
    "section",
    "history",
    "destination",
  ].some((key) => query.has(key));
  if (applicationLink) {
    query.set("view", "applications");
    if (!query.has("section")) query.set("section", "active");
    if (query.has("application") && !query.has("panel"))
      query.set("panel", "documents");
  }
  const href = `/discover/${query.size ? `?${query}` : ""}`;

  useEffect(() => {
    if (canLeave()) router.replace(`${href}${window.location.hash}`);
  }, [canLeave, href, router]);

  return (
    <p role="status">
      Continue in{" "}
      <Link
        href={href}
        onNavigate={(event) => {
          if (!canLeave()) event.preventDefault();
        }}
      >
        Opportunities
      </Link>
      .
    </p>
  );
}
