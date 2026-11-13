# SQLite workspace implementation plan

[Specification](spec.md) · [Implementation checklist](todo.md)

The first release covers the local SQLite workspace, automatic readable Git snapshots, verified recovery, and the company shortlist and cooldown. Tasks 1–7 form that release. The later workflow changes can ship independently once the new store is in use.

## Approach

- Use the current workspace lock and shared Python service as the compatibility boundary. Keep the shape of `state` and existing actions while callers move to focused queries. Store durable entities as rows and use relational constraints for the keys and links the app relies on. A read-only SQL index can help compare migration results during development. Making SQLite authoritative at cutover lets related saves and submission decisions commit together. [Workspace store](../../employment_agency/store.py) · [Service](../../employment_agency/service.py)
- Keep a compact logical state payload inside portable backups, where it can travel with document files. Generate smaller record files for everyday Git review. A complete backup can be produced from the database even while the Git snapshot needs repair. The save operation records pending snapshot work with the data change, then publishes the affected files and manifest. [Workspace file decisions](../../docs/adr/0002-authoritative-workspace-files.md)
- Choose the local storage format explicitly at the open, create, and restore boundaries. The hosted pilot uses the same archive reader and a `Workspace` subclass, so keep its existing archive and backend selection explicit. Exercise local CLI demos separately from the hosted pilot and the static public showcase. [Hosted store](../../employment_agency/cloud.py) · [Local demo workspace](../../employment_agency/demo.py)
- Keep policy decisions in shared service operations. The current `handoff` shares evidence for draft preparation. A submission handoff needs its own exact approval and reservation. A user can record an application made independently, with its original date and evidence. [Agent workflow](../../docs/agents.md) · [Submission approval](../../docs/adr/0005-explicit-approval-for-external-application-actions.md)

## First release

### 1. Establish migration and workflow baselines

Create fictional fixtures for supported legacy state and archives, a plain folder, and a private Git clone. Include an archived version, a tag-only submission, a corrected submission, an unresolved historical employer or date, and confirmed and uncertain delivery evidence. Record stable IDs, effective decisions, queue membership, permissions behavior and hashes of canonical documents before conversion. Exercise the same fixtures through the CLI and local API. Capture current list and ranking behavior for later comparison. [Workspace contracts](../../tests/test_workspaces.py) · [Submission authority tests](../../tests/test_submission_authority.py) · [Hosted contracts](../../tests/test_cloud.py)

Use the fixture outputs as the reference for the importer and restore tests. Check the Python 3.11 package floor and the current CI runtime for transaction, connection backup and lock behavior. The planning probe used two connections to a temporary database on macOS and confirmed write contention, a committed read after the first writer released its lock, and backup integrity. Application migration and recovery require their own tests.

### 2. Open and use a SQLite workspace

After task 1, implement the staged importer, versioned schema and SQLite implementation of the existing workspace contract. Preserve job, fact and application version IDs, source provenance, document references and legacy fields. Bring active delivery journals and effective submission records into the same live store with their existing statuses and evidence references. Keep retained legacy evidence files available. Preserve the workspace lock, path checks, provider permissions and the existing JSON backend for legacy and hosted callers. Update folder detection for `init`, `serve`, development launchers and the workspace picker. [Workspace store](../../employment_agency/store.py) · [Workspace selection](../../employment_agency/server.py) · [CLI](../../employment_agency/cli.py) · [Delivery journal](../../employment_agency/application_delivery.py)

On a staged copy, compare the baseline records and queues. Create, save, reopen and switch workspaces through existing entry points. Verify master reconciliation, preservation of original document bytes when adding a version, recovery of a published folder after a failed database commit, and source preservation when data is invalid or unsupported. Check foreign keys, database integrity and the existing hosted and demo smoke paths. Keep conversion behind the staged workflow until task 4 verifies recovery.

### 3. Publish readable Git snapshots on save

