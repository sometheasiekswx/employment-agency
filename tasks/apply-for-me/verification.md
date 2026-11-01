# Apply For Me — verification

Observed locally on macOS, 31 October 2026. This is an unreleased source preview, not a claim of production or real-provider acceptance. No employer was contacted and no real application was uploaded or submitted.

## Implemented boundaries

- `employment_agency/application_delivery.py`: durable attempts, exact approval bindings, worker, MIME composition, receipts and reconciliation.
- `employment_agency/delivery_connections.py`: Gmail OAuth/Keychain and send connector; isolated Codex fact selection.
- `employment_agency/linkedin_apply.py`: experimental visible Chrome adapter, exact custom file verification and final form comparison.
- `frontend/src/features/applications/apply-for-me.tsx`: connection, tailoring, preparation, verified PDF preview, approval and outcome dialog.
- Existing local service/server/CLI integrate these capabilities. Hosted requests and demo workspaces cannot execute them. Existing manual review remains available.

## Acceptance evidence

| Check | Command or method | Observed result |
| --- | --- | --- |
| Python regression and delivery invariants | `.venv/bin/python -m unittest discover -s tests -v` | 97 tests passed, including 14 delivery tests. |
| Frontend types | `npm --prefix frontend run typecheck` | Passed. |
| Frontend lint | `npm --prefix frontend run lint` | Passed. |
| Frontend unit tests | `npm --prefix frontend test` | 20 tests passed across five files. |
| Production frontend | `npm --prefix frontend run build` | Passed; static export packaged for Python. |
| Existing local and hosted browser workflows | `.venv/bin/python tests/run_browser_checks.py` | All nine checks passed: responsive/accessibility, normal workflow, parity, local editor, workspace, folder settings, hosted workflow, hosted editor and hosted parity. |
| Controlled Apply For Me integration | `.venv/bin/python tests/run_apply_checks.py` | Gmail connector with mocked HTTP/Keychain/OAuth, actual Chrome adapter with loopback forms, and complete interface workflow passed. |
| Installed package | `.venv/bin/python -m pip wheel --no-deps . --wheel-dir /tmp/ea-apply-both-wheel` followed by `.venv/bin/python tests/check_wheel.py /tmp/ea-apply-both-wheel/employment_agency_local-0.6.0-py3-none-any.whl` | Clean installed wheel served assets, generated documents, preserved submitted export/restore, and performed approval-gated recording delivery with the exact PDF; offline demo also passed. This local wheel is not a published replacement for 0.6.0. |
| Live local Codex | Fictional confirmed facts/job through `codex_select`, then full `apply-tailor` service path | Existing ChatGPT-signed-in CLI returned valid fact IDs and generated a new job-specific PDF/Word version; original version preserved. No delivery tools enabled. |
| Whitespace/errors | `git diff --check` | Passed. |
| Private career data preservation | SHA-256 comparison with prior 4,318-file private workspace baseline | Only Finder `.DS_Store` differed; no baseline career document, state, settings or installed pin changed. |

The delivery tests exercise missing/stale approval, changed résumé bytes, job/fact/account/payload changes, duplicated attempts, mandatory custom cover letters even when an old client requests omission, fabricated Codex fact IDs, API-key billing rejection, cancellation, interrupted/unknown outcomes, export/restore, separate browser attempts and disclosure/header validation. No tests require Gmail credentials or a LinkedIn account.

The browser tests verify actual selected file bytes, a stored generic résumé, wrong bytes with the same filename, changed answers, no early submit, final fixture confirmation, resumed submission details, keyboard focus/Escape, wrong-origin and stale-approval rejection. The new dialog passes automated axe checks and overflow checks at 390, 768 and 1440 pixels. Automated accessibility checks do not establish complete accessibility conformance.

Follow-up requirement: both custom PDFs are now mandatory and bound to final approval. The Chrome fixture verifies both uploaded hashes, rejects altered cover-letter bytes and pauses without submitting when no cover upload exists. The interface previews both documents. Gmail recording evidence includes both attachment hashes. No access-restriction bypass was added.

## Bugs found and fixed

- Direct PDF embedding was blocked by existing file response headers. The dialog now fetches the PDF, verifies its bound SHA-256 and previews a browser Blob URL; final approval waits for the verified preview.
- Replacing a staged PDF before submission invalidated Chrome's already-selected File. Staging now preserves the original file and checks its bytes on reuse.
- A later job could reuse an earlier uncertain attempt's browser. Each browser is now bound to its attempt; late close commands cannot close a newer attempt.
- Moving an application to Submitted removed its card and unmounted the receipt dialog. The page now owns the dialog and restores focus to the page if the original opener disappears.
- Workspace switching now closes the previous delivery worker/browser. Cancellation during preparation cannot overwrite its cancelled state.
- Gmail reconnect explicitly requests consent and requires offline refresh credentials; sending checks the connected identity again immediately before delivery.

## Visual evidence

Generated from the real production frontend with fictional Alex Morgan data and controlled transports:

- `output/playwright/apply/review-390.png`
- `output/playwright/apply/review-768.png`
- `output/playwright/apply/review-1440.png`
- `output/playwright/apply/gmail-confirmation.png`
- `output/playwright/apply/linkedin-review.png`
- `output/playwright/apply/linkedin-confirmation.png`

The screenshot receipts explicitly identify fixture data. Evidence is local/ignored by Git; rerun the controlled suite to regenerate it.

## Not verified / not performed

- A real Google Desktop OAuth client has not been connected, and live Gmail acceptance/delivery is untested. The connector's network and credential boundaries are exercised with mocks.
- Actual authenticated LinkedIn Easy Apply feasibility and site variants remain unverified. Controlled lookalike forms prove the adapter's checks, not LinkedIn compatibility. Unsupported or unverifiable controls pause for the user.
- Login, account signup, MFA/CAPTCHA, unknown application answers and site consents remain user tasks. No bypass mechanism is implemented.
- No remote CI run, commit, push, release or deployment was performed. Current work remains local; release requires resolving the live-integration gates and appropriate authorization.

Installation and connection instructions: [local preview guide](../../docs/apply-for-me.md). Open task gates: [todo.md](todo.md).
