# Implementation plan: Jobs and To apply

Requirements: confirmed interview in the current task, 14 November 2026.
Task list: [todo.md](todo.md).

## Confirmed outcome

- Replace Recommended and Browse with **Jobs**, the default incoming list. Show all available, unsaved roles returned by discovery, with the existing evidence-based matching order. A profile mismatch remains visible information instead of hiding the role. Existing submission, removal and company-cooldown rules still apply.
- Replace Saved and For my agent with **To apply**. The single **Apply later** action moves a role from Jobs to this list. **Remove from To apply** returns an available role to Jobs.
- Combine every existing saved role and agent-marked role without duplicates or lost choices. Keep the role in To apply through CV preparation. Confirmed submission removes it from this pending list, while documents and application history remain intact. Removal/restoration continues to preserve the user's choice.
- Keep self-apply and connected-agent execution in the existing role workspace. Move the existing exact-selection handoff and connected-agent controls into To apply where supported. Saving, reading and copying a handoff never start or authorize submission; authorization still occurs only at connected-agent start.
- Retain old discovery, saved and agent-queue links, selected roles/versions, filters, browser Back, keyboard focus, unsaved edits and error recovery.

The user chose this flow over separate recommendation/browse tabs and separate bookmark/agent intentions. **Apply later** replaces the earlier Save job wording. There are no unresolved product decisions.

## Approach

Use the existing Python service, workspace storage, React discovery feature, preview transport and matching implementation. No new dependencies or visual redesign are needed. Reuse the current company board, role inspector and bookmark feedback. The feature changes queue semantics, so update their owning glossary/design/API documentation; retain earlier design records as historical decisions and identify this supersession.

The existing saved boolean and agent_intents collection are separate persisted choices. Introduce one effective pending choice while keeping existing operations compatible. Preserve legacy records and document bytes. Both save-job and agent-queue-mark must converge on the same choice, including clearing an old agent-only mark. The ordinary saved projection and indexed agent queue must agree. Use a transactional index/data upgrade only if needed; do not silently change derived-index semantics without rebuilding existing workspaces. Prove old-state adoption and export/restore on fictional data before any release claim.

The local SQLite agent queue is paginated; the demo and hosted app do not expose local execution. Keep their basic Jobs/To apply behavior working without calling local-only endpoints. Queue contents must remain available independently of ranking failure, current profile and company pause. Agent tooling remains capability-gated.

Work from a separate checkout based on the latest main. Preserve unrelated edits in the original checkout. The delivery requested for this change is a commit pushed to main; this triggers the existing public-demo workflow. Verify that actual deployment before reporting it live. A private installed-build upgrade and new versioned wheel release are separate from a source push.

## Ordered slices

### JTA-01 — One durable pending choice

Dependencies: none.

Areas: application_queue.py, service.py, sqlite_workspace.py and relevant state/preview contracts.

Acceptance:

- Existing bookmark-only, agent-only and doubly marked jobs each appear once in To apply / compatible queue reads.
- Both old mutation APIs can add or clear the same choice atomically. Imports/refreshes cannot undo it.
- Draft preparation preserves the choice; submitted/equivalent submitted vacancies and removals leave pending results; restoration retains the choice.
- Paging/counts agree, no queue read opens or alters documents, and no queue action creates a run, reservation, consent or submission.
- Any upgrade is transactional, preserves canonical records/snapshot semantics, and survives ZIP/Git-snapshot restore without restoring execution authority.

Verification: focused Python queue/journey/storage tests, including old-state fixtures, rollback on failure and both compatibility operations.

### JTA-02 — Jobs and To apply throughout the interface

Dependencies: JTA-01 contract.

Areas: discover-page, discovery filtering, inspector, agent-queue tools, navigation links, search-profile copy and demo transport as needed.

Acceptance:

- Exactly Jobs, To apply and Applications remain as the primary discovery views; Applications retains Active, Submitted and Removed.
- Jobs contains available weak matches as well as strong matches, in the existing rank order. Saved roles leave Jobs after confirmed save and return after clear.
- A single Apply later / Remove from To apply toggle appears on each applicable card and inspector, with consistent optimistic state and rollback on failure.
- To apply includes old agent-only jobs and drafts, exposes selection/handoff/start only in supported modes, and excludes recorded submissions including equivalent listings.
- Old recommended/all/saved/application-agent URLs open the corresponding combined list without losing exact role/version context. Error, empty and loading states use the new language.
- The list remains usable with no profile, failed matching, long titles, narrow layouts, Back/Escape, keyboard-only input and reduced motion.

Verification: focused React/preview tests and real-browser Jobs → Apply later → To apply → remove flow. Cover selection, stale workspace responses, persistence across reload, and a prepared CV remaining in To apply.

### JTA-03 — Integrate, review and deliver

Dependencies: JTA-01 and JTA-02.

Areas: relevant browser fixtures, current product/API/glossary/design docs, task evidence and Git delivery.

Acceptance:

- Existing meaningful tests are retained and adapted only for the deliberately changed behavior; no lowered quality thresholds or disabled checks.
- Review verifies data preservation, authorization boundaries, local/hosted/demo parity, routes and complete removal of the duplicate user-facing feature.
- Publish only this task's files and integrate any newer main safely without force-push.
- The cross-platform Checks workflow and actual public demo revision pass; verify the deployed changed flow with fictional data.

Verification: frontend tests/typecheck/lint/production build; full Python suite using built assets; affected browser suites on desktop/mobile; wheel checks if schema/package behavior changes; existing CI and release checker. Reuse applicable passing evidence and disclose unavailable hardware/provider checks.

## Evidence checkpoints and risks

- Before implementation: confirm exact main baseline and preserve original dirty worktree.
- After persistence slice: inspect old bookmark/agent-only behavior and transactional upgrade; no real career workspace is used for tests.
- Early UI: inspect a rendered incoming role and To apply list with both old-state types, then verify narrow layouts.
- Final: record commands/results and review findings in verification.md before pushing; append actual delivery evidence afterward.
- Main pushes deploy the public demo. Private career data must never enter source, screenshots, logs committed to this repository or the public fixture.
- Existing local execution uses explicit selected-role authorization. Merging a queue must not expand an already-started run's authorized selection.
- Grouping by company remains; companies follow the earliest ranked role and roles keep their existing order within the company.

## Status

Plan approved through the confirmed interview. Implementation is authorized using GPT-6.1 Sol with high reasoning effort; testing, review, fixes and push to main are authorized by the user's auto request.
