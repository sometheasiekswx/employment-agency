import { Suspense } from "react";
import { HistoryPage } from "@/features/history/history-page";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading application history…</p>}>
      <HistoryPage />
    </Suspense>
  );
}
