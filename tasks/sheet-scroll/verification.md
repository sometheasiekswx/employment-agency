# Verification: sheet scroll handoff and Profile filter

Local implementation against b7241ce, 6 November 2026. Preview: http://127.0.0.1:8803/discover/?view=all . This is a fresh, disposable Alex Morgan fictional workspace. The private career workspace and its installed build were not changed. Nothing was committed, pushed or deployed in this pass.

## Observed result

- The supplied physical iPhone recording was inspected frame by frame. It demonstrates the old peek-body reading failure, not candidate acceptance.
- A native CDP-touch regression failed against the unchanged export: a short upward body swipe returned aria-expanded=false. The same assertion passes on the candidate.
- Short upward body swipes commit expansion. A long uninterrupted contact consumes height first and then scrolls content before lift; its next contact scrolls natively.
- Reversal unwinds only the contact's added scrolling before lowering the sheet. Unused edge travel is discarded. Pointer cancellation and a second pointer restore the committed geometry and owned scroll; paused upward reversal cancels dismissal.
- Peek downward dragging works at nonzero scroll and from a disclosure. Small jitter does not dismiss, and the next disclosure tap remains functional. Company/header dragging works at nonzero reading scroll.
- The contiguous header now retains company identity. The existing Profile chooser is in Filters, with guarded selection and URL behavior preserved; counts and locations stay accessible in the main view.
- Keyboard/focus, Back/Escape, repeated opening, rapid/interrupted transitions, failed saves/retry, dirty edits, submission guards and reduced motion remain covered by existing browser suites. Reduced motion has no autonomous reading inertia.

## Passed checks

| Check                                                                    | Result                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix frontend test -- --maxWorkers=2`                           | 269 tests, 27 files passed                                                                                                                              |
| `npm --prefix frontend run lint`                                         | Passed                                                                                                                                                  |
| `npm --prefix frontend run typecheck`                                    | Passed                                                                                                                                                  |
| `npm --prefix frontend run build`                                        | Passed; static export packaged                                                                                                                          |
| `TEST_URL=http://127.0.0.1:8803 node tests/sheet-scroll-browser.cjs`     | Passed native touch reading/dismissal regression                                                                                                        |
| `TEST_URL=http://127.0.0.1:8803 node tests/mobile-workspace-browser.cjs` | Existing Chromium and installed WebKit acceptance passed                                                                                                |
| `PYTHONPATH=. .venv/bin/python tests/run_browser_checks.py`              | All local and hosted browser workflows passed, including the new sheet runner                                                                           |
| `npm --prefix frontend run build:preview`                                | Passed after correcting a test-helper type annotation                                                                                                   |
| `PYTHONPATH=. .venv/bin/python tests/run_public_preview_checks.py`       | Passed: fictional static routes/documents, bookmark isolation, disabled private operations, no API/auth/provider requests, desktop/mobile accessibility |
| `git diff --check`                                                       | Passed                                                                                                                                                  |

One resource-contended unit run timed out in unchanged History/Editor tests while builds and several browser sessions ran concurrently. The full suite then passed with two workers and unchanged assertions/timeouts. The failed log is preserved. The first browser run also exposed a newly misplaced test click before navigation; moving that click to the actual profile-switch step restored the intended guard coverage. No product safeguard or assertion was weakened. Python/backend and release transport were unchanged; their prior checks remain separate evidence.

## Motion and rendering

Existing 320ms arrival, 220ms dismissal and critical settling spring remain. New direct manipulation is 1:1 after 8px intent; the explicit first-contact expansion/reading handoff follows Apple's documented behavior and W3C ownership constraints. Dismissal uses the app-specific quarter-peek boundary, guarded 32px/600px-per-second flick and recent velocity projection. See [the motion plan and primary sources](../../docs/mobile-sheet-motion.md).

In one headless Chromium expansion-to-reading observation, 93 frame samples had median/p95 16.7ms intervals and maximum 16.8ms. Nineteen layout events took 2.045ms aggregate and 23 style recalculations took 4.219ms. Height remains the existing measured exception needed for a real scroll viewport; content extent is read once at the expansion boundary. This observation does not establish physical-device performance.

Settled desktop, mobile list, Filters, peek and reading screenshots were inspected. The short animation-enabled recording was sampled for continuity. All evidence uses fictional data under ignored `output/playwright/sheet-scroll/`: `mobile-scroll.mp4`, original WebM, `mobile-list.png`, `mobile-filters.png`, `mobile-peek.png`, `mobile-reading.png`, `desktop.png`, `motion-contact.jpg`, `scroll-performance.json`, browser logs and unit/lint/type/build receipts.

## Independent review and limits

The independent reviewer rated the observed experience **9.0/10**, with no actionable blocker. It passed 29 Chromium native-touch checks and 13 separately scoped desktop WebKit engine checks, including inertia interruption and edge reversal. The rubric was fixed before candidate review. The reviewer also independently ran the role-change unit regression, which passed; an initial source hypothesis was not reproduced and was not reported as a bug. Review and detailed receipts: `output/playwright/sheet-scroll/independent-review.md`.

