# Public source push readiness

Prepared 2 November 2026. Target: `sometheasiekswx/employment-agency`, `origin/main`, based on `f5c61168a45f3716153f454ce95c61ad2ba8e024`. The owner explicitly selected the **public application only** and authorized fixing confirmed issues, re-reviewing and pushing. The private career workspace is excluded.

## Candidate scope

- Local Apply For Me source preview: explicit disclosure, exact-document approval, Gmail/browser adapters, receipts, reconciliation and hosted restrictions.
- Canonical DOCX companion conversion, submitted-job preparation guards and one-card-per-job decision queues.
- One-command Python/Next.js development with coordinated cleanup and Fast Refresh.
- Actual React Bits Bell Toggle, reversible Draft/Reviewed decisions and the reference's expanding/ringing motion.
- Contributor, architecture, security, dependency and feature documentation; fictional tests and fixtures.

The package remains version 0.6.0 in source. The published 0.6 wheel remains the earlier draft-only release; this operation does not replace that wheel, publish a tag or upgrade any private installation. The source preview is explicitly distinguished in the README/security/glossary documentation.

## Fixes during release review

Whole-page Axe checks initially failed on button contrast. The Submitted button keeps the owner's bright-green fill and now uses dark text. Submitted tags and confirmation controls use a separate readable green text token on their pale backgrounds. The Apply For Me/Submission details control keeps its sky-blue fill and now uses dark text. No contrast assertion was suppressed.

The reviewer found stale security/glossary statements describing external delivery as absent or unimplemented. They now distinguish the implemented local source preview, separate disclosure/final approval, the draft-only published wheel and the hosted execution restriction. Dependency documentation now records the actual Bell Toggle port and retained licence.

The earlier task reports record the state at their respective checkpoints. Their former contrast blockers are resolved by this candidate; the complete browser suite now passes.

## Local checks

| Gate | Result |
| --- | --- |
| `python -m unittest discover -s tests -v` using `.venv/bin/python` | **119 passed** |
| `npm --prefix frontend test` | **40 passed** |
| Frontend type check and lint | **Pass** |
| Production frontend export | **Pass**, built from an isolated source copy and packaged without resetting the user's live development cache |
| `python tests/run_browser_checks.py` | **All 11 local/hosted scenarios passed**, including whole-page contrast, queues, Bell motion/round trips, editing, folder switching, recovery and hosted boundaries |
| `python tests/run_apply_checks.py` | **Pass**: mocked Gmail HTTP, actual Chromium against controlled forms, approval/receipt UI, exact custom PDF bytes; no employer action or real mail |
| `python tests/check_development.py` | **Pass**: actual Next.js proxy, guarded saves, CSS Fast Refresh, Ctrl+C/SIGTERM cleanup and immediate restart in a temporary source tree |
| `python tests/check_hosted_install.py` | **Pass**: dependency bootstrap before frontend assets exist |
| Wheel build and `python tests/check_wheel.py` | **Pass**: installed outside checkout, routes/assets, document generation, recording delivery, exact attachment bytes, submitted export/restore and offline demo |
| `npm --prefix frontend audit --omit=dev --json` | **0 reported production dependency vulnerabilities** at check time; not an exhaustive security assurance |
| `git diff --check` | **Pass** |

The temporary verification wheel SHA-256 is `1f536bcf26e3077eb967dd1083f82f66818ad45d05c5093cdf1216a43e020b25`. It is a local test artifact, not a new release download.

Logs: `/tmp/ea-ship-{python,frontend-test,typecheck,lint,build,browser,apply,development,hosted-bootstrap,wheel-build,wheel-proof}.log` and `/tmp/ea-ship-npm-audit.json`. Browser evidence is under ignored `output/playwright/`; all fixtures use fictional career data. Initial failing contrast runs remain separate from final passing evidence.

## Review, publication and recovery boundaries

One reused reviewer independently inspected the complete public diff, including untracked files, against the base above. The earlier private-workspace review is not evidence for this source candidate. No private career records, credentials, browser sessions or runtime caches belong in the public commit.

