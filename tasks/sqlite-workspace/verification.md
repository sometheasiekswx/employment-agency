# SQLite workspace verification

[Specification](spec.md) · [Plan](plan.md) · [Task checklist](todo.md)

## Workspace and recovery

- Migrated a disposable copy of the existing private workspace on macOS. Compared 119 listings, 266 application versions, and 94 career facts with the legacy data. Compared 5,116 canonical application files byte-for-byte. The database passed integrity checks, the Git snapshot was current, and the restored workspace had fresh local permissions. The original state file matched its starting bytes.
- Verified automatic snapshot publication, a one-listing change, interruption after the database commit, recovery on reopen, and a conflict that preserved an externally edited file. A Git clone with line-ending conversion enabled restored successfully. The database was excluded from the clone.
- Verified both backup formats, a failed conversion with the original still usable, and rejection of the new format by the previous JSON reader. The staged conversion verifies the database and the readable snapshot before publishing the destination folder.

## Company policy

- Exercised one and two submitted vacancies, aliases and duplicate requisitions, competing approvals, deadline expiry, and a date-only submission at the end of a short target month. Confirmed that paused employers were skipped before a source fetch, including duplicate source configurations, and disappeared from general results while saved and submitted records remained accessible.
- Used controlled mail and browser transports. The SQLite tests cover exact approval, a single recorded dispatch, a timeout that holds the slot across restart, and verified release after non-submission. The manual handoff test records the verified outcome with its original date.
- Verified the built app at 390 px using Chromium and WebKit. The browser test confirmed the employer, selected a role, checked the cooldown empty state and reopened the saved role to see its deadline. The screenshots in the local Playwright output use fictional data.

## Follow-up workflows

- The paginated queue used the effective submitted version, retained tag-only submissions and saved drafts, respected archived history, and ran without hashing documents. The indexed 50-row Saved query had a median of 0.027 ms on 120 fictional listings and 0.028 ms on 5,000 listings in 40 warm local reads per case. These timings cover the local query.
- A failed source refresh after the first update preserved the previous listing and bookmark. Successful refresh deduplicated a repeated verified posting and kept the job ID after its URL changed.
- Concurrent requirement confirmations reused one career skill and kept both links after reopening. Retiring the skill removed its active matches.
- An interrupted paid run kept its reservation and surfaced the uncertain outcome. A run interrupted after storing a selection resumed without a second provider call and recorded the resulting application and run progress together.

## Test commands and scope

- All 234 backend tests passed on Python 3.12.14. The 13 workspace and follow-up tests also passed on Python 3.11.11. The backend suites use `.venv/bin/python -m unittest discover -s tests`. A prior concurrent run saw a transient development reload response. The isolated reload test and final full suite passed.
- All 369 frontend tests, lint, type checking and the production build passed. Frontend verification uses `npm --prefix frontend run lint`, `npm --prefix frontend test`, `npm --prefix frontend run typecheck` and `npm --prefix frontend run build`.
- The local and hosted browser suite passed, as did the controlled Apply For Me and static public preview suites. Browser verification uses `tests/run_browser_checks.py` and `tests/sqlite-company-browser.cjs` against disposable local and hosted fixtures. The public static preview and Apply For Me checks use their existing repository runners.
- The test candidate is installed into a temporary environment by `tests/check_wheel.py --browser`. The installed-workspace proof passed for exact document bytes, SQLite ZIP restoration, queues and browser navigation. The candidate wheel SHA-256 is `71a336a22bf132007be56d1dbf9a0d994a08b721e175a3ca107d69ce696b7bc5`.

This evidence is from macOS. Windows and Linux CI, physical-device acceptance, and the upgrade of the active private workspace are separate release checks. All employer-facing scenarios used fictional data and controlled transports.
