import { ApplicationsPage } from "@/features/applications/applications-page";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading applications…</p>}>
      <ApplicationsPage />
    </Suspense>
  );
}