The supplied physical iPhone proves the baseline failure. Candidate behavior has not been checked on that physical device. Full pinch zoom, native long-press selection, VoiceOver/screen-reader speech and physical Safari performance remain unverified. Chromium emulation, WebKit wheel/mouse/tap checks and axe do not substitute for that acceptance.

Release preparation is complete locally. No dependency, state/schema migration, credential, backend or submission-authority change was introduced. A later explicitly authorized commit/push can use the existing checked main/public-demo pipeline and [recovery runbook](../../docs/public-demo-deployment.md). The public demo remains at its prior released commit.

## Authorized publication follow-up

After the local pass, the user explicitly requested review, fixes, commit/push and public-demo verification. The initial local-only statements above describe the earlier stage. This follow-up uses the existing `main` Checks matrix and automatic public-demo release, leaving the private hosted pilot and installed workspace separate.

The pending product source still matches the successful local receipts above. A fresh dependency audit found zero vulnerabilities. The fresh independent source/evidence review found no material issues, reran 58 focused unit tests, and passed mobile header/doubled-text probes. Its report and source fingerprints are under `output/playwright/sheet-scroll/release-review.md`. The current public release marker identifies b7241ceeab9cf76192ad777bea5f1ba78f142681 as the known-good recovery revision. Recovery follows the existing public-demo runbook; there is no state or database migration.

After pushing, verify the full CI matrix, staged/public HTTP checks, exact live release marker and actual desktop/mobile interaction behavior on the public alias. Store the observed release receipts under ignored `output/playwright/sheet-scroll/release/`. This preparation snapshot does not claim those later steps have happened.

## Footer and README follow-up: 7 November 2026

The user confirmed the partial-sheet contract in the documented interview: vertical swipes anywhere from the job title through footer buttons and bottom padding resize/read the sheet; taps retain their actions and expanded body contacts scroll natively. Implementation and README publication were explicitly authorized. The software checkout remains separate from the private career workspace.

Independent native-touch baseline checks against bad915b reproduced the omitted footer region. A 150px upward drag from Review documents, bookmark or footer padding left the sheet in peek and moved the document behind it from 180px to 315px. Public disabled Prepare draft and explanatory notes reproduced the same failure. Title, body and disclosure starts expanded correctly in the tested Chromium fixture; these results do not establish physical iPhone behavior.

Four added unit regressions failed on the baseline and pass after extending footer ownership and its pre-contact touch policy. Footer contacts now expand, consume remaining travel into reading and retain the existing reversal/cancellation path. Dialog/backdrop containment prevents scroll chaining. No timing constants, visual hierarchy, dependencies or submission authority changed.

Passed current checks:

- 273 frontend unit tests across 27 files; lint and TypeScript.
- Normal static export/package build and public static-preview build.
- Full local/hosted browser acceptance, including Chromium/WebKit mobile checks, keyboard/focus, Back/Escape, save/retry, draft/submission guards, accessibility and responsive layouts.
- Expanded `tests/sheet-scroll-browser.cjs`: on-screen native touch from title, enabled footer action, bookmark SVG, padding, disabled Prepare draft and explanatory notes; same-contact footer expansion/reading, fixed background, ordinary document action, disclosure/body dismissal, focus and reduced motion. The disabled state uses a controlled fictional eligibility response, without changing control CSS. Existing assertions remain. A disclosure is scrolled into a reachable position so dismissal does not use off-screen touch coordinates.
- Public-preview browser acceptance: six routes, fictional PDF/Word views, browser bookmark isolation, disabled private operations and no API/auth/provider calls.
- Independent source review of the gesture/CSS/unit diff and unchanged footer caller: no material findings. Its source-only scope is separate from browser and deployment evidence.
- A separate isolated native-CDP mobile check of the static public preview passed enabled/disabled footer expansion, fixed background, ordinary Documents navigation, body dismissal, Escape/focus and readable settled layouts, with zero API requests or page errors. No actionable in-scope usability defect was observed. This is Chromium emulation, not physical-device acceptance.

Final walkthrough assets use real native touch input and lossless 2x source frames. Desktop is 2240×1680 / 13.83s / 2.02MB; mobile is 780×1688 / 16.97s / 5.83MB. They show the compact result row/profile inside Filters, continuous expansion into reading, footer expansion and a sustained body drag to close. The document walkthrough shows actual files, source evidence and preserved History. Every source hash/frame, native dimension, delay/loop, poster and width-only README cap passed the existing checker. GitHub Markdown rendered in GitHub CSS at 1440/390 preserved all three aspect ratios and selected PNG sources under reduced motion.

