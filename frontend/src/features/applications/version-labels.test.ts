import { expect, it } from "vitest";
import type { Application, HistoryVersion } from "@/lib/models";
import { historyVersionLabel } from "./version-labels";

const history: HistoryVersion = {
  id: "preserved-files",
  city: "Toronto",
  company: "Fictional Systems",
  job: "Software Engineer",
  label: "06-11-2026/12-30-00",
  generated_at: "2026-11-06T12:30:00Z",
  date_uncertain: false,
  source: "Fictional generated application",
  files: ["resume.pdf"],
};
const application = (
  id: string,
  created_at: string,
  status: Application["status"] = "draft",
): Application => ({
  id,
  job_id: "job-1",
  title: history.job,
  employer: history.company,
  created_at,
  status,
  comments: [],
  folder: [
    "applications",
    history.city,
    history.company,
    history.job,
    history.label,
  ].join("/"),
});

it("does not infer an external record's status from a similarly named folder", () => {
  const otherEmployer = {
    ...application("other", "2026-11-06", "submitted"),
    folder: application("other", "2026-11-06").folder!.replace(
      "Fictional Systems",
      "Other Systems",
    ),
  };
  const result = historyVersionLabel(history, [otherEmployer], "UTC");
  expect(result.title).toBe("Preserved document version");
  expect(result.records).toEqual([]);
  expect(result.title).not.toMatch(/Draft|Reviewed|Submitted|Rejected/);
});

it("keeps separate correction and recovery labels when records share the same files", () => {
  const submitted: Application = {
    ...application("sent", "2026-11-06T12:30:00Z", "submitted"),
    submission_correction: {
      at: "2026-11-07",
      reason: "Fictional correction",
      recovery_application_id: "recovered",
    },
  };
  const recovered: Application = {
    ...application("recovered", "2026-11-07", "draft"),
    submission_recovery: {
      original_id: submitted.id,
      at: "2026-11-07",
      reason: "Fictional correction",
    },
  };
  const result = historyVersionLabel(history, [submitted, recovered], "UTC");
  expect(result.title).toBe("Shared document version");
  expect(result.date).toBe("6 Nov 2026, 12:30 pm UTC");
  expect(result.records.map((record) => record.label)).toEqual([
    "Version 1 · Submitted · 6 Nov 2026, 12:30 pm UTC",
    "Version 2 · Draft · 7 Nov 2026",
  ]);
  expect(result.records.map((record) => record.application.id)).toEqual([
    submitted.id,
    recovered.id,
  ]);
});
