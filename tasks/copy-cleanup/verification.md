# UI copy cleanup verification

## Implementation

Removed the five requested passages, related page introductions, and repeated guidance about search profiles, location priority, importing adverts and ranking. Kept the hosted and preview jump link to saved-job ranking.

Added a shared native disclosure for career facts, history, supported sources, required matches, theme scope, workspace folders and restoring exports. Each has a visible topic label and starts closed. The help opens inline and uses the existing focus styling. The fact-edit warning sits next to the edit form. First-run guidance, required formats, preview status, pending evidence, and privacy and destructive-action text remain visible where applicable.

The starting working-tree snapshot and the current frontend differ in these 13 files.

- `frontend/src/app/globals.css`
- `frontend/src/components/context-help.tsx`
- `frontend/src/features/career/career-page.tsx`
- `frontend/src/features/discover/discover-page.tsx`
- `frontend/src/features/discover/discover.css`
- `frontend/src/features/history/history-page.tsx`
- `frontend/src/features/search/discovery-panel.tsx`
- `frontend/src/features/search/profile-form.tsx`
- `frontend/src/features/search/search-page.tsx`
- `frontend/src/features/search/search-results.tsx`
- `frontend/src/features/secondary.css`
- `frontend/src/features/settings/settings-page.tsx`
- `frontend/src/features/settings/workspace-settings.tsx`

## Source checks

| Check | Result |
| --- | --- |
| `git diff --check` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed, 368 tests across 32 files |
| `npm run build` | Passed, Next.js static export packaged for the shared Python source checkout |

The task diff was inspected against the captured working tree to distinguish it from existing onboarding and application changes. The source build and test results cover the current shared checkout. The private workspace continues to use its pinned installed release.

## Browser checks and review

The coordinator verified the packaged production export on 14 November 2026 with disposable fictional workspaces. No private workspace actions or external job-source requests were used.

| Check | Result |
| --- | --- |
| Existing `tests/redesign-browser.cjs`, through `serve_folder_fixture.py` | Passed: six workspace views at 320, 768, 1024 and 1440px; Axe WCAG checks, navigation, draft guard, reduced motion and enlarged text |
| Existing `tests/search-navigation-browser.cjs`, through `serve_concept_fixture.py` | Passed: selected profile persists, imports remain reachable, and unsaved-draft cancellation/confirmation works |
| Temporary copy-cleanup browser inspection | Passed: five affected pages in dark/light at 1440 and 390px; named passages absent from the visible page; help starts closed and opens/closes with Enter, Space, click and tap; visible focus and 44px minimum target height |
| Expanded help and accessibility | Passed: 320px with 200% text, no horizontal overflow; Axe WCAG A/AA checks and page-error checks on the inspected Chromium states |
| Form effects | Passed: help toggles produce no submit/change events; iPhone-profile WebKit also confirms that help does not mark forms dirty |
| iPhone-profile WebKit | Passed: touch open/close on Career profile, Search preferences, History and Settings, with no overflow or page errors |
| Task diff preservation | Passed: exactly 13 frontend files differ from the saved pre-task frontend; other pre-existing tracked diffs are identical |

The coordinator visually inspected desktop History and Settings, mobile Search, and expanded mobile History. The repeated text is gone, controls have more room, and expanded guidance remains in the page flow. The task adds no dependency or custom focus-management code. Review found no blocking correctness, accessibility or preservation issue in the task diff.

Screenshots, the temporary inspection script and its structured results are under the ignored `output/playwright/copy-cleanup/` folder. For example: [History desktop](../../output/playwright/copy-cleanup/after-history-1440-dark.png), [Search mobile](../../output/playwright/copy-cleanup/after-search-390-dark.png) and [expanded History help](../../output/playwright/copy-cleanup/open-history-390.png).

The initial fixture launch with the source `.venv` failed because that environment lacks `truststore`. Verification instead used the existing pinned installation's Python dependencies with `PYTHONPATH` selecting the current shared source and disposable fixtures. Nothing was installed. An initial temporary inspection selector referred to a nonexistent company-group class; it was corrected to the existing `.discover-card` before the checks passed. Neither adjustment required a product change.

## Initial source-build handoff

Requirements, plan, GPT-6.1 Sol implementation, relevant verification and coordinator review are complete. The production frontend is built locally in the shared checkout on `codex/application-journey-release`, based on `d286aa1f56e31c70adceabeafd630b21d47eba76` plus the documented working-tree changes.

The initial delivery was a verified source-build handoff. It made no task commits, pushes, deployments, dependency changes or private workspace modifications. The subsequent authorized private upgrade is recorded below.

No state migration is involved. Source recovery consists of reverting only this task's hunks while preserving the pre-existing edits. At the initial handoff, no release rollback was needed because no installation had been replaced. The full backend suite, hosted/public-preview browser runs and remote CI were not rerun for this frontend-only change. WebKit is browser emulation, not a physical-iPhone test.

## Authorized private upgrade

The owner subsequently requested upgrading the running app. GPT-6.1 Sol ported only the 13-file cleanup onto a clean detached worktree of the installed base revision, excluding the shared checkout's unrelated changes. The candidate passed typecheck, lint, 363 frontend tests and production build. Its 53 non-web wheel members, excluding generated RECORD, are byte-identical to the prior installed wheel.

- Candidate wheel SHA-256: `649a74b744ebba1c5802ec6de3f17b297ef12e5916b496c7717cd483876e8290`.
- Isolated patch SHA-256: `fc19993886a35c53137559039420dbdf923f8d697b7d6fa5fecefaf657df8ca3`.
- `tests/check_wheel.py --browser` passed for the exact candidate in a fresh environment, including packaged routes/assets, protected document reads, export/restore and application-queue browser behavior.
- A fresh protected backup and isolated restore verified canonical records, documents and queues. Candidate startup and recovery to the previous installation passed before cutover.
- The running private app was upgraded and verified at its existing loopback and private HTTPS addresses. Live checks covered the five cleaned pages, contextual help with keyboard/touch, exact Submitted CV bytes and persistent navigation at desktop and phone widths. Canonical state, files, receipts, cooldowns and grants matched before and after.

The private installed-build pin now identifies the candidate, source patch and retained recovery evidence. No source commit, push or public release was performed. Live checks were read-only and did not contact employers. Physical-device acceptance and remote CI remain untested for this local UI build; unrelated shared-checkout changes remain untouched.