Capture diagnostics are preserved: a short footer flick did not cross the existing guarded velocity boundary in the capture, so the published story uses a real sustained on-screen body drag; no timestamps or thresholds were changed. The native headless PDF guest stayed blank, so the ancillary clip accurately shows document records/History without claiming embedded PDF rendering. The two primary GIF/poster hashes stayed unchanged during this ancillary replacement. New browser-test setup assertions were corrected to use an explicit unselected URL and the actual application workbench after a document tap; failed harness logs are retained.

Evidence is under ignored `output/playwright/sheet-footer/` and `output/readme-showcase/refresh-verification.json`; tracked provenance and quality reports accompany the media. Physical iPhone Safari, VoiceOver, full pinch zoom and native long-press acceptance remain unverified. Unrelated concurrent CLI/server/Tailscale work is excluded from this release. The known-good public revision for recovery is bad915b; use the existing public-demo runbook. Exact pushed CI, published README and live alias checks are publication follow-up, not claims made by this preparation snapshot.

## Safari release policy and native Xcode follow-up

On 7 November the user identified Safari, confirmed direct partial-sheet tracking with a shared 20% remaining-distance release rule, and requested Mac-based testing to keep their phone free. The physical Safari automation session was ended. Its driver omitted normal touch releases, so those attempts establish an automation limitation rather than app acceptance. The installed Xcode iPhone Simulator runs native Safari with XCTest coordinate taps/drags, separately from Playwright's desktop WebKit engine.

The exact released static artifact at `3848d747c67316f98dd46e09552b3209a3491db6` was retained as the baseline. Long native Simulator body/footer gestures already expanded on that baseline; the user's general physical-device failure was not reproduced on those long paths. Two unchanged native acceptance assertions did expose a release inconsistency:

| Native Simulator contact | Baseline | Candidate |
| --- | --- | --- |
| Slow 70-point upward grip drag, pause before release | Returned to partial: failed | Fully expanded: passed |
| Slow 20-point upward body drag, pause before release | Fully expanded: failed | Returned to partial: passed |

The fixture is iPhone 18 Pro / iOS 27, with Safari viewport 402×714 points and partial/full heights 480/706 points. Each contact uses real native coordinate input at 100 points/second with a 250ms endpoint hold, rather than injected DOM events. Passive traces contain trusted touch down/move/up events. The 20% rule is relative to the current visible presentation; 70 points exceeds it in this fixture and 20 points does not. No universal device timing/performance claim follows from these observations.

The implementation shares the same release rule across header/body/footer, retains gesture ownership until settling finishes and the contact ends, and accepts upward intent after small initial sideways drift. Settled full-body contacts keep native scrolling. An independent source review found a momentum fallback that bypassed the 32px upward flick floor; its new 20px fast-flick test failed before the fix and passed afterward. The reviewer confirmed the correction and reported no further concrete findings.

Current checks: 282 frontend tests across 27 files, TypeScript, lint, normal static export/package and fictional public static export passed. The expanded native-CDP sheet runner passed body/footer/disabled-action expansion, fixed background, continuous reading, subsequent native scroll, cancellation/reversal, dismissal, ordinary taps/focus and reduced motion. The previous reduced-motion 60px expansion expectation was below the newly agreed threshold at that viewport; it was replaced by explicit 20px-return and 70px-expand assertions, with independent review of that contract alignment. Existing desktop/mobile motion and mobile-workspace suites passed, including installed desktop WebKit checks; these cover repeated/rapid transitions, keyboard/focus, failed-save recovery, guarded drafts and reduced motion. Public static-preview acceptance passed all six routes, fictional PDF/Word access, bookmark isolation, disabled private operations, no API/auth/provider calls and desktop/mobile accessibility.

A native rerun initially stopped at the loading skeleton before any gesture: the observational server had retained the previous build's CSP hashes after the export was replaced. Restarting it with the new export's exact production headers resolved that harness setup failure. No security header or application assertion was relaxed; the failed receipt remains local.

All seven final native Xcode cases passed on the frozen final export: the two unchanged release-policy assertions, continuous body reading, footer/salary expansion, downward collapse and dismissal, ordinary grip/Documents/workspace-Close taps, and disabled Prepare draft/footer-padding expansion. The final disabled button was observed as natively disabled before a real 70-point drag from its measured center expanded the sheet; footer padding passed separately in the same test. Exact final prefixes are `015311`, `015511`, `015621`, `015645`, `015714`, `015741` and `015829` on 7 November. The final source fingerprints match the source used for all local checks. Native recordings preserve the gestures with motion enabled; settled desktop/mobile and native screenshots were inspected without a visual-style change.

Evidence remains local under ignored `output/playwright/iphone-simulator/`: immutable baseline/candidate `.xcresult` bundles, native recordings/screenshots, passive event traces, final source fingerprints and check logs. The native harness uses the installed official Xcode UI-test template, signing disabled and no dependencies. Simulator results do not establish physical Safari acceptance, curved native gesture paths, VoiceOver, pinch/long-press behavior or physical-device performance. Concurrent live-development/Tailscale changes and generated development configuration are excluded. The public recovery revision is `3848d74`; follow the existing release runbook after the already-authorized push.
