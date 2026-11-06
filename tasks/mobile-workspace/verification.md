# Mobile workspace verification

Implemented against `92d8037a35054395ebe3eb0933efce4a84d691b9` on 6 November 2026. This records the initial local, uncommitted verification; the later README/publication follow-up is recorded in [README showcase verification](../readme-showcase/verification.md). Preview: <http://127.0.0.1:8799/discover/?view=all>, using the disposable fictional Alex Morgan workspace. The private career workspace and its port 8766 instance were not changed.

## Result and scope

- Visible mobile search filters loaded opportunities as the user types, retains focus and URL context, and does not trigger ranking requests per character. Clear remains accessible.
- Search and the existing Filters control share a row. All four workspace views remain visible on one row at 320/390px; profile and location access remain available.
- Static boot and ranking skeletons represent real pending requests; no artificial delay or shimmer. Loaded results survive refresh. Failures retain Retry and say Matches unavailable rather than zero matches.
- A visual grip replaces visible Expand/Collapse labels. Tap and ArrowUp/ArrowDown remain alternatives. Comparison, close and sheet actions have 44px targets.
- The whole native sheet arrives from below with a 320ms zero-overshoot spring; dismissal uses a 220ms translation. Position and recent velocity choose expanded, peek or closed. Native scrolling stays browser-owned; reduced motion snaps rather than animates.
- Drag-to-dismiss works from both peek and expanded. Outside dismissal requires a genuine outside press and click. Escape, Back, focus restoration, shortlist context, save rollback/retry and draft/submission safeguards are preserved.
- The peek remains 60dvh with a viewport-bounded 480px minimum. More economical mobile identity/section spacing exposes the first evidence row at 320px without enlarging the sheet. The charcoal/lavender design, employment logo and card proportions are preserved.

[Motion, scrolling decisions and primary sources](../../docs/mobile-sheet-motion.md).

## Checks

| Check                                                                                                              | Result                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `npm --prefix frontend test`                                                                                       | Passed: 260 tests across 27 files                                                                                 |
| `npm --prefix frontend run lint`                                                                                   | Passed                                                                                                            |
| `npm --prefix frontend run typecheck`                                                                              | Passed                                                                                                            |
| `npm --prefix frontend run build`                                                                                  | Passed: static export packaged                                                                                    |
| `PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v`                                                   | Passed: 163 tests; Python source unchanged afterward                                                              |
| `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` | Passed: 108 tests                                                                                                 |
| `PYTHONPATH=. .venv/bin/python tests/run_browser_checks.py`                                                        | Passed: all local and hosted acceptance checks                                                                    |
| `npm --prefix frontend run build:preview`                                                                          | Passed: fictional static build                                                                                    |
| `PYTHONPATH=. .venv/bin/python tests/run_public_preview_checks.py`                                                 | Passed: routes, fictional documents, isolated bookmarks, no API/auth/provider requests, accessible desktop/mobile |
| Independent WebKit moving-header interruption probe                                                                | Passed: 12 fresh contexts; previously reproduced a failure in context 2                                           |
| `git diff --check`                                                                                                 | Passed                                                                                                            |

The browser checks cover actual desktop/mobile motion, open/close/reopen, rapid reversal and selection, pending press interruption, pointer cancellation, native touch drag, native reading scroll, keyboard/focus, browser Back, failed saves and retries, reduced motion, and canceled unsaved-draft dismissals. WebKit drag checks use mouse input; Chromium uses CDP touch.

The five-cycle headless Chromium resize observation recorded 203 frame samples, 16.7ms median and p95 frame intervals, 190 layout events taking 19.669ms in aggregate and 39.345ms of style recalculation. Height resizing is a measured exception to transform/opacity because it preserves the real scroll viewport and footer. These are local observations, not physical-device performance guarantees.

## Independent reviews

The mobile judge worked from a separate agent context, used real browser controls and touch at 320/390px, and retained the same five equally weighted dimensions. Ratings: baseline 6.0/10; first candidate 7.6/10; second candidate 8.4/10; final candidate 9.0/10. The final compact candidate scored **9.0/10**, with all five dimensions rated 9: finding/narrowing, reading/comparing, sheet control/input, feedback/state continuity, and visual/narrow-screen clarity. The judge did not edit product code. Actual touch journeys included live search in the Applications and Submitted views, location/status filters, both retry buttons, interrupted arrivals at three timings and dirty-dismissal cancellation. Only optional polish remains: the long search placeholder clips at 320px; its label and typed query remain usable.

A separate code reviewer identified four concrete defects during implementation: pending toolbar taps stranded arrival motion; rejected dirty-close confirmation left an offscreen modal; stylesheet order overrode the intended peek; and WebKit could lose pending pointer-up after the moving hit target changed. All were fixed and independently reverified. The final code audit reports no remaining material findings within scope. Persistent regressions cover these paths.

## Local evidence

All recordings and screenshots below use fictional data and are under ignored `output/playwright/mobile-workspace/`:

- `final-mobile-motion.mp4` and the original `final-mobile-motion.webm`: short real-browser journey with animation enabled, live search, opening, expansion, drag dismissal and outside tap.
- `final-mobile-list.png`, `final-mobile-peek.png`, `final-mobile-expanded.png`, `final-320-list.png`, `final-320-peek.png`, `final-desktop.png`: settled screenshots inspected against the preserved visual style.
- `motion-contact-sheet.jpg`: sampled recording frames inspected for position continuity and footer/content geometry.
- `judge-baseline.md`, `judge-candidate-1.md`, `judge-candidate-2.md`, `judge-candidate-3.md`, and `code-review.md`: independent findings and observations.
- `unit.log`, `lint.log`, `typecheck.log`, `build.log`, `python.log`, `release-tests.log`, `full-browser.log`, `public-build.log`, `public-browser.log`: check receipts.

## Release boundary and limits

The initial implementation installed no dependencies and stopped before commits, pushes or deployment. The later README follow-up explicitly authorized publication. That release uses the existing checked public-demo release pipeline; recovery is documented in [public-demo deployment](../../docs/public-demo-deployment.md). There are no storage or data migrations in this change. The installed private build remains separate from the public-demo release.

Physical iPhone Safari/Android, real soft-keyboard viewport behavior, screen-reader speech and the CI operating-system matrix have not been verified in this local task. Browser emulation, WebKit engine coverage and axe checks do not replace that device/assistive-technology validation. The README walkthrough media was not re-recorded or published in this task.
