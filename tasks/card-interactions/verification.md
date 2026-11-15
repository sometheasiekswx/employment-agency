# Card layout and interaction verification

This records the release candidate's local evidence. Deployment success must be established from the exact commit's [Checks workflow](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml) and the public demo's `release.json`, following the [deployment runbook](../../docs/public-demo-deployment.md). Private installation evidence is retained outside this public repository.

## Observed behavior

| Check | Before | Candidate |
| --- | --- | --- |
| Card composition | Actions and status occupied a row above the title. | Title begins at the top beside Remove, with Apply later underneath. Location and status wrap below the title. The generic sponsorship reminder remains in details; other cautions remain on previews. |
| Company column after Apply later | In the older installed bundle, a surviving role moved X=300 → 1052 while two roles remained. | X=300 stays fixed. Only the affected column closes its vertical gap. The private update includes the stable-board implementation already present in shared main. |
| Overlapping save refreshes | On shared `dc8d632`, the saved card was present → absent → present → absent. | Present → absent, with no return during the matching delayed reads. |
| Single save overlapping the background poll | The new regression fails on unmodified `dc8d632`: the saved card returns after the superseded read. | The same regression passes in Chromium and WebKit. |
| Mobile save and remove | Crossing five to four destinations changed the filter control and moved the entire board upward by 30.28125px. | Filter options update while the control stays stable; board Y=369.875 remains unchanged for both actions. |

All mutation evidence uses fictional fixtures with details closed. Matched recordings, screenshots and measured comparisons are in ignored `output/playwright/card-interactions/`; `videos/` holds playable MP4 pairs and `comparison.json` holds the positions and visibility sequences.

## Validation

- Frontend dependency installation reported no audit findings. Typecheck, lint, all 395 Vitest tests across 36 files, and the production export passed.
- All 414 Python tests passed. A built wheel passed the installed-package smoke checks.
- All 111 public release contract tests and both public-preview browser workflows passed.
- The new card-mutation browser harness passed in Chromium and WebKit: actual eight-second poll overlap, an accepted save followed by a failed read, another client's newer reversal, and mobile save/remove stability.
- Responsive layout checks passed at desktop and mobile widths, including 320px, both themes, long content and doubled card text. Controls remain separate and have 44px touch targets on narrow screens.
- Keyboard, mouse and touch checks covered a rejected save, focused error/retry, Remove, Undo, and keeping the detail panel closed. Existing capacity, application-navigation and removal workflows passed.
- The complete `tests/run_browser_checks.py` runner passed all local and hosted acceptance checks, including responsive layout, stable ordering, applications, motion, document editing, keyboard interaction, queues and workspace flows.
- Independent review found no remaining actionable source issue. `git diff --check` passed.

The state change is a UI reconciliation fix: accepted saves survive failed or superseded reads, and the first accepted read begun after a receipt becomes authoritative even when another client changed the choice. No backend payload, schema or dependency change is needed. Existing Remove/Undo receipt handling remains intact; the matched remove/save overlap did not reproduce a removal return.

## Private installation compatibility

The installed application contains an existing unpublished company-highlight review capability. Its candidate preserves that backend and dependency set byte-for-byte, carries forward the small frontend review projection, and layers the reviewed shared frontend. It is a documented composite build, not an unmodified main wheel.

The candidate passed frontend and focused backend tests, package/dependency equality checks, a backup restore with SQLite integrity and canonical-state equality, immutable file checks, and installed-wheel browser checks. The restored workspace was inspected read-only. Live records are not used for mutation testing. The actual cutover must recheck the source revision, retain the prior interpreter and lock for rollback, and verify the intended loopback and private HTTPS targets.

Browser evidence includes WebKit mobile emulation; it does not constitute a physical iPhone test.
