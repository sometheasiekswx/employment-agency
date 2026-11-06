import { LegacyOpportunitiesRedirect } from "@/components/legacy-opportunities-redirect";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening Opportunities…</p>}>
      <LegacyOpportunitiesRedirect />
    </Suspense>
  );
}
