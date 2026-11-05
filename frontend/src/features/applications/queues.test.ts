import { expect, it } from "vitest";
import type { Application } from "@/lib/models";
import { applicationQueues } from "./queues";

const version = (
  id: string,
  changes: Partial<Application> = {},
): Application => ({
  id,
  job_id: "job-a",
  title: "Engineer",
  employer: "Fictional Systems",
  status: "draft",
  comments: [],
  ...changes,
});
const ids = (apps: Application[], history = false) =>
  applicationQueues(apps, history).map((app) => app.id);

it("keeps a submitted snapshot authoritative over later drafts and rejected siblings", () => {
  const apps = [
    version("sent", { status: "submitted", created_at: "2026-10-20" }),
    version("edit", { created_at: "2026-10-21" }),
    version("old-rejection", { status: "rejected", created_at: "2026-10-22" }),
  ];
  const before = structuredClone(apps);
  expect(ids(apps)).toEqual(["sent"]);
  expect(ids(apps, true)).toEqual(["sent"]);
  expect(apps).toEqual(before);
});

it("keeps a genuinely new draft after rejection active", () => {
  expect(
    ids([
      version("rejected", { status: "rejected", created_at: "2026-10-20" }),
      version("new", { created_at: "2026-10-21" }),
    ]),
  ).toEqual(["new"]);
});

it("resolves archived submissions before hiding earlier review queues", () => {
  const apps = [
    version("old-draft"),
    version("legacy-sent", { status: "submitted", archived: true }),
  ];
  expect(ids(apps)).toEqual([]);
  expect(ids(apps, true)).toEqual(["legacy-sent"]);
});

it("does not replace a current version with an archived imported queue", () => {
  expect(
    ids(
      [
        version("current", { created_at: "2026-10-20" }),
        version("imported", {
          archived: true,
          status: "rejected",
          created_at: "2026-10-21",
        }),
      ],
      true,
    ),
  ).toEqual(["current"]);
});

it("keeps different requisitions distinct even with identical employer and title", () => {
  expect(
    ids([version("first"), version("second", { job_id: "job-b" })]),
  ).toEqual(["first", "second"]);
});

it("uses persisted order for equal or absent dates, and compares timezone offsets as instants", () => {
  expect(ids([version("first"), version("second")])).toEqual(["second"]);
  expect(
    ids([
      version("later", { created_at: "2026-10-21T00:30:00Z" }),
      version("earlier", { created_at: "2026-10-21T08:00:00+11:00" }),
    ]),
  ).toEqual(["later"]);
  expect(
    ids([
      version("first", { created_at: "2026-10-21T00:00:00Z" }),
      version("second", { created_at: "2026-10-21T00:00:00Z" }),
    ]),
  ).toEqual(["second"]);
});

it("chooses submitted snapshots by decision time with creation-time fallback", () => {
  expect(
    ids([
      version("latest-send", {
        status: "submitted",
        submitted_at: "2026-10-23",
        created_at: "2026-10-20",
      }),
      version("earlier-send", {
        status: "submitted",
        submitted_at: "2026-10-22",
        created_at: "2026-10-21",
      }),
    ]),
  ).toEqual(["latest-send"]);
  expect(
    ids([
      version("legacy", {
        status: "submitted",
        comments: [{ at: "2026-10-22", status: "submitted", text: "" }],
      }),
      version("new", { status: "submitted", created_at: "2026-10-21" }),
    ]),
  ).toEqual(["legacy"]);
});

it("excludes a corrected original from current queues while preserving the recovered review record and source data", () => {
  const apps = [
    version("incorrect-sent", {
      status: "submitted",
      created_at: "2026-11-05",
      folder: "applications/fictional/original",
      manifest_hash: "verified-original",
      submission_correction: {
        at: "2026-11-05",
        reason: "Recorded by mistake",
        recovery_application_id: "recovered",
      },
    }),
    version("recovered", {
      created_at: "2026-11-05",
      folder: "applications/fictional/original",
      manifest_hash: "verified-original",
      submission_recovery: {
        original_id: "incorrect-sent",
        at: "2026-11-05",
        reason: "Recorded by mistake",
      },
    }),
  ];
  const before = structuredClone(apps);
  expect(ids(apps)).toEqual(["recovered"]);
  expect(ids(apps, true)).toEqual(["recovered"]);
  expect(apps).toEqual(before);
});

it("keeps a valid Submitted sibling authoritative over corrected originals and recovered drafts regardless of order", () => {
  const corrected = version("mistaken-submission", {
    status: "submitted",
    submitted_at: "2026-11-05",
    folder: "applications/fictional/original",
    manifest_hash: "verified-original",
    submission_correction: {
      at: "2026-11-05",
      reason: "Wrong record",
      recovery_application_id: "recovered",
    },
  });
  const recovered = version("recovered", {
    created_at: "2026-11-05",
    folder: "applications/fictional/original",
    manifest_hash: "verified-original",
    submission_recovery: {
      original_id: corrected.id,
      at: "2026-11-05",
      reason: "Wrong record",
    },
  });
  const valid = version("real-submission", {
    status: "submitted",
    submitted_at: "2026-11-04",
  });
  for (const apps of [
    [valid, corrected, recovered],
    [recovered, corrected, valid],
    [corrected, valid, recovered],
  ]) {
    expect(ids(apps)).toEqual(["real-submission"]);
    expect(ids(apps, true)).toEqual(["real-submission"]);
  }
});

it.each([
  ["missing recovery", undefined],
  ["missing lineage", {}],
  [
    "wrong original",
    {
      submission_recovery: {
        original_id: "different-original",
        at: "2026-11-05",
        reason: "Imported correction",
      },
    },
  ],
  [
    "changed document manifest",
    {
      manifest_hash: "different-manifest",
      submission_recovery: {
        original_id: "original",
        at: "2026-11-05",
        reason: "Imported correction",
      },
    },
  ],
  [
    "different document folder",
    {
      folder: "applications/another-version",
      submission_recovery: {
        original_id: "original",
        at: "2026-11-05",
        reason: "Imported correction",
      },
    },
  ],
] as const)(
  "retains Submitted authority when correction recovery has %s",
  (_label, recoveryChanges) => {
    const original = version("original", {
      status: "submitted",
      submitted_at: "2026-11-05",
      folder: "applications/fictional/original",
      manifest_hash: "verified-original",
      submission_correction: {
        at: "2026-11-05",
        reason: "Imported correction",
        recovery_application_id: "recovery",
      },
    });
    const recovery =
      recoveryChanges == null
        ? []
        : [
            version("recovery", {
              created_at: "2026-11-06",
              folder: original.folder,
              manifest_hash: original.manifest_hash,
              ...recoveryChanges,
            }),
          ];
    expect(ids([original, ...recovery])).toEqual(["original"]);
    expect(ids([original, ...recovery], true)).toEqual(["original"]);
  },
);
