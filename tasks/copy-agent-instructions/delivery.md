# Copy agent instructions delivery

Release verification for the shared app. The local distribution was exercised in disposable installations and protected workspace copies. Deployment verification is recorded by the Checks workflow and in the installation’s local recovery records.

## Artifact and source

| Item | Value |
| --- | --- |
| Source base | `f444311311e07eded83c689e0d76b4568770d065` |
| Candidate branch | `codex/copy-agent-instructions` |
| Wheel | `employment_agency_local-0.7.0-py3-none-any.whl` |
| Wheel SHA-256 | `81f5f518d4f6024eb916ef0524c51253ca3678aac14e97e126007e80e864128c` |
| Source patch SHA-256 at build | `a1ea6917eef51403c6e9793aac93957cbe657837ff6a9a65f27092aba8daed02` |
| Final verified source patch SHA-256 | `cee746493daea212fdbdc4635ea3aa611b39bdcb33f8bd84c7252af839ea8d92` |

The wheel was built from a clean archive of the base commit with the reviewed tracked patch applied and a fresh frontend dependency installation and export. Untracked files at handoff were task records. The final verified patch adds a browser-test wait for the pending action to detach after the workspace refresh. The wheel excludes tests, so the packaged bytes and their build provenance remain the same. The local wheel, patches, checksums, and logs are retained in the protected recovery folder outside both repositories.

## Verification

| Check | Result |
| --- | --- |
| Frontend typecheck, lint and Vitest | Passed. 386 tests across 35 files. |
| Production frontend build | Passed from the staged source for the wheel. |
| npm audit, moderate and above | Passed. Zero vulnerabilities reported. |
| Public demo release scripts | 108 tests passed using fictional responses and artifacts. |
| Python unittest suite | 393 tests ran with 7 skips and no failures. The skipped tests require the optional Python Playwright integration. |
| Clipboard, queue, row layout and accessibility | Chromium and WebKit exercised native clipboard copying, desktop and mobile layout, and fallback and queue behavior. See [implementation verification](verification.md) for the tested source and screenshots. |
| Production browser acceptance | Full `run_browser_checks.py` passed across all local and hosted fictional fixtures. The installed-wheel run separately verified the final browser-test wait. |
| Installed wheel proof with Chromium | Passed the official `check_wheel.py --browser` outside the checkout. Verified exact packaged assets, offline demo, application journey, queue precedence, and preserved submitted documents. |
| Protected backup rehearsal | Passed with the candidate and previous interpreter on disposable copies of the archive already recorded in the workspace pin. Verified normalized records, published snapshot and SQLite schema 7 integrity, all archived files and every submitted document reference. The previous interpreter also reopened the candidate-tested copy successfully. |

The first two installed-wheel browser runs observed the pending role action immediately after the receipt appeared, while the workspace refresh was still running. The source-browser fixture and the previous installed wheel passed the immediate check. A diagnostic using the candidate verified that the action detached and that the durable status and document checks still passed. The final browser fixture waits for that detachment and the official wheel proof passed. The runtime and wheel did not need a rebuild for the fixture correction.

## Live cutover and recovery

A private installed upgrade needs a fresh protected export from the existing build, confirmation that no active delivery or discovery work would be interrupted, and a fresh restore rehearsal before switching the interpreter. Keep the previous interpreter, wheel, pin and archive available. After the switch, verify that loopback and private HTTPS serve the candidate and show the expected Jobs and To apply behavior. Update the pin after target verification. Restore to a separate directory if data recovery is needed, preserving and reconciling any newer workspace changes first. See the [workspace upgrade runbook](../../docs/running-locally.md#existing-environments-and-upgrades).

The local rehearsal covered the wheel and browser acceptance. The Checks workflow covers the cross-platform matrix and public demo deployment. Physical-device checks were outside the local rehearsal.
