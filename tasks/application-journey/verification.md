# Application journey verification

Build verified locally, 14 November 2026. [Specification](spec.md) · [Plan](plan.md) · [Task status](todo.md)

The implementation agents use GPT-6.1 Sol with Max effort, as requested. Work is limited to the shared application and disposable fictional fixtures. The private workspace, its installed build, external applications and release targets are outside this build's changes.

## Starting checks

- Frontend baseline: `npm --prefix frontend test` passed **30 files / 350 tests** before journey edits.
- The checkout's `.venv` lacks `truststore`; its initial Python test invocation failed during imports. This is a pre-existing environment issue.
- An existing installed interpreter has all base and optional apply dependencies. Running it from the shared source checkout passed **274 Python tests** with `-m unittest discover -s tests -v`. No packages were installed into that environment and no personal workspace was opened by these tests.
- Existing uncommitted source-link/discovery/UI changes were preserved as the implementation baseline. Source and installed-build verification remain separate.

## Automated checks

| Check | Result |
| --- | --- |
| `python -m unittest discover -s tests -v` | **311 passed** in 67.464s, including employer conflicts, context, queue migration/restore, self-apply, scoped execution, channel fallbacks and protocol faults. |
| `npm --prefix frontend test` | **31 files / 361 tests passed**, rerun after the final panel-navigation correction. |
| Frontend typecheck, ESLint and production build | Passed. |
| `npm --prefix frontend audit --audit-level=moderate` | Zero reported vulnerabilities; no dependency changes. |
| Public release-script Node tests | **108 passed**, with controlled providers and no release action. |
| Local and hosted browser acceptance | All scripts from `tests/run_browser_checks.py` passed across its disposable fixture groups and targeted reruns; see browser evidence below. |
| `tests/run_apply_checks.py` | Passed recording Gmail/OAuth/Keychain contracts, real Chrome legacy-form checks, original approval guards, exact attachments and Activity receipts. |
| Public preview build and `tests/run_public_preview_checks.py` | Passed final source build (319 static files), six routes, PDF/Word, browser-local state, imports/edit/export, isolation, mobile links and accessibility. |
| `tests/check_hosted_install.py` | Hosted dependency bootstrap before frontend assets passed in an isolated environment. |
| `tests/check_development.py` | Real Next/Chrome protected API and live CSS refresh passed; SIGINT/SIGTERM released listeners and workspace lock. |
| `git diff --check` | Passed. |

Tests used macOS, existing Chrome/WebKit tools and a complete existing Python 3.12 interpreter. The incomplete checkout `.venv` was not repaired or used to claim a passing run. Source tests used fictional workspaces; installed-wheel tests create a separate temporary environment outside the checkout.

## Browser journey

The built application passed **Prepare application → exact returned CV → Open application site → I've applied**. Checks cover the persistent original listing, separate verified destination, inline employer clarification, denied-popup continuation, preview failure/download/retry, a failed outcome save with retained input, exact submitted bytes and movement out of the pending agent queue.

The queue checks mark roles before documents exist, select multiple roles, preserve selection across pagination, show selectable instructions when the clipboard is denied, and prove that marking/copying creates no run or reservation. Legacy receipts, original-version routes, submitted-version precedence, editing, imports, local/hosted boundaries and workspace switching remain covered.

Desktop and mobile coverage includes 320px layouts, the existing viewport/breakpoint matrix, 200% text, reduced motion, keyboard focus/Back, native dialog dismissal, sheet gestures and Axe checks. Chromium and WebKit passed the mobile workspace and source-link checks. The final correction removes the unsaved-change prompt when switching panels inside a role, preserves both evidence and comment drafts, and retains protection when actually leaving the role.

Initial browser failures exposed real focus, gesture and inline-continuation regressions plus obsolete assumptions about the removed workbench and automatic CV opening. The affected checks were corrected and rerun. An asset rebuild invalidated one running fixture's cached HTML; its fresh unchanged-export rerun passed. The final browser pass was completed by fixture groups and focused reruns, without dropping the remaining local/hosted checks.

Final fictional renders (generated, untracked):

- [Desktop CV](../../output/playwright/application-journey/final/cv-desktop.png)
- [Mobile CV](../../output/playwright/application-journey/final/cv-mobile.png)
- [Mobile at 200% text](../../output/playwright/application-journey/final/cv-mobile-200.png)
- [Agent queue](../../output/playwright/application-journey/final/queue-desktop.png)
- [Submitted record](../../output/playwright/application-journey/final/submitted-desktop.png)

A separate 320×820 geometry check confirmed that Close, the listing, the application-site action and the agent footer are visible and hit-testable after the CV opens. Physical-device testing was not performed.

