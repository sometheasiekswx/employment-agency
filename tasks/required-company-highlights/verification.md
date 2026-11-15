# Verification: required company highlights

The original candidate was verified locally on 15 November 2026 using Python 3.12.14, Node 24.22.0 and npm 12.2.0. GPT-6.1 Sol implemented the change and ran focused checks; the coordinating agent inspected the diff and ran the integrated checks below. All browser fixtures use fictional data.

| Check | Result |
| --- | --- |
| Full frontend Vitest suite | Passed: 387 tests across 35 files. |
| Frontend typecheck, ESLint and production build | Passed. The build packaged the static Next.js export for Python. |
| Full Python unittest suite | Passed: 408 tests, no skips or failures. The subsequent CLI regression was checked in the final focused run. |
| Final focused comparison and pending-slot checks | Builder verified 16 comparison tests and 23 pending-slot tests, including the new CLI subprocess refusal test and the final generated handoff. |
| Desktop/mobile highlights browser flow | Passed at 1440×1000 and 390×844. Verified missing → current → stale, exactly two highlighted reasons, remaining roles, profile isolation, filtered results, protected completion and unchanged application choices. |
| Existing SQLite company browser | Passed: employer resolution, shortlist, reserved self-application, submitted bytes, automatic removal and cooldown. |
| Existing Jobs capacity browser | Passed: compact rows, company navigation, scoped queue and restored capacity. |
| Installed wheel proof with browser | Passed outside the checkout: packaged assets/routes, document generation, recording delivery fixture, SQLite migration, ZIP/snapshot restoration, application journey and queue precedence, preserved submitted files. |
| Installed candidate highlight flow | Passed the new desktop/mobile highlight scenario using the installed package outside the checkout. All 50 packaged Python source files matched the reviewed source, and the candidate manifest hashes matched. |
| Whitespace/diff check | Passed. |

The final comparison tests cover scope isolation, the complete inventory despite a partial list of checked jobs, companies beyond the five-company presentation cap, missing/current/stale reviews, invalid workspace/profile/job input, unavailable listings and unresolved employer identity, insufficient confirmed evidence, posting duplicates including transitive chains and submitted mirrors, read-only operations, HTTP token protection and structured 409/CLI exit-2 failures. Existing snapshot/recovery and invalid-comparison tests remain in place.

The coordinating agent inspected `desktop-current.png`, `mobile-missing.png` and `mobile-stale.png` under `output/playwright/company-highlights/`. Highlights and review status remained legible in the existing layout. The third role stayed under More roles after saving two picks.

## Commands and evidence

The coordinating agent ran:

```sh
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run typecheck
.venv/bin/python -m unittest discover -s tests -q
.venv/bin/python -m pip wheel --no-deps . --wheel-dir output/required-company-highlights/wheel
.venv/bin/python tests/check_wheel.py --browser output/required-company-highlights/wheel/employment_agency_local-0.7.0-py3-none-any.whl
git diff --check
```

The three production browser scripts (`company-highlights-browser.cjs`, `sqlite-company-browser.cjs`, `jobs-capacity-browser.cjs`) ran with separate `serve_sqlite_fixture.py` instances through the repository's `run_browser_checks.fixture` and `browser` helpers. Logs are under the ignored `output/required-company-highlights/` directory. Protected backup evidence stays outside both source and career repositories; its local location is recorded in that ignored output directory.

Not run: the complete collection of unrelated browser suites, hosted/public-preview builds, Linux/Windows CI and physical phone checks. No dependency or hosted-runtime change is part of this feature. The installed-wheel tests and relevant production browser flows passed locally on macOS/Chromium.

The verified candidate excludes concurrent board edits. The branch consolidation ports the feature onto the board already delivered in shared main.

## Consolidation checks

On 16 November 2026, the feature was integrated on shared base 478173a7bb33e24cdac929f8c58ea94032fea070. The original public catalog caller failed when it passed workspace state to the new listing-inventory interface. The integrated export and approved-profile republication passed with the restored highlights backend. A fictional mirrored listing before the selected listing verifies that grouping preserves the reviewed pick and its original listing. Public bundles carry the reviewed picks.

- The focused company, cooldown, pending-slot and catalog-import suites passed 52 tests. The public export and publication suite passed 9 tests.
- The Discover component suite passed 67 tests. Frontend typecheck, lint and production build passed.
- The integrated full suites passed 395 frontend tests across 36 files and 423 Python tests. The Python run completed in 153.128 seconds.
- Production browser checks passed for company highlights at desktop and mobile widths, SQLite company flows and submitted document bytes, board stability, and card mutations.
- Both static public preview browser workflows passed against the 418-file build.
- The wheel installed outside the checkout and passed route, document, migration, snapshot restore, delivery fixture and queue browser checks. Its SHA-256 is 9c567ef983a02f30de8bb602e2fa309baa4ca64aa0f94c5564d77f50bcdef61f.
