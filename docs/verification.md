# Verification

## Current checks

Follow [local setup and commands](../README.md#test-locally) for lint, type checking, frontend unit tests, the production build and Python tests. [Contributing](../CONTRIBUTING.md#browser-checks) covers production-export browser workflows with disposable local and hosted fixtures. Run `.venv/bin/python tests/check_wheel.py path/to/wheel.whl` for the installed-package checks, using the Windows Python path there. Linux CI also exercises the installed wheel in Chrome.

GitHub Actions runs the contract and packaging checks on Linux, macOS and Windows. Linux also runs the browser suites, including static public preview and connected application fixtures. The public demo's exact-commit checks are documented in its [deployment runbook](public-demo-deployment.md#verify-and-recover). The hosted browser fixture uses synthetic authentication and storage. Live Google sign-in, hosted storage policies and native dialogs need separate checks. [Workflow](../.github/workflows/check.yml) · [Hosted pilot](hosted-pilot.md#provider-setup-required-before-enabling-the-pilot)

## Release verification — 0.1.0

The following results are historical. [0.2 workspace refactor verification](workspace-refactor.md) · [0.3 startup verification](startup-verification.md)

## Passed locally on macOS

- 21 unittest cases: imported PDF/DOCX/text/TeX, confirmation/conflicts, hard filters and salary comparison, source normalization/failure/closure, strict fact-ID validation, consent and budget blocking, interrupted paid-request handling, run cancellation/resume, PDF/DOCX content, exact EML attachment bytes, review/submission immutability, archive integrity/path traversal and workspace locking.
- Real Chrome/Playwright workflow: identity → career fact → confirmation → profile → job → matching → bounded run → review/comment. No page errors; no horizontal overflow at 320, 768, 1024 and 1440 pixels. Keyboard focus and settings screen checked. Desktop/mobile screenshots and generated PDF pages visually inspected.
- Live read-only source checks: Greenhouse `figma` returned 138 jobs; Lever `palantir` returned 309. These observations are point-in-time checks, not endorsements or guaranteed continuing availability.
- Wheel packaging succeeded. A fresh installed wheel served the UI assets and API successfully.

## Review and fixes

Reviewed storage, import handling, source/network boundaries, provider disclosure/budget flow, matching, file delivery and UI contracts. Fixed silent unsupported-PDF-font output by checking extracted text, retained uncertain paid requests without automatic retry after restart, enabled editing imported job details, and retained failed source timestamps/status. Windows CI exposed reliance on the default text encoding; workspace and document I/O now explicitly use UTF-8. Prior submissions/rejections and existing packages are excluded from automatic batches; explicit local regeneration creates a new version. Browser test assertions were corrected to wait for completed runs rather than an intermediate message and to match comments with their timestamp context.

No paid OpenAI request was made. The request schema and selection/budget contract are tested locally; live provider/model/account compatibility remains unverified. No employer application or email was sent. Broad accessibility auditing, arbitrary resume fidelity, non-Latin PDF layout and global job-board coverage are not claimed. Native launch experience on Windows/Linux is not locally verified; matrix CI covers automated behavior. The UTF-8 portability correction passed all three GitHub-hosted operating systems; release-specific results are linked from the GitHub release.

## Recovery

The public repository starts with clean history. Personal career data never enters it. Restore exports into a new workspace, regrant consent and verify before switching. Keep prior pinned releases and exports. Version 0.1 rejects unsupported schemas rather than performing an implicit migration.

## In-page document editor — 29 October 2026

- 51 Python tests passed, including preview purity, immutable submitted originals, stale/integrity rejection, exact replacement email attachments, owner isolation and read-only hosted quota behavior.
- Local and hosted fixture browser tests passed: same-page PDF preview, edits, new-draft persistence after reload, 320/768/1440 widths and unsaved-close protection. Visually inspected the rendered PDF beside the editor in Chrome.
- Actual installed LaTeX compiler successfully previewed and saved a synthetic custom-template draft. No personal application documents were edited.
- JavaScript syntax and Git whitespace checks passed. Existing schema and package versions remain compatible; no data migration is required.
- Recovery: private workspace export and restore checked before updating its installed shared application. Production authenticated editor operations still require user-session verification; fixtures do not prove live Supabase writes.
