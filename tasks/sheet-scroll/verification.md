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
