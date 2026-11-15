# Documentation refresh — 16 November 2026

Updated the README and maintained guides against source after `0025aa2`, the published release metadata, current CLI behavior and the existing release workflow. Application runtime code and dependency versions were unchanged. Two showcase helpers were updated to use current controls and describe the static public deployment accurately.

## Corrections

- Documented the company board, original logo/initials behavior, title-first cards, To apply choices, stable review columns and current application journey.
- Replaced the obsolete JSON-only architecture and future-SQLite claim with the implemented schema-7 database, schema-3 portable snapshots and explicit legacy recovery path.
- Distinguished the tagged 0.7.0 wheel from newer source, installed packages from source execution, and the public static site from the private hosted pilot.
- Corrected submission authorization, supported channels, switch blockers, export response/download paths, and browser-local choices versus tab-memory drafts.
- Updated developer setup, optional dependencies, mobile instructions and public deployment guidance against their owning configuration and commands.
- Added a [documentation index](../../docs/README.md) and [task-record guide](../README.md). Dated plans, release evidence, older visual designs and superseded ADRs retain their historical claims with current pointers.
- Fixed the three missing local links found in the initial Markdown sweep: two removed components now link to their original source revision, and an ignored archived browser receipt is identified as local evidence instead of a distributed repository file.

## Local verification

| Check | Result |
| --- | --- |
| Fresh source installation | Created a disposable source copy and virtual environment, installed with `pip install .`, verified import from the installed package outside the checkout, initialized SQLite and served the packaged interface with HTTP 200 |
| Documented CLI and recovery | Verified help/options, missing-path rejection, setup confirmation, research-gate setup and diagnostic, parameterless reads, database/snapshot schemas, and byte-exact ZIP and Git-snapshot recovery with fresh workspace identities |
| Focused Python contracts | 101 tests passed across `test_folders.py`, `test_tailscale.py`, `test_live_gateway.py`, `test_codex_job_research_gate.py`, `test_cloud.py`, `test_sqlite_workspace.py`, `test_company_best_matches.py` and `test_job_discovery.py` |
| Normal frontend | `npm --prefix frontend run build` passed; the packaged normal export was used for all recordings |
| README capture | `capture-showcase.cjs`, `build-showcase.py` and `check-showcase.py` passed against the disposable six-role fictional fixture; all three posters were visually inspected |
| Mobile sheet behavior | `tests/sheet-scroll-browser.cjs` passed same-contact reading, top-edge handoff, release outcomes, footer/disabled-control gestures, focus and reduced-motion assertions |
| Mobile build configuration | Xcode scheme listing and debug workspace-origin build settings passed; no physical-device result is claimed |
| Documentation links | Swept tracked Markdown and new guides for local files, image targets and heading fragments; no missing local targets remained |
| Final review | Independent source review resolved the navigation-label, queue-identity, workspace-switch, export-envelope and demo-persistence findings; JavaScript syntax and diff whitespace checks passed |

[Capture provenance](../../docs/media/showcase-provenance.json) records source `0025aa2`, dimensions, frame timing and hashes. [The quality report](../../docs/media/quality-report.json) records decoding, source-frame and reduced-motion checks. The three GIFs contain 112, 193 and 55 frames and remain below the existing 10 MB per-file limit. Earlier media evidence is pinned to its original commit.

The command checks used isolated configuration and fictional workspaces. No employer action, paid model run, private installation upgrade or authenticated hosted mutation was performed. Full cross-platform CI and the public deployment run after publication through the existing [Checks workflow](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml); this local receipt does not claim their future result. Release status is identified by the workflow's exact commit and the public `/release.json` marker.
