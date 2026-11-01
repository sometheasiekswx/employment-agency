# Application queues: verification and readiness

Verified locally on macOS, 2 November 2026. Scope: the queue/status bug, related duplicate-preparation protection and decision-panel polish. This is an uncommitted working-tree change based on `f5c6116`, alongside earlier Apply For Me work. No commit, push, deployment or private installation upgrade was performed.

## Behavior and root cause

The Applications page previously filtered every preserved document version by its own status. An older draft therefore stayed in Active after a sibling version was submitted, and editing created additional queue cards. Counts and destination choices inherited the same problem.

`frontend/src/features/applications/queues.ts` now selects one representative per exact job ID before tab filtering. A submitted snapshot outranks every draft or rejected sibling, including drafts edited after submission. Otherwise the current, newest version is selected. Archived imports do not replace current versions; archived submissions cannot expose their draft siblings as active. Dates are compared as instants, with persisted order as the fallback. Identical titles/employers with different requisition IDs remain separate jobs.

Cards, counts, destinations and empty states use this selection. All original statuses and document versions remain in History; no historical draft is falsely relabelled submitted.

The related backend defect was stale editable `prior_application` metadata: it could permit another preparation or delivery attempt despite a submitted snapshot. `Service.state()` now reports the authoritative effective status without writing state. Job edits preserve that status, preparation rechecks it under the existing workspace lock, and delivery independently checks submitted siblings. Editing an existing document into a new preserved companion version remains available.

## Tests and observed results

| Check | Command / interaction | Result |
| --- | --- | --- |
| Frontend typing | `npm --prefix frontend run typecheck` | Pass |
| Frontend lint | `npm --prefix frontend run lint` | Pass |
| Frontend unit/component regressions | `npm --prefix frontend test` | 30 tests across 7 files passed; 10 cover queue selection/page behavior |
| Production frontend | `npm --prefix frontend run build` | Static Next.js export packaged for Python |
| Backend regression suite | `.venv/bin/python -m unittest discover -s tests -v` | 108 passed, including 8 new submission-authority tests |
| Production browser regression | `.venv/bin/python tests/run_browser_checks.py` | All 10 local/hosted scenarios passed |
| Controlled delivery regression | `.venv/bin/python tests/run_apply_checks.py` | Connector, Chromium adapter and approval/receipt UI passed; mocked Gmail HTTP and controlled forms only |
| Wheel build | `.venv/bin/python -m pip wheel --no-deps . --wheel-dir /tmp/ea-queues-wheel` | Pass |
| Installed-wheel contract | `.venv/bin/python tests/check_wheel.py /tmp/ea-queues-wheel/employment_agency_local-0.6.0-py3-none-any.whl` | Routes/assets, document generation, exact recording-delivery attachments, submitted export/restore and offline demo passed outside checkout |
| Source hygiene | `git diff --check` | Pass |
| Live local workspace | Fresh isolated Chrome context, read-only navigation on port 8766 | Reported duplicate is absent from Active and appears once as its exact submitted version; all canonical and older History versions remain available; no browser errors |
| Private preservation | SHA-256 comparison before/after, excluding Git, runtime caches, local environment and machine files | Every baselined private file unchanged; no additions or removals |

The three page regressions initially reproduced the duplicate/card-count problem before the fix. Older browser expectations that counted document versions as active jobs were replaced with assertions that a save appends a preserved version, retains its parent relationship and replaces the current card. The style expectation now checks the requested blue/green controls. An incorrect History accessible-name locator was repaired and the entire queue acceptance rerun successfully. No checks were suppressed.

The queue fixture covers submission followed by an edit, older drafts/rejections, a new draft after rejection, archived submissions, equal/missing/offset dates, different requisitions with the same employer/title, destination counts, comments and live cross-tab decisions. Mutation tests use disposable fictional workspaces and reject real workspace paths. The private live check performed no preparation, review, upload or delivery action.

## Interface-polish review