## Connected runtime proof

The opt-in `tests/check_connected_agent.py` passed with the actual installed Codex **0.167.0-alpha.4.1**, ChatGPT authentication, **gpt-6.1-sol / max**, and real Chrome form inspection. Its independently captured model request exposed only `apply_selected_role`; unrestricted execution, file, browser, connector and other model tools were absent. The application service owns the exact destination, documents, answers and external dispatch.

The protected HTTP start returned a durable run; repeating its request key returned that same run. With no open UI client, the worker reached a specific missing question. Answering it produced exactly one POST to the fictional loopback fixture, with identical CV and cover-letter bytes, and recorded the exact version as Submitted. A second actual model run stopped at the missing question with zero POSTs. The fictional HTTPS address was remapped by an injected test transport; this was not an employer or job-board submission.

- Final submitted run: `c0d5f69ba4ef436c839d4574feab9079`
- Attempt: `6a1537e7f1ef42959daab132bb727d1a`
- Exact application version: `98f1987574704cf5ad220c3919e1a315`
- Fixture confirmation SHA-256: `4988f66cdae5cb34f1973e76577ca539684453e043bf68e0b961a8351ec132b1`
- Final stopped live run: `8ccb2763a90e45139aa6f87f87ad2a56`

This proof was rerun after the final authority and recovery fixes. The machine-local permit, workspace/path binding, frozen preparation inputs, uncertain-document association and receipt-only recovery checks were in place. The experimental runtime adapter enables only the independently verified Codex build above; another build reports unavailable until its tool boundary is verified.

Reproduce explicitly with an existing authenticated Codex/Chrome environment:

```sh
python -u tests/check_connected_agent.py
```

Ordinary CI uses fake protocol peers and recording providers, and does not consume a live account. The actual local Gmail connection is disconnected. No scoped personal Telegram connection is available in the app. Recording transport tests establish fallback contracts, not live provider delivery. Supported website execution is bounded to validated HTML forms at the exact HTTPS endpoint; sign-in, unsupported JavaScript, cross-endpoint forms, consent choices and unsupported reference disclosure require help.

## Review and recovery

The review fixes bind executable permission to a machine-local nonce, workspace identity and resolved path. Copied/restored audit data cannot authorize dispatch. Unprepared runs retain fixed facts/profile/master inputs. Changed employer evidence blocks an old selection while preserving historical employer links. Unknown document association remains unassigned until specifically confirmed; a confirmed website/provider receipt is retained before updating the submitted version and can be recorded again without another send.

Protocol tests cover early events, wrong thread/turn/tool calls, interruption, malformed messages, disconnection and usage errors. Channel tests cover exact recipients and bytes, hidden vacancy/answer fields, misleading intermediate confirmation, changing sender, unavailable channels and unknown outcomes with zero fallback sends. Restored or expired undisclosed holds can be released without receiving sending permission. One-shot CLI start/resume/answer is rejected before dispatch; long-lived execution belongs to the running app.

## Delivery boundary

No commit, push, deployment, employer contact or private-workspace upgrade was performed. The new derived SQLite index uses migration 6. A later private upgrade requires the existing backup/restore and migration process; do not downgrade a migrated database in place. Windows/Linux CI, physical devices and live authenticated employer/Gmail/Telegram delivery were not exercised in this local build.

## Installed candidate

The final production frontend was packaged with the final backend into [the local candidate wheel](../../dist/application-journey-2026-11-14-final/employment_agency_local-0.6.0-py3-none-any.whl). It is a local build using the existing package version, not a published release.

```text
employment_agency_local-0.6.0-py3-none-any.whl
SHA-256: 5c0f4c39fa55a78b97f4f6d8b42b3776acd24d907cf61903b43c4b0d5f6692ad
```

`tests/check_wheel.py --browser` passed for these exact bytes in a fresh environment outside the source checkout: packaged routes/assets, protected verified CV reads, no-document queue markers, read-only context, missing runtime, old approved-delivery receipts, SQLite migration, ZIP and Git-snapshot restore, the complete new browser journey and unchanged submitted files/version precedence. The private workspace lock and installed build were not used as the test target.

Local command logs are under `/tmp/ea-journey-*`: `python-release.log`, `frontend-reviewed.log`, `lint-reviewed.log`, `browser-release.log`, `browser-release-remaining.log`, `public-release.log`, `apply-release.log`, and `wheel-reviewed.log`. The final affected navigation checks are in `/tmp/ea-journey-panel-browser.log`. Generated screenshots and wheels remain local artifacts; the tests and this result record are the reproducible source evidence.
