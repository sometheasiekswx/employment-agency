# Shared application and portable career workspaces

The confirmed scope is recorded in [ADR 0001](adr/0001-shared-application-data-only-workspaces.md), [ADR 0002](adr/0002-authoritative-workspace-files.md) and [ADR 0003](adr/0003-reconcile-edits-and-preserve-migration-history.md). All reusable functionality belongs in this package. Workspaces contain personal data and declarative configuration only.

## Acceptance contract

- Source installs default to ignored `workspace/`; create/open another folder is a secondary option. One active workspace per process, locked against concurrent writers. Switching rotates browser authority and refuses active runs.
- Durable JSON records and organised application versions live in the selected workspace. Credentials and local provider permissions never enter portable exports or durable records.
- The current interface, named documents, history navigation and optional trusted master-LaTeX layout are shared features driven by workspace settings, without personal identities or locations in public code.
- Generation stages files temporarily, validates them and publishes one authoritative version. Document links reference those files. Verified originals have recovery snapshots; direct changes require validation as a new draft. Submitted records cannot be silently rewritten.
- Changes to the selected master are detected, proposed with provenance and confirmed before use. Supplemental facts survive reconciliation. Existing documents never regenerate automatically.
- Migration preserves current and legacy queues, unique documents, historical decisions and uncertain provenance. Backup and restore verification precede retirement of old application code. Migration can be rerun safely and never silently invents submission status.
- No email sending, employer upload, paid requests, automatic Git operations or release publication are part of this change.

## Implementation and verification plan

- [x] S1: Workspace configuration, schema upgrade, isolated local permissions and expanded export/restore. Verify old schema preservation, lock handling, traversal rejection and round trips.
- [x] S2: Shared canonical document storage, history, master renderer and integrity/version recovery. Verify generation and direct document links, altered-file detection, edited-version validation and submitted preservation.
- [x] S3: Master reconciliation and shared UI/setup. Verify external-workspace master changes, retained supplemental facts, explicit switching, empty defaults and responsive browser behavior.
- [x] S4: Idempotent legacy migration and private cutover. Compare file hashes, application IDs/statuses/comments and archive coverage; restore the migrated export before retiring code.
- [x] S5: Full tests, browser checks, package build, security/privacy review and readiness report. Preserve unrelated changes; do not commit or publish.

Existing stack: Python stdlib HTTP/JSON, vanilla browser JavaScript, ReportLab, python-docx, pypdf and optional installed LaTeX. No new runtime dependency is planned. Tests: `python -m unittest discover -s tests -v`, JavaScript syntax checks, synthetic browser fixtures and private migration integrity checks. Tests are unrun for this refactor until evidence is recorded here.


## Verification and review — 29 October 2026

All five slices completed. `python -m unittest discover -s tests -q`: 33 passing tests. The suite covers schema/storage contracts, recovery, locks, traversal, local permissions, source-root protection, migration repeatability, master changes and supplementary-date conflicts, external edit validation and historical versions without active cards. Existing workflow tests now verify canonical paths and absence of working package copies instead of assuming the retired package directory.

Both browser acceptance scripts passed against disposable fictional data: identity → facts → profile → job → ranking → generation → review, then external edits → new draft → master reconciliation → create/open/switch. Layout checks passed at 320, 390, 768, 1024 and 1440 pixels across the two scripts; no JavaScript page errors. Screenshots were visually inspected. A separate read-only check of the migrated private interface verified current cards, pending master review, settings, history and canonical PDF routes. Automated axe scanning was unavailable in the bundled browser dependencies; no axe pass is claimed.

Migration/recovery evidence is private and stays in the external workspace/recovery directory. IDs, comments, statuses and current PDF bytes were compared, all historical versions retained, and a complete export restored before software retirement. The pre-migration snapshot was also restored with every saved regular-file hash verified. Supplemental confirmations remain independent of master reconciliation. Legacy records with unknown exact submitted-file associations remain labelled accordingly.

Review fixed missing bold skills/education in master extraction, stale editable companions after PDF edits, Word/TeX edit ordering, migration locking, export coverage for extra user folders, stale-tab mutation authority, source-checkout data placement, and history-only edit validation. Filesystem paths, HTML escaping, manifest hashes, MIME attachment bytes, source data boundaries and font licensing were inspected. No unresolved blocking finding remains within the verified macOS scope.

The wheel contains the shared assets/font licence and matches current package sources. A targeted personal-data and credential-pattern check found no real career material in the distribution; this is not a general guarantee against every secret pattern. The verified local package is 0.2.0, pinned by wheel hash in the private workspace. Git working changes are intentionally uncommitted; no push, remote release, CI run, employer submission, email send or paid provider request occurred. Windows/Linux startup and platform-specific filesystem behaviour were not exercised in this refactor; previous-release CI does not prove this revision.

Operational limits: arbitrary imported layouts are not reproduced; optional master rendering supports the documented navy macro structure. Word edits require a matching exported PDF; unsupported conversions fail clearly. Master reconciliation uses source diffs and explicit association/date comparisons, not a semantic guarantee that every possible contradiction can be detected. The running app uses the installed wheel, so development changes require an explicit rebuild/reinstall and restart.
