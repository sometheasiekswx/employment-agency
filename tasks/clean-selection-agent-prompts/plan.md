# Implementation plan

[Specification](spec.md) · [Task list](todo.md)

## Approach

Use an isolated codex/clean-selection-agent-prompts worktree, preserving the exact installed source baseline before editing. Keep Python company/transaction rules authoritative and React responsible for presentation. Add only the minimal server projection necessary if the current blocker payload cannot distinguish two pending vacancies from other occupied capacity.

Use the existing Agency components and tokens. Selection mode removes repeated controls from normal cards. A shared editor prevents visual/behavioral drift between research and application instructions. Native disclosure reduces sidebar density while preserving information. No new architecture decision record is needed: these choices are reversible and preserve ADR 0018.

## Ordered slices

### CSP-01 — Recover the installed source baseline

- Owner: Sol delivery agent. Dependency: none.
- Overlay verified frozen manifest paths and exact deletions onto current main in the isolated worktree. Retain relevant glossary/ADR and reconcile public-safe prerequisite task records.
- Audit all included files for private data, credentials and unrelated work. Preserve existing worktrees and private Git status.
- Evidence: manifest/byte comparison, named diff and prior verification reconciliation. Commit the prerequisite separately during authorized delivery so the new refinement remains reviewable.

### CSP-02 — Clean selection and capacity feedback

- Owner: Sol build/test agent. Dependency: CSP-01 and confirmed interview summary.
- Edit discover-page/related styles, inspector shared pending action, and minimal allowance projection if needed. Keep keyboard semantics, busy guards, exact selection IDs, selected/all scope and existing stale-response protection.
- Verify meaningful UI regressions for browse/selection mode, clear/exit, filters/pages, removal restoring capacity, canonical vacancy/alias counting, mixed capacity and stale state. Reuse existing company admission tests.

### CSP-03 — One editable agent-instructions panel

- Owner: same Sol build/test agent, because it shares To apply selection state with CSP-02.
- Refactor the existing shared agent-instructions component rather than create page-specific variants. Use existing panel/dialog/control conventions.
- Verify current edited copy bytes, Reset, empty text, clipboard rejection/manual selection, generation failure/retry, backend blockers, and stale workspace/profile/selection responses. Verify selected and all-pending scopes; opening/copying must make no submission call.

### CSP-04 — Focused sidebar hierarchy

- Owner: same Sol build/test agent. Dependency: CSP-01 and confirmed interview summary.
- Replace full default profile display and oversized count with a compact summary, native details disclosure and a quiet counts row. Remove superseded CSS rather than layer contradictory overrides.
- Render fictional long/empty profiles at desktop and mobile boundaries in light/dark modes; verify keyboard focus and disclosure access.
- Supply a representative early rendered flow for coordinator inspection before final polish. Keep captures under ignored output/playwright/.

### CSP-05 — Integrated verification and independent review

- Owners: Sol build/test agent for focused checks; a separate Sol review/test agent for independent acceptance and review.
- Required frontend gates: npm --prefix frontend run typecheck; npm --prefix frontend run lint; npm --prefix frontend test; npm --prefix frontend run build. Run relevant Python regressions/full suite because the prerequisite changes backend capacity, logos and instructions.
- Use the established fictional browser runner and relevant discovery/workspace/application scripts. Verify 320, 390, 768, 1024 and 1440 CSS px, breakpoint neighbors where relevant, reduced motion, keyboard/focus and both themes. Check console errors and horizontal overflow. Do not mutate the real workspace.
- Run the Impeccable detector once on finished changed UI targets and assess findings against the incumbent design; rendered behavior remains the authority.
- Independent review covers the complete publishable diff and boundary/error behavior, including prerequisite source. Fix actionable in-scope findings and recheck affected behavior without weakening tests.
- Review identified a prerequisite regression: a browser-close failure can leave a legacy attempt in cancelling with no retry, retaining its company slot. A separate Sol fix owner will retain the hold while closure is uncertain, expose an explicit cancellation retry, and release only after successful closure. Verify a transient failure and successful retry without sending; do not change the submission authority contract.
- Record commands, results and limits in verification.md and review.md; reuse valid evidence instead of repeating expensive passing suites.

### CSP-06 — Ship and verify main

- Owner: Sol delivery agent. Dependencies: completed verification and no unresolved blocking review finding.
- Commit only named intended files. Separate recovered baseline from new refinement as practical. Update current source docs and task status without private local paths or runtime details in public records.
- Fetch current main, integrate safely without force-push or resetting dirty checkouts, and push the reviewed result to main as authorized.
- Follow the repository's existing cross-platform Checks and public-demo deployment to completion. Verify /release.json and node scripts/check-public-demo.mjs against the pushed SHA, then a focused live fictional UI smoke. Diagnose/fix in-scope pipeline failures and recheck.
- Prepare a private installed candidate only if that target is subsequently authorized; it requires verified backup, restore rehearsal and unchanged submitted-document evidence. Source publication does not itself update workspace.lock.json.

## Risks and recovery

The existing unpublished prerequisite is larger than this refinement and must remain independently traceable. Canonical vacancy counts must not be approximated by browser rows. Editable prompts must not survive scope switches unnoticed. New selection controls must not steal role-opening interactions. Sidebar expansion must fit short viewports. Revert through ordinary source commits if required; do not rewrite submitted records or discard unrelated work.

The owner confirmed the final interview summary on 15 November 2026. There is no open product decision for this scope.
