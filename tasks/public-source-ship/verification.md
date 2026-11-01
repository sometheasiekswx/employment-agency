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
