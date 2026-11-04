import { Suspense } from "react";
import { DiscoverPage } from "@/features/discover/discover-page";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading opportunities…</p>}>
      <DiscoverPage />
    </Suspense>
  );
}