After task 2, update the affected JSON files automatically for each durable save. Track changed IDs and deletions in the database transaction. Use deterministic UTF-8 serialization and safe stable filenames. Publish the small `state.json` manifest last with the revision and digest of the complete file set. Track the previous and intended file hashes so reopening can distinguish partial publication from external edits. Report freshness in Settings and the CLI. [Snapshot contract](spec.md#automatic-private-git-snapshots) · [Workspace settings](../../frontend/src/features/settings/workspace-settings.tsx)

Verify that saving one job or application version touches the corresponding record files and manifest. Check a repeated save, a removed record, a read-only output directory and interruption after commit and between file replacements. Reopen to retry pending publication without repeating the saved operation. Verify that Git edits are reported before overwrite and an incomplete or tampered snapshot fails validation. Check that the database, sidecars, credentials and machine permissions stay outside the generated snapshot. Restore a complete snapshot into a new folder with fresh permissions.

### 4. Verify backups and the format switch

After tasks 2–3, extend the existing `export` and `restore` workflows to package a consistent logical database revision with canonical files and verified originals. Read supported older archives, preserve the hosted pilot’s legacy archive path, and validate paths, limits, checksums and format versions. Take the pre-upgrade backup with the previous build and restore it to a separate destination. Stage conversion under the workspace lock. Publish the verified SQLite format manifest as the activation point. [Archive code](../../employment_agency/store.py) · [Installed workspace upgrade procedure](../../docs/running-locally.md)

Fault-test before and after activation. Before activation, a valid legacy workspace remains openable and retry checks its current source revision. After activation, the earlier build rejects the new format, the new build requires its verified database, and a missing database leads to explicit restore. Restore a SQLite ZIP and a clean Git clone separately. Compare effective submission records, cooldown data when present, permissions and document hashes. A restored in-flight attempt requires reconciliation and causes zero dispatches. After new writes, use a compatible build or a verified recovery that reconciles decisions and receipts created since the backup.

### 5. Compare roles and reconcile company history

After task 2, add stable employer and vacancy identities while preserving existing listing references. Bind verified employer sources and aliases, and group distinct URLs only when they represent the same vacancy. Import effective submissions from version decisions, tags and receipts. Replay verified submission dates and surface cases where an unresolved identity or date can change the allowance. Expose a review of proposed employer mappings and cooldowns before enabling enforcement. Include the new records in tasks 3–4’s snapshot and restore coverage. [Sources](../../employment_agency/sources.py) · [Matching](../../employment_agency/matching.py) · [Opportunity details](../../frontend/src/features/discover/opportunity-inspector.tsx)

Add **Compare roles at this company** to the existing details flow and expose the same shortlist through the service for CLI and Codex. Use a controlled board fixture to verify source coverage and freshness, open-role matching, evidence gaps, aliases, duplicate postings and two different requisitions with the same title. Show remaining slots and let the user choose up to that allowance. Saving and drafting consume zero slots. Keep submission controls behind task 6 until the guard is ready.

### 6. Enforce the limit in discovery and application actions

After tasks 3–5, use one short transaction to recheck the employer, vacancy, deadline, and exact approval and reserve the slot against a stable attempt ID. Check cooling employers before employer-facing preparation and again at dispatch. Route existing local delivery approval and the new explicit submission handoff through the guard. Mark dispatch durably before the external action. Commit confirmation, the effective submission and any cooldown together. Reconcile uncertain attempts without dispatching them again. Record manual submissions, valid tags and corrections through the same effective-count rules. Keep over-limit history when an independent application is reported. [Service actions](../../employment_agency/service.py) · [Delivery worker](../../employment_agency/application_delivery.py) · [Submission test fixtures](../../tests/test_application_delivery.py)

Skip paused employer boards before fetching. Apply the same policy in ranking, app-managed agent discovery and batch queue construction and execution. Filter cooling employers from Recommended and All roles. Keep history, saved roles and active drafts accessible with the eligibility date. Account for Discover’s cached rankings so both a new cooldown and its expiry are reflected on the next search. Show the optional pause after one confirmed submission and use the spec’s calendar-month and date-only rules. Verify the second-confirmed-role boundary with a controlled clock and exercise a short month, a timezone transition, and reopening after the deadline. [Discover page](../../frontend/src/features/discover/discover-page.tsx) · [Ranking cache](../../frontend/src/features/discover/rankings.ts)

Use simultaneous approvals for the last slot, repeat approval, a stale tab, two channels for one vacancy, an ambiguous send through restart and a definite non-submission as regression cases. When two distinct vacancies compete for one slot, the fake transports must observe one dispatch. Check direct CLI/API calls, a broad feed containing a cooling employer, and a queued job that becomes ineligible after ranking. The draft-only path and separate per-application approval remain part of the supported workflow.

### 7. Verify the release candidate and document recovery

After tasks 1–6, exercise the built UI and installed wheel with fresh SQLite workspaces, a migrated legacy copy, a second Git workspace and a plain folder. Open applications and verify exact document hashes. Test a cooldown across a restart and a restore, workspace isolation, and a mobile-sized review and pause flow. Document the new snapshot status, clean-clone restore, agent commands and cutover recovery. Check the installed build and record the verified wheel identity in `workspace.lock.json` when performing a separately authorized workspace upgrade. [Wheel checks](../../tests/check_wheel.py) · [Browser checks](../../tests/run_browser_checks.py) · [CI workflow](../../.github/workflows/check.yml)

Run the existing Python and frontend suites, type checking, lint, production build and wheel checks. Include hosted install and browser fixtures, the public preview, and the controlled application checks. Use the project’s desktop OS matrix and exercise the Python 3.11 floor. Keep evidence from fictional workspaces and fake providers. A live device test or a private workspace cutover needs its own execution evidence. [Existing verification commands](spec.md#existing-verification-commands)

## Follow-up releases

### 8. Serve consistent application queues and history

After task 7, query effective decisions, current versions and removal events in the backend with stable pagination. Use the same result for Saved, Active, Submitted, Removed and history wherever their existing membership rules apply. Compare archive, correction and tag-only cases against baseline fixtures before moving the UI callers. Verify that list requests skip unrelated document integrity work and opening a version still verifies the exact files. [Queue rules](../../frontend/src/features/applications/queues.ts) · [History page](../../frontend/src/features/history/history-page.tsx)

### 9. Apply source refreshes atomically

After task 7, use a single local transaction to publish a successful board refresh and its source status. Keep verified listing IDs and saved decisions stable across reimport. Reuse the existing ranking logic after indexed eligibility filters. Inject failure between rows and verify the earlier complete results remain available. Benchmark queries on the baseline and a larger fictional dataset before choosing additional indexes. [Source refresh](../../employment_agency/service.py) · [Provenance tests](../../tests/test_job_provenance.py)

### 10. Link career evidence directly to requirements

After task 7, persist requirement-to-fact links with the existing skill-equivalence rules. Save a confirmation and its link together. Verify concurrent confirmation reuses one skill across listings, written examples retain distinct provenance, and retired or edited facts stop satisfying affected requirements. [Requirement evidence tests](../../tests/test_requirement_evidence.py)

### 11. Resume draft preparation by persisted run item

After task 7, persist each queued job’s progress and record budget reservations with their provider attempts. Resume remaining work after restart. Exercise a cancelled run, exhausted budget, interruption after reservation and uncertain provider outcome with a fake provider. Keep drafts and spend within the existing user-approved run. [Run tests](../../tests/test_workflow.py) · [Interrupted-request tests](../../tests/test_boundaries.py)

### 12. Query active employer cooldowns before agent research

Use the existing effective submission and vacancy rules to maintain the employer lookup in SQLite. Query deadlines against the current instant, so expiry requires no write. Rebuild the projection from history on upgrade and restore. Verify date-only assumptions, aliases, corrected or duplicate submissions, the fresh two-slot round and CLI/API parity.

### 13. Research and rank roles at five eligible companies

Have the agent check the selected workspace before opening employer sources. Reuse supported public board adapters and shared imports. Use the company research action to check candidate employers against recorded history and rank every eligible role by employer, with first-time employers preferred and previously applied employers used as fallback. Verify incomplete board handling, a five-company response, more than five roles at one employer and flagged eligibility.

### 14. Group Discover opportunities by hiring employer

Reuse the existing board and role inspector. Group by verified employer identity where present and use the listing company label for unlinked records. Keep city filters and per-role location. Verify rank order, same-name employers with different IDs, navigation, narrow viewports and the existing queues. Update the development handover and verify the built wheel in a disposable workspace.

## Evidence checkpoints and risks

| Checkpoint | Evidence to attach |
| --- | --- |
| Tasks 1–2 | Fixture migration report with IDs, effective decisions, document hashes and integrity results. Record ambiguous history separately. |
| Tasks 3–4 | Small Git diff for one save, successful clone and ZIP restores, and interrupted snapshot and activation results. Record the exact builds used for compatibility checks. |
| Tasks 5–6 | Fake source fetch and transport logs, competing approval outcomes, deadline transitions and retained history after a restart. |
| Task 7 | Suite and build results, installed package identity, and fixture browser and workspace-switch evidence. |

Historical dates and aliases can be incomplete. Report which employer decisions need review in the conversion preview and preserve the evidence behind each count. A confirmed outcome must survive a restart even when snapshot publication fails. The hosted pilot’s archive compatibility and the earlier local build’s format rejection are release checks because they share entry points with the migration. The application plan is ready to implement with fictional data. The actual employer mappings and private upgrade remain decisions for the verified workspace review.
