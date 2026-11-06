# Verification

Local implementation in the shared software checkout, against base `dcc8635`, 7 November 2026. No private career records were used or changed by the tests. Preview: http://127.0.0.1:8842/discover/?view=all — a disposable Alex Morgan workspace.

## Confirmed behavior

- Direct card/details Remove, workspace-wide discovery hiding, in-place next-role assessment at the same sheet detent and quick Undo.
- Persistent Removed filtering and restoration; application status, comments, preserved document versions and submitted PDF bytes remain unchanged.
- Explicit optional Save reason, retained reason drafts while changing roles/panels, independent job/event binding, save retry and no new document-draft confirmation. Closing details hides the optional editor while retaining its draft for Add reason.
- Canonical URL reimport/rediscovery preserves a legacy/custom job ID and its removal choice. Ambiguous exact URLs are rejected without merging records or rewriting application links.
- Safe duplicate operations, stale Undo, historical reason editing, per-job queues, independent optimistic rollback and confirmed mutation receipts surviving failed refresh/Undo.
- The static fictional preview supports browser-local removal/reasons/restore, while private operations and all external API calls remain disabled.

## Completed checks

| Check | Evidence |
| --- | --- |
| Frontend unit suite | 324 passed, 29 files; `frontend-final.log` |
| Python unit suite | 192 passed; `python-all.log` (includes concurrent local development tests) |
| Focused durable operations | 12 new removal tests plus neighboring owner, workflow, import and submission checks; 59 passed |
| Focused controller | 14 cases including delayed receipts, failed Undo, stale refresh history, reason failures and workspace unmount |
| Dirty document boundary | Actual DraftProvider/Form regression: decline preserves text/route; accept prompts once and removes/advances once |
| TypeScript and ESLint | Passed; no suppressed diagnostics |
| Normal static export/package | Passed; `build-native-focus.log` |
| Public static export | Passed; `build-public-final.log` |
| Dedicated browser runner | Passed 320/390/1440, real successful persistence, controlled failed requests, rapid inspector triage, queued Undo, reason drafts/retries, profile switches, reloads, terminal Remove/Restore focus, native CDP footer reading/dismissal, submitted bytes and application invariants |
| Public-preview browser | Passed existing six-route/document/isolation checks plus removal/reason/reload/restore at 1440/390/320 and accessibility; no API/provider/external/mutation requests |
| Formatting and whitespace | Scoped Prettier and `git diff --check` passed |

New browser coverage is registered in the existing isolated fixture runner. Screenshots and normal-motion recordings were inspected by the implementation owner and an independent reviewer. Evidence is under ignored `output/playwright/opportunity-removal/`, with public screenshots in `output/playwright/public-preview/`.

## Findings resolved

The initial optional editor overlay blocked mobile cards. Feedback now reflows in the page and stays in the active native dialog during assessment. Terminal mobile Remove/Restore initially lost focus because native dialog close briefly returned focus to the disappearing opener card; a post-commit focus intent excludes that card and preserves genuine surviving user focus. Strict browser focus traces and both terminal assertions now pass.

Controller regressions exposed failed Undo discarding confirmed removal, stale rollback baselines and restored retry receipts falsely claiming removal. Those cases now pass without weakening assertions. Import tests exposed URL-derived rediscovery duplicating custom IDs; canonical identity is retained. The real dirty-form regression covers the corrected single-guard mutation path. Inspector Remove remains responsive while another job's request is pending.

The first broad browser run stopped at an unchanged bell-animation keyframe inspection. The unchanged bell runner then passed in its isolated fixture; its original failed log is retained. Remaining broad browser and native Xcode results are publication/readiness follow-up until recorded below. No bell implementation or assertion was changed.

The continuation completed every remaining existing browser suite successfully, including queue decisions, recovery, six workspace views, editor/draft preservation, external-file changes, workspace switching, hosted ownership/capability restrictions and historical documents. Together with the original run's successful Opportunities, search, layout, motion, mobile and new removal scenarios, all existing browser checks are covered without changing the bell assertion. Receipts: `browser-all.log` and `browser-remaining.log`.

Native Xcode Safari checks also passed in the installed iPhone Simulator, using separate fictional fixtures. The main case verifies same-full-detent advance, Undo without changing the current role, exact optional text retained through close/navigation/reopening and no native alert. A fresh single-role case verifies terminal Remove and Restore both close details and leave recovery controls natively hittable. Native accessibility focus dumps are ambiguous, so exact DOM keyboard-focus acceptance comes from the strict browser tests rather than an invented native focus measurement. These are Simulator checks, not physical-iPhone acceptance.

Native diagnostics are retained under `output/playwright/opportunity-removal/native/`. Initial attempts exposed stale AX value/coordinate timing; later native screenshot/value checks passed. One terminal attempt wrongly assumed only one removed role despite main-case state; its fresh-fixture rerun enforced zero initial removals and passed unchanged assertions. The successful main recording is `native-removal-smoke.mp4`. No product assertion was relaxed, no physical phone was used and no Simulator/global setting or dependency was changed.

## Independent review and release boundary

Independent review found no remaining P1/P2 issues in the removal scope after the fixes and strict browser pass. Hosted ownership is fixture-tested; no real hosted provider or physical iPhone acceptance is claimed. Unsaved reason text is held for the Opportunities browsing session; Save reason persists it. No dependencies or schema migration were introduced; backup/restore of the additive history was tested.

The owner subsequently authorized committing this feature, pushing to `main` and verifying the checked public-demo deployment. Concurrent CLI/server/Tailscale/live-development changes remain outside the removal scope. The existing pipeline publishes only its tested fictional artifact; recovery uses the known-good `dcc8635` release and [deployment runbook](../../docs/public-demo-deployment.md). The private installed workspace is not automatically upgraded. Actual commit/CI/live-alias receipts are publication follow-up rather than claims made by this preparation record.

Final native screenshot inspection exposed Safari input autozoom from the new 13px textarea. Its mobile font now uses 16px, preserving manual zoom and the existing font family/palette. The public browser regression checks that minimum on mobile; fresh matching browser/native checks accompany publication. The choice is consistent with the [official Flutter web accessibility guidance on iOS text-input sizing](https://docs.flutter.dev/ui/accessibility/web-accessibility#viewport-zoom-and-mobile-text-inputs); this app continues to use native HTML controls rather than Flutter.

The matching native main-case recheck passed with the software keyboard visible: editor edges and all four navigation labels stayed within the viewport in the focused/reopened screenshots. Exact viewport scale was not instrumented. The matching public browser run, including its computed mobile-font check and accessibility checks, passed. Fresh dependency audit found zero vulnerabilities, and all 108 existing deployment/staging/promotion tests passed. No additional native terminal rerun was needed for this field-only style change.