Mode: full within the requested application-card/review-panel scope. Stack: React/Next.js, existing plain CSS and semantic colour tokens. Broader product redesign and unrelated screens are outside the polish scope. `make-interfaces-feel-better` guided the spacing/surface work; `frontend-ui-engineering` guided responsive layout and behavior.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Existing review-heading type, rendered headings/comments/buttons at 390, 768, 1024 and 1440px; whole-app 320px and 200% text checks | Existing type retained; header spacing corrected; no overflow |
| Surfaces | Review header, decision buttons, status pills, neutral Save/Apply buttons, keyboard focus, narrow/wide screenshots and axe checks | Consistent semantic colours and shared neutral tokens; no remaining findings |
| Animations | Existing explicit colour transitions, press state and reduced-motion CSS; browser proximity/reduced-motion regression | Existing behavior retained; no animation added; 10%-speed replay not performed because motion was not changed |
| Icons | Existing shared icon usage and dock hit-target stability in source/screenshots/browser regression | No icon changes needed |
| Performance | Linear queue selection, shared derived selection, CSS selectors, dependencies and production build | No new dependencies, assets or per-card animation work |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `frontend/src/features/applications/application-card.tsx:126`; `frontend/src/app/globals.css:563` | Heading and Apply action relied on unrelated block spacing; generic action sizing could stretch the header button | Dedicated wrapping flex header, centred alignment, 12px row/16px column gaps and intrinsic button width | Deliberate grouping and separation keep the action aligned at narrow and wide widths |
| MEDIUM | `frontend/src/app/globals.css:259`, `:591`, `:595` | Reviewed was green; Submitted was neutral with a blue tag | Reviewed uses exact sky blue with dark text and a blue tag; Submitted uses green with white text and a green tag; Reject remains red | Consistent semantic colour mapping meets the user's requested meanings and retains readable contrast |
| LOW | `frontend/src/app/globals.css:587` | Neutral review actions used a separate hard-coded background/text pair | Save and Apply actions use the existing secondary/ink tokens | Reusing shared surfaces removes an adjacent inconsistency |

Considered but rejected:

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Decision buttons | White text on the exact sky-blue fill | Insufficient normal-text contrast; the existing dark ink is readable and automated contrast checks pass |
| Review panel | Add entrance/decision animations | Frequent review actions benefit from the existing restrained press/focus feedback; extra motion is outside the spacing fix |
| Application queues | Mark old drafts submitted or delete them | They were not submitted; altering history would misrepresent preserved versions and risk document loss |

Verification: reviewed rendered cards at four widths, inspected heading/button geometry, ran WCAG 2 A/AA and 2.1 A/AA axe checks at those widths, and exercised keyboard focus, Reviewed, Reject, Return to Active, Submitted and Save comment. The broader browser suite checks route navigation, loading/error/retry/empty states, reduced motion, editor saves and folder switching. Screenshot evidence uses fictional data only.

Verdict: **Approve for the requested local change.** No actionable findings remain. A separate read-only reviewer independently passed the 10 frontend queue/page tests and 8 backend authority tests, inspected all four responsive card screenshots, and found no product defects. The review's browser-locator finding was fixed and rerun.

## Local evidence

Generated, Git-ignored screenshots:

- [Desktop review panel](../../output/playwright/queues/review-1440.png)
- [Mobile review panel](../../output/playwright/queues/review-390.png)
- [768px review panel](../../output/playwright/queues/review-768.png)
- [1024px review panel](../../output/playwright/queues/review-1024.png)
- [Active queue fixture](../../output/playwright/queues/active.png)
- [Submitted queue fixture](../../output/playwright/queues/submitted.png)

The fictional fixture deliberately includes a separate requisition with an identical employer/title to prove those distinct jobs remain distinct. Screenshot names are generated by `tests/queues-browser.cjs`; rerun the browser suite to recreate them.

Run logs are local `/tmp/ea-queues-*.log`; read-only live-workspace proof is `/tmp/ea-queues-live-proof.log`, and file-preservation proof is `/tmp/ea-queues-private-preservation.json`. Private data is not included in the fixture, screenshots or this report.

## Readiness and recovery

The exported frontend and current Python source are running locally on port 8766. Reload the page to use them. The pinned private installation and package version are unchanged. The test wheel is a temporary verification artifact, not a republished 0.6.0 release.

This change requires no schema migration or private state rewrite. Recovery is to restore the prior application build and restart the local server; preserved career files and version manifests require no conversion. Do not reset the working tree: earlier feature work is also uncommitted.

Not verified: remote CI on Linux/Windows, any deployment target, live Gmail delivery or live employer submission. Those are outside this bug fix. The current request was completed locally; publication/deployment and a new release version are separate actions.
