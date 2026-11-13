# SQLite workspace implementation checklist

[Specification](spec.md) · [Implementation plan](plan.md) · [Verification](verification.md)

## First release

- [x] [1. Establish migration and workflow baselines](plan.md#1-establish-migration-and-workflow-baselines). Capture fictional legacy fixtures, exact document hashes, and expected decisions and queues for parity checks.
- [x] [2. Open and use a SQLite workspace](plan.md#2-open-and-use-a-sqlite-workspace). Requires 1. Verify existing API and CLI behavior, migration parity, isolation and recovery from a failed save.
- [x] [3. Publish readable Git snapshots on save](plan.md#3-publish-readable-git-snapshots-on-save). Requires 2. Check small diffs, automatic publication, conflict detection, interruption repair and clean-clone restore.
- [x] [4. Verify backups and the format switch](plan.md#4-verify-backups-and-the-format-switch). Requires 2–3. Check ZIP restore, both sides of an interrupted cutover, older-reader rejection and hosted compatibility.
- [x] [5. Compare roles and reconcile company history](plan.md#5-compare-roles-and-reconcile-company-history). Requires 2. Verify matching roles, duplicate and alias handling, history review, and portable company records through 3–4.
- [x] [6. Enforce the limit in discovery and application actions](plan.md#6-enforce-the-limit-in-discovery-and-application-actions). Requires 3–5. Verify competing approvals, uncertain outcomes, skip and resume dates, and behavior across UI, API and CLI paths.
- [ ] [7. Verify the release candidate and document recovery](plan.md#7-verify-the-release-candidate-and-document-recovery). Requires 1–6. The macOS candidate and recovery checks are recorded. Windows and Linux CI remain open before release.

## Follow-up releases

- [x] [8. Serve consistent application queues and history](plan.md#8-serve-consistent-application-queues-and-history). Requires 7. Verify legacy membership parity, pagination and exact document access.
- [x] [9. Apply source refreshes atomically](plan.md#9-apply-source-refreshes-atomically). Requires 7. Verify interruption preserves earlier results, and deduplication preserves job decisions.
- [x] [10. Link career evidence directly to requirements](plan.md#10-link-career-evidence-directly-to-requirements). Requires 7. Verify concurrent confirmation, provenance and retirement.
- [x] [11. Resume draft preparation by persisted run item](plan.md#11-resume-draft-preparation-by-persisted-run-item). Requires 7. Verify cancellation, restart and uncertain spending with a fake provider.

Attach the fixture, test, or release evidence to each task when completing it.
