# Stable opportunity board — delivery evidence

Verified on 15 November 2026. The documented interview, specification, plan, implementation, testing, review and release preparation are complete. No lifecycle stage was skipped. The initial delivery completed release preparation. The subsequent owner request, “review, ship, bring changes to main”, authorizes this task for shared `main` and its automatic public-demo release. The private installed workspace remains a separate upgrade.

## Result

Company and role identities retain their review order. Each company keeps its physical column while saves, removals and background updates close only local gaps. Undo and rollback recover the former positions; arrivals append. Deliberate view/filter/profile/refresh changes reset the arrangement. A responsive column-count change repacks the layout, while ordinary width resizing follows the viewport directly.

Position changes settle in 200 ms using translation, with a 160 ms arrival fade when restored content needs room. The measured grid and browser animation API share the same lifecycle. Rapid actions continue from the current visible position. Keyboard and reduced-motion behavior remain immediate. The board retains its scroll extent during a review so removing bottom content does not pull the viewport upward. An exhausted column and some space below the remaining content can persist until a deliberate reset; this is the accepted stability tradeoff.

The current checkout retains the unrelated required-company-highlights edits. The release candidate is separately assembled from base commit `11e8ef18d61decb86297d51b2a3b5a5f09887cee` plus only this task's changes. The base is also the implementation recorded by the installed private build at the start of this task. No dependencies or workspace schema changes were introduced.

## Verification

| Check | Result |
| --- | --- |
| Frontend Vitest suite | 36 files, 389 tests passed, including ordering, disappearance/Undo, arrivals, explicit reset and current role data |
| Frontend lint, TypeScript and production export | Passed; final candidate and shared checkout build successfully |
| Python regression suite on the isolated candidate | 402 tests passed |
| New board regression, Chromium and WebKit | Passed: unaffected-column coordinates, local intermediate animation frames, last-role exit, Undo, rollback, background arrivals/reranking, explicit refresh, empty column, keyboard focus, reduced motion, interrupted actions, bottom-of-page scroll and responsive geometry |
| Existing Discover layout suite | Passed: 320–1920 px layouts, inspector transitions, long/enlarged content, group order, non-overlap and local handling of content growth |
| Existing removal suite | Passed on the integrated checkout: desktop/mobile triage, Undo/Restore, retry, errors, exact-job feedback, focus and preserved application history |
| Company capacity suite | Passed on the isolated candidate, including its accessibility audit and compact-card transitions |
| Company highlight review suite | Passed on the integrated checkout with the existing other feature retained |
| Existing motion suite | Passed on the isolated candidate: actual desktop/mobile frames, rapid interruption, keyboard/dialog focus, URL Back, delayed bookmark failure/retry and live reduced-motion changes |
| Built wheel installed outside the checkout | Passed: route/asset parity, documents, submitted export/restore, SQLite migration, ZIP/snapshot recovery, recording-only delivery fixture and offline demo |
| Diff whitespace and candidate file hashes | Passed |

The Python suite emitted its expected malformed-PDF fixture diagnostics and finished successfully. The first packaging command used a development environment without setuptools; the normal isolated build specified by `pyproject.toml` succeeded. No development environment upgrade was needed.

Browser actions used disposable fictional workspaces. Chromium and WebKit runs are browser evidence; they are not a physical iPhone acceptance test. The complete remote CI operating-system matrix was not run locally.

## Review and corrections

Review covered the actual task diff, current grouping and focus callers, animation cleanup, reset boundaries, responsive layout, company highlights/capacity and optimistic recovery. `animate`, `choreograph`, `frontend-ui-engineering` and `web-design-guidelines` supplied focused implementation/review guidance. [Research sources and the accepted scope](spec.md#research-and-implementation-guidance) remain in the specification.

Resolved findings included ResizeObserver feedback in WebKit, transient implicit columns during responsive changes, layout motion trailing width changes, and fully opaque restored cards covering neighbours during Undo. Browser settling now observes consecutive stable frames so a resize callback cannot begin after a premature assertion. The new test's card selector was also scoped to the board to avoid confusing a removal toast with its card.

Two existing test assumptions were updated to match the accepted behavior: content growth keeps other columns fixed, and a role returning from To apply may be last in the current review. The replacement assertions still check geometry, overlap and a real adjacent-role transition under reduced motion. No validation or failure checks were suppressed. No unresolved blocking findings remain for this change.

## Candidate and recovery

`output/stable-opportunity-board/current-candidate.txt` identifies the prepared candidate directory. Its `manifest.json` records source hashes and the base commit; `source.patch` contains only this task. `release.json` records the wheel and verification status. These generated artifacts are ignored by Git.

Wheel: `employment_agency_local-0.7.0-py3-none-any.whl`.

SHA-256: `66980a0504727ce0678749e415f0cc07bae10f6ff9d9b72f7e8185a1a6bbc810`.

The current preview video is `output/playwright/board-stability/motion-preview.mp4`; the final candidate retains full Chromium/WebKit recordings and sampled frames under its `source/output/playwright/board-stability/` directory.

An authorized upgrade should first export the current private workspace and verify restoration with the candidate, retain the current `workspace.lock.json` and installed wheel, and stop only the identified live process before replacing its installation. Preserve its existing private access settings, verify the intended workspace and board over the actual access path, and then update the lock with exact provenance. Recovery uses the retained prior installation and the fresh verified backup as appropriate; this change itself needs no schema migration.

## Main release review

The 14 task files were hash-verified against the tested isolated candidate and assembled in a separate Git worktree on current `main`, `11e8ef18d61decb86297d51b2a3b5a5f09887cee`. Unrelated required-company-highlights edits remain in their original worktree. The exported patch was regenerated using Git and its reverse applicability checked; the product source is unchanged from the verified candidate.

A further review covered the exact diff, ranking/reset and focus callers, interruption cleanup, responsive measurements, scroll retention and the updated test assertions, using the current Web Interface Guidelines. No blocking findings remain. This is a local review, not an external specialist review. The frontend and Python test evidence above still matches the product source.

The release target is shared `main` and the existing static [public demo](https://employment-agency-demo.vercel.app/discover/), through [the established workflow](../../docs/public-demo-deployment.md). [GitHub Actions](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml) is the authority for the exact main revision's complete operating-system matrix and deployment outcome; `/release.json` identifies the live revision. The source change adds no dependencies, credentials, backend authorization behavior or schema migration. Existing release credentials remain in Actions secrets.

Before this release, the public alias and successful Checks run both identified `11e8ef18d61decb86297d51b2a3b5a5f09887cee` as the previous known-good revision. A failed staged check leaves that release live. If verification fails after promotion, use the runbook's previous-deployment recovery procedure and recheck the alias. No private workspace upgrade or employer-facing action is included in this release.


The first main run, [43663011793](https://github.com/sometheasiekswx/employment-agency/actions/runs/43663011793), stopped before deployment at the new rapid-interruption assertion. That assertion compared positions across several browser protocol calls; ordinary animation travel during those calls could exceed its whole-card threshold. The replacement check observes an active transition in the browser, holds its current frame through the second removal, and compares that position with the replacement animation's initial frame within one pixel. It also requires cancellation of the previous animation and creation of its replacement, then resumes motion and verifies the final layout. This removes the timing ambiguity and makes the continuity assertion stricter. Chromium and WebKit pass with no product-source change; the recorded interruption coordinates differ by less than one pixel. A Chromium run with 4× CPU throttling also verifies the complete board scenarios.
