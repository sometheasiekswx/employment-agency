# Jobs and To apply verification

Implementation started from `origin/main` at `5745b56` in a separate worktree. All browser and storage checks below used disposable fixtures. The SQLite v7 upgrade rebuilds both queue indexes in one transaction without rewriting the portable records. The UI reads To apply from the workspace state and paginates the local board after filtering; both paginated compatibility APIs remain available.

| Check | Result |
| --- | --- |
| `.venv/bin/python -m unittest discover -s tests -v` | 330 passed. The queue tests cover bookmark-only, agent-only and doubly marked records, transactional schema-6 rollback and retry, both compatible clear operations, refresh, restoration, equivalent submitted vacancies and exact application IDs. ZIP and Git snapshot tests preserve membership and the agent tests verify that restored audit records never regain execution authority. |
| `npm --prefix frontend test` | 366 passed in 31 files. Includes visible profile mismatches, ranking failures, no profile, a protected unsaved Activity note, legacy agent URLs and destination/status filters, selection across 51 pending roles and clipboard fallback. |
| `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm --prefix frontend run build` | Passed. |
| `npm --prefix frontend run build:preview`, `.venv/bin/python tests/run_public_preview_checks.py` | Passed. The static export retained browser-local To apply choices across tabs and reload, preserved a saved employer snapshot when its simulated feed closed, and passed desktop/mobile accessibility checks. |
| `uv build --wheel --out-dir dist`, `python3.13 tests/check_wheel.py --browser dist/*.whl` | Passed from an isolated installation. Checks include both queue projections, installed assets, document bytes, history and ZIP/Git snapshot restoration. |
| `.venv/bin/python tests/run_apply_checks.py` | Passed with controlled channels, including 33 connected-agent tests and browser delivery evidence. |
| Existing local and hosted browser acceptance scripts in `tests/run_browser_checks.py` | Passed across isolated fixture groups. The initial full runner passed through the application navigation suite. I reran motion and the remaining scripts after fixing the mobile Back focus and updating their queue selectors. Hosted acceptance verifies Apply later, the To apply move, clear, and the absence of connected tools in hosted mode. |
| `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` | 108 passed. |
| Rendered Jobs → Apply later → To apply → Remove from To apply | Passed with reduced motion at 1440, 1024, 390 and 320 CSS px in Chrome. Legacy agent marks and bookmarks contributed one row each, the visible inspector action fit the viewport, and removing a role returned it to Jobs after reload. Screenshots are in ignored `output/playwright/jobs-to-apply/settled/`. |

After the mobile focus correction, the production export, full frontend test suite, typecheck, static-preview checks and installed-wheel browser checks passed again. The SQLite application journey also passed at 320 CSS px and with enlarged CV text. It prepared a CV within To apply, verified the exact indexed draft, copied only the selected role references, exercised self-apply with a fictional receipt and verified immutable submitted bytes.

Real provider accounts, physical devices and the private installed build were outside the local verification. Production CI and deployment evidence belong to the delivery step.

## Independent review and delivery readiness

The coordinating agent reviewed the actual diff against `5745b56`, including queue projection/migration, compatibility operations, role navigation, selection and submission boundaries, the static transport, and changed tests. Review findings were fixed and rechecked: preserve unfinished Activity notes when clearing the selected role; normalize legacy agent-location links before opening a role; filter unprepared saved roles by application state; and defer idle agent setup until selection. Browser verification also corrected first-render board packing and phone focus. No blocking review finding remains.

The release target is the shared repository's `main` branch and its existing automatic public-demo workflow. The previous verified public artifact serves source `81515b8c0db45a0f55ea7f66b768801999792b66`; recovery follows [the deployment runbook](../../docs/public-demo-deployment.md#verify-and-recover). Only public software and fictional test records are included. This source push does not install a build into a private workspace or publish a replacement v0.7.0 wheel.

Delivery is pending the source push, cross-platform CI and live smoke check. No employer was contacted during this work.