This document records local push readiness. Remote CI results and the exact pushed commit are to be verified on GitHub and reported after publication; local checks do not prove Linux/Windows CI or deployment success. No manual Vercel deployment, wheel release or live Gmail/employer submission is part of this push.

Recovery: retain the previous public commit and published wheel. A source rollback can revert the candidate and rebuild the export. Workspace schema remains 2; no migration, private pin update or career-file rewrite is required. Do not reset unrelated private changes.

## Post-push checks and follow-up

Source commit `5136d629256e3fb757b1448b3672e2f69bfff551` reached `origin/main`. GitHub reported development-only `minimatch` advisory GHSA-g3hv-75wg-m249. The follow-up pins its transitive override to patched 11.0.1 and adds a full dependency audit to CI. An isolated fresh install passed the full audit (zero reported vulnerabilities), lint, type checks, all 40 frontend tests and production build. The installed local development dependency was also updated without resetting the running Next.js cache. Proof: `/tmp/ea-ship-minimatch-checks.log` and `/tmp/ea-ship-full-audit-fixed.log`.

The first remote run, [41328550129](https://github.com/sometheasiekswx/employment-agency/actions/runs/41328550129), failed four development-launcher tests on macOS; its matrix cancelled Linux and Windows. Inspection found stdlib `HTTPServer.server_bind` performing reverse DNS before the launcher installs its signal handlers. A new regression fails on the prior implementation when that lookup is unavailable. The loopback-only server now binds without DNS and uses its known address as its display name. Initializing its active service before binding also preserves the original bind error during failure cleanup; a second regression covers that path. The fixture frontend avoids the same unnecessary lookup.

All **121 Python tests** pass after these fixes, as does the real Next.js browser proof of guarded requests, CSS Fast Refresh, Ctrl+C/SIGTERM cleanup and restart. Logs: `/tmp/ea-ship-python-final.log`, `/tmp/ea-ship-development-final.log`, and the expected failing pre-fix regression `/tmp/ea-ship-loopback-dns-before.log`. Child stack traces and preserved failure output expose future remote startup stalls without extending timeouts or removing assertions. Matrix fail-fast is disabled so all three operating systems produce independent results. Remote verification must still pass on the follow-up revision before claiming a CI pass.

All 11 local/hosted browser scenarios also pass again after the server change (`/tmp/ea-ship-browser-final.log`), including Bell Toggle motion, queue status precedence, document versions, workspace switching and hosted restrictions.

Commit `795b5398b6a93d8308e9ef111ee810788a345e1e` passed macOS CI. GitHub marked the dependency advisory fixed. Its automatic production deployment is READY, and a read-only smoke check passed the shell, 13 assets, four routes, hosted runtime and unauthenticated state rejection (401); no signed-in account or external submission was exercised.

Linux then exposed a test-fixture regression: switching the stand-in frontend from HTTPServer to TCPServer removed its reusable-listener setting. Three unchanged port-release assertions correctly rejected the resulting TIME_WAIT sockets. The fixture now explicitly restores `allow_reuse_address = True`, matching HTTPServer and Next.js; the application listener already has that setting. The 13 launcher tests pass locally after this correction (`/tmp/ea-ship-fixture-reuse.log`). The next remote revision must verify Linux and Windows before the source push is reported as passing all platforms.

Windows exposed locale-dependent reads of UTF-8 evidence and delivery journals. Non-ASCII dates were falsely treated as changed facts, preventing valid applications; non-ASCII message content could also be corrupted on reread. The four delivery JSON reads now explicitly use UTF-8. A CP1252-default regression first reproduces the exact evidence error (`/tmp/ea-ship-encoding-before.log`), then verifies accented message text, en-dash dates, journal readback and approved recording delivery without changing the fact checks or sending real mail.

After these corrections, all **122 Python tests** pass (`/tmp/ea-ship-python-encoding-final.log`), along with the complete controlled Apply For Me suite (`/tmp/ea-ship-apply-encoding-final.log`): mocked Gmail HTTP, actual Chromium against controlled forms, exact résumé/cover attachments, approval guards, receipt persistence, three responsive sizes and Axe checks. No live employer account or real mail was used. Frontend dependency/build/browser evidence remains valid because this follow-up changes only JSON decoding and the process-test fixture.


## Pre-push review — 5 November 2026

Candidate: working changes based on public main commit b534c8498303d00ec3e85f38cccc58bd1945c758, on codex/installed-queue-regression-20261103. The branch and remote main currently share that base; no upstream is configured for the local branch. This section records local readiness, not a commit, push, release tag or deployment.

### Findings resolved

- Job-form edits preserved neither unknown salary units nor imported select values. The form now retains unstated currency/period/basis and imported availability, work arrangement and expectation confidence until the user changes them. Fifteen component regressions exercise actual form payloads and explicit replacement/clearing.
- Updating job details replaced omitted research provenance with a manual source and a new check time. Existing source/checked_at now survive omission; explicit research replacements and new-manual defaults remain supported. Regressions cover ID and URL updates.
- Adopting edited documents cloned review/submission timestamps, archive state and stale integrity alerts into a new Draft. Those fields are now removed from the new record; the full submitted original and restored bytes remain unchanged.
- Supported custom letter headers could leak fontsize commands and multiline grouping braces into editable Word text. Conversion now strips bounded formatting syntax while retaining escaped literal braces and prose. It remains a conventional-template companion, not a general TeX layout engine.

The previous installed-wheel queue regression, version reporting, CI and contributor/run instructions are included. The incidental frontend/next-env.d.ts development-cache path change is excluded from the proposed commit.

### Final local evidence

All checks ran on an isolated source copy with a fresh frontend dependency install and fictional disposable workspaces. The private career workspace, running development cache and installed private build were not used for validation or upgraded.

| Gate | Result |
| --- | --- |
| Frontend fresh install and full npm audit | Pass; zero reported vulnerabilities |
| Frontend type check and lint | Pass |
| Frontend component/unit tests | 55 passed across nine files |
| Production frontend export and Python asset packaging | Pass |
| Python regression suite after frontend build | 127 passed |
| Complete local/hosted production browser workflows | All 11 scenarios passed |
| Controlled Apply For Me checks | Pass: mocked Gmail HTTP, actual Chromium against controlled forms, exact attachments, approval and receipt checks |
| Development lifecycle proof | Pass: API proxy guards, CSS Fast Refresh, Ctrl+C/SIGTERM cleanup and same-port restart |
| Hosted dependency bootstrap before assets exist | Pass |
| Wheel build and installed-wheel proof with --browser | Pass: installed-package routes/assets, document generation, recording delivery, export/restore, offline demo and one-card-per-job queues |
| Independent backend/frontend/packaging re-review | No remaining actionable findings |
| Diff hygiene | Pass |

Final implementation/test source fingerprint: 9d700bedae134ba0e15d37ed3f7347b0ce9f3d159fe206c0c4b48fd947c5ae17. This hashes the 213 source files compared byte-for-byte to the test copy, excluding generated next-env development drift and this subsequently appended evidence section.

The local verification wheel remains version 0.6.0 and is not a published replacement for the existing release. SHA-256: 49b44f91deaae9df73ca99fa3c5cedce2d02c64639c130a4487483bba7337a7e. Ignored logs, candidate metadata and wheel are under output/readiness/2026-11-05/. The first isolated Python run preceded asset generation and failed asset-dependent tests; the final run above followed the required build order and passed without weakening assertions.

### Release boundaries and recovery

The existing base commit's [GitHub run 41330094670](https://github.com/sometheasiekswx/employment-agency/actions/runs/41330094670) passed Linux, macOS and Windows. That is baseline evidence only; remote CI for this uncommitted candidate has not run. GitHub also reports a successful Vercel check for the base, not a deployment of these changes.

Local verification used macOS, Python 3.12 and Node 24. No live Gmail OAuth/send, authenticated LinkedIn application, signed-in production-account mutation or live multi-account hosted recovery/deletion test was performed. These remain explicit preview/pilot limitations; no service was enabled or access widened.

Workspace schema remains 2; no migration or private-data rewrite is required. Recovery is the previous public commit and published wheel, followed by rebuilding the prior source if needed. Publishing a source change does not upgrade a private pinned installation. Push target and any publication action must be clear before execution; no tag, package release, manual deployment or private installation change is included in this readiness result.
