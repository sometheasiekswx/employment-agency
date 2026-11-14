# Implementation plan: simpler application journey

Accepted specification: [spec.md](spec.md). Task status: [todo.md](todo.md). Authorization policy: [ADR 0016](../../docs/adr/0016-authorize-role-submission-when-starting-agent.md).

Prepared on 14 November 2026. This plan covers implementation and verification of the accepted design; the current task creates planning documents only. No application code, private records, installed build or external application is changed by this planning stage.

## Approach

Keep one responsive role workspace and the existing Python service. Deliver the CV-first journey, employer exceptions, deferred agent queue, manual submission and connected execution as complete, testable slices. Prove the uncertain agent/tool boundary early, before treating the execution button as a deliverable. UI work can continue if that proof encounters a technical dependency; real execution remains a required, incomplete capability until proved.

Use the existing React/Next.js static export, controls, API client, PDF.js reader, document editor and immutable document store. Keep server-owned state and validation in `employment_agency`; retain the single-writer workspace boundary. No private UI fork, separate Node production service, new job scheduler or general-purpose agent platform is needed.

Implementation starts from the current shared checkout, preserving its unrelated changes. In particular, listing-link/discovery work already touches `discover-page.tsx`, `opportunity-inspector.tsx`, `application-card.tsx`, API transport, browser checks and the glossary. Recheck Git state before edits; use that work as the baseline instead of replacing it with an older committed version. Preserve the accepted spec and decisions.

### Implementation facts that shape the plan

| Observed boundary | Consequence |
| --- | --- |
| `local-package` returns a new application version; Discover currently discards that return value and refreshes the overview. | Open the returned version directly, with workspace/job response guards. Do not infer the new version from an unrelated later refresh. |
| `editor.load` returns original PDF bytes but also parses editable sources. Existing file routes already verify canonical files. | Provide a reading path using verified PDF bytes and reuse the reader; an invalid Word/LaTeX companion must not prevent viewing a valid CV. Keep Edit explicit. |
| `application_queue.project` skips roles without a version, bookmark or removal. Its stage is exclusive. | Store agent intention separately and derive an indexed pending-agent view that includes an unprepared, unbookmarked role without changing existing stage meanings. |
| `companies.map_job` accepts a confirmed relationship and trusted source boards can already link jobs. Per-link actor/source provenance is incomplete. | Extend the existing identity operations with evidence/provenance. Do not create a parallel employer registry or claim historical mappings were agent-verified. |
| Manual handoff binds `job.url` as its HTTPS destination. The listing and actual submission channel can differ. | Keep `job.url` as the original listing. Normalize a separate verified destination for website, Telegram or email attempts. |
| Delivery currently supports Gmail/LinkedIn, requires `apply-approve`, and uses exact document/payload bindings. Some bindings hash the complete job object. | Introduce explicit start-time authority while retaining material-change checks. Queue/reading metadata must not invalidate an otherwise unchanged application or weaken listing/fact validation. |
| `companies.HELD` currently contains `executing`, `unknown`, `handed_off`. | New reserved/execution states must participate in the same allowance and duplicate-vacancy calculations before any employer-facing disclosure. |
| `Workspace.edit()` updates SQLite, derived queues/company rounds and the readable snapshot. Restore creates a fresh workspace identity and clears provider consents. | Use that persistence path for intentions, answers, run audit and receipts; restored audit records must not become live execution permission. |
| The hosted service uses an explicit action allowlist; the demo has its own transport. | Apply the reading improvements to existing modes, and keep local-only queue/execution operations unavailable where unsupported. Hiding a button alone is insufficient enforcement. |

Sources: [service](../../employment_agency/service.py), [editor](../../employment_agency/editor.py), [queue](../../employment_agency/application_queue.py), [company handoff](../../employment_agency/company_handoff.py), [delivery](../../employment_agency/application_delivery.py), [SQLite](../../employment_agency/sqlite_workspace.py), [workspace store](../../employment_agency/store.py), [hosted operation allowlist](../../employment_agency/cloud.py).

### Integration choice and alternatives

Use a service-owned local Codex app-server connection over stdio as the first implementation candidate. It fits the existing Python process and interactive progress/help requirements without adding a production Node dependency. The [official app-server interface](https://learn.chatgpt.com/docs/app-server) supports conversations, events and approval requests; its exact installed protocol and tool capabilities still need AJ-01's executable proof. Keep its experimental/version-specific parts inside one small adapter.

The current `codex_select` subprocess is intentionally a fact selector with tools disabled. Retain its existing contract. A longer prompt in that subprocess cannot supply a submission tool or durable lifecycle. The TypeScript SDK remains an alternative if the app-server proof establishes a concrete compatibility problem; adding a Node runtime solely to start a process is not the default. Creating a chat or copying a prompt is the deferred handoff path and cannot satisfy connected execution.

Prefer existing authorized connectors and installed browser tooling where they fit. The application must be able to enforce role/destination/document scope around external effects. Do not inherit this desktop chat's tools, turn on arbitrary shell access, scrape credentials, or remove the old approval guard globally to make the proof pass. If usable tools or permissions are absent, report the specific dependency; do not install or configure a provider as an automatic fallback.

## Shared contracts

Names below are planned internal/API names, not claims that endpoints already exist. Keep them behind the existing protected action transport and CLI so UI and agents use the same validators.

| Contract | Planned responsibility |
| --- | --- |
| Verified document read | Resolve application ID, document role and original bytes through the existing local/hosted/demo transport. The UI consumes bytes without loading an editable source or changing review state. |
| `application-context` | Read exact selected jobs, profile, chosen/current versions, facts, scoped answers, employer/vacancy identity, verified destinations, allowance and existing attempts. Return structured blockers and data provenance. Revalidate at execution; this read grants no authority. |
| `agent-queue-mark` / `agent-queue` | Persist or clear role intention and read a paginated pending queue. No drafting, reservation, disclosure or agent launch. Use a separate `agent_intents` record collection and a derived queue index; do not reuse `saved` or invent a submission status. |
| `application-handoff` | Return concise copyable instructions containing the exact workspace/role references and the operation used to read fresh context. Include the absence of submission authority. Provide selectable text when clipboard access fails. |
| `self-application-start` | Validate and reserve the exact selected version/destination within one user action, returning an idempotent handoff. Reuse company submission checks and outcome recording. |
| `agent-capabilities` | Report local runtime, account/tool access and supported channels with actionable availability reasons. A status read must not start a worker, reconcile old attempts or disclose credentials. |
| `agent-application-start/status/answer/resume/stop` | Capture a fixed role selection and start-time authority; operate a durable local run; surface progress/help; enforce stop and recovery. Use a client request key to recover a lost start response without dispatching again. |
| Channel operations | Inspect/fill/upload/submit and return structured channel evidence through scoped service tools. Bind exact payloads before external effects and resolve through the existing submission authority. Agent-generated prose cannot be a success receipt. |

Store a durable `agent_runs` audit separately from immutable application versions and channel-specific `submission_attempts`. A run can prepare documents and require help before it has an external attempt. Queue intention, document review, run progress, authorization and a submitted outcome remain distinct. Capture the user-authorized selection once; new queue entries never join a running request.

Reuse confirmed facts for known candidate information. Add scoped application-answer records only for form answers the existing fact model cannot represent adequately, including the question/field, value, applicability, provenance and confirmation time. A reply applies to its question/role by default; broader reuse requires established scope. Do not import arbitrary activity comments as verified answers or publish personal answer fixtures.

Use backend-owned authorization records and run-scoped capabilities rather than an agent-supplied `approved: true`. The runner may ask the service to advance the authorized work; it cannot create authority for extra roles or change its allowed destinations. Keep executable permits and session material machine-local. Portable records retain audit/evidence, while fresh workspace identities and restored runs require explicit resumption and current access checks.

## Ordered slices

### AJ-01 — Prove a constrained connected-agent run

**Outcome:** an executable integration spike demonstrates that the installed local Codex runtime can receive the application context, use the required tools and report progress/help/outcomes within a role's start-time authority.

**Dependencies:** accepted spec and ADR 0016. This is the first risk checkpoint; it is not a general tooling installation task.

**Likely areas:** existing `delivery_connections.py`, `application_delivery.py`, `tests/apply_fixture.py`, `tests/check_delivery_connections.py`; a small new Codex protocol adapter and a controlled protocol test harness. Record the result in a future `verification.md` in this feature folder.

**Acceptance:** verify the installed app-server schema/version and account mode; run a fictional application using a controlled loopback form and recording Telegram/email tools. Demonstrate context transfer, a tool response, help request/reply, interruption and a structured result. Prove that the agent cannot reach a different role/destination, submit without the captured start authority, or bypass the service through unrestricted tools. Inventory actual browser, Telegram and email access independently of mocked transports; distinguish available, missing and unverified capabilities. Keep ordinary CI independent of a live Codex account. No employer contact, new paid provider or credentials in artifacts.

**Verification:** a planned `test_agent_protocol.py` covers handshake/event ordering, malformed messages, disconnected runtime, access denial, usage exhaustion and attempted scope escape using a fake protocol peer. Separately run an actual installed Codex turn against the controlled fixture during implementation and record the returned tool calls and outcome. Document a concrete unavailable capability instead of claiming that protocol success proves live sending.

**Recovery:** disconnect/terminate the fixture runner and retain no live execution authority. If the proof fails, complete independent base-journey slices while keeping AJ-01 and connected execution open; never replace them with a misleading CTA.

### AJ-02 — Deliver one role workspace with the CV first

**Outcome:** users prepare a draft and immediately read its CV, with one persistent listing link and an obvious next action on desktop and mobile.

**Dependencies:** none beyond the accepted spec. Start AJ-01's investigation first; this slice can proceed independently of a missing connection.

**Likely areas:** `discover-page.tsx`, `opportunity-inspector.tsx`, `opportunity-workbench.tsx`, `opportunity-application.tsx`, `application-card.tsx`, `editor-pdf-preview.tsx`, document/file transport, URL helpers and their existing tests. Reuse `OpportunityListingLink` and the current external-link policy. Keep editor behavior in its existing component.

**Acceptance:** navigate to the exact `local-package` result; reject stale responses after a role/workspace change. Reopening reads the existing effective version. CV reading, Download and Edit are distinct, with cover letter/files/activity/version history secondary. Keep **View job listing** in the same header across states. Preserve direct older-version links, original submitted bytes, unsaved input, Back/focus/scroll and responsive sheet behavior. Provide preview loading/error/download and unavailable-listing states. Extend the transport with a verified-byte read that retains workspace-generation checks; its current `binary()` method starts a download and should not be repurposed silently. Remove the old preparation-only **Apply For Me** entry; retain access to old submission receipts. A mocked or unavailable executor never displays a working execution action.

**Verification:** update existing Discover, OpportunityApplication, ApplicationCard, editor and source-link tests around observable behavior rather than old tab structure. Use the built frontend with fictional fixtures for prepare → automatic CV → other document → activity → listing → return, plus direct submitted/history links. Capture an early representative render at desktop and mobile sizes for the user; refine within the accepted hierarchy without reopening settled product decisions.

**Recovery:** keep existing routes and version identifiers as compatibility inputs; no document/state migration is needed for presentation changes.

### AJ-03 — Resolve employers and provide complete application context

**Outcome:** verified research presents resolved employers; remaining uncertainties become specific inline exceptions, and an authorized agent can retrieve the same current application context as the UI.

**Dependencies:** AJ-01's contract investigation; AJ-02 for the inline user path. Existing fact/destination rules remain usable if runtime access is still blocked.

**Likely areas:** `companies.py`, `discovery.py`, `service.py`, `providers.py` callers, `CompanyReview`, API models, workspace record validation and `docs/agents.md`. New context/answer helpers should be small domain modules, not more rendering logic in the service dispatcher.

**Acceptance:** reuse trusted source ownership and verified aliases/requisitions before asking the user. Store source evidence, actor and verification time for new links; preserve unknown history. Never merge recruiter clients by a similar name. Expose unresolved identity, uncertain submission dates, exhausted allowance and changed listing/facts as typed blockers that resume the user's intended action when resolved. CV preparation remains available under its existing matching constraints. The context includes exact role IDs, original listing, distinct verified application destination(s), current version/files, applicable confirmed facts/answers, policy and past attempts. Preserve reference minimization and private salary boundaries. Start-time submission authority does not confirm new career claims or accept an unresolved master reconciliation. Keep the original fact-selection `handoff` contract unchanged.

**Verification:** extend `test_company_cooldown.py`, `test_company_avoid.py`, `test_job_discovery.py` and add a focused context contract test. Cover trusted board mappings, unknown recruiter clients, conflicting identity evidence, reused requisitions, answer applicability, missing/retired facts, fresh allowance after a concurrent submission and no repeated prompt for an already verified employer. Browser-test an unresolved case and its successful continuation. Test that a context read causes no preparation, reservation or disclosure.

**Recovery:** new optional provenance/answer records have empty defaults; do not rewrite historical documents or backfill invented evidence. Validate preservation through export/restore when these records are introduced.

### AJ-04 — Deliver the persistent agent queue and external handoff

**Outcome:** mark a role before or after drafting, find it under **For my agent**, select exact roles and copy one useful handoff.

**Dependencies:** AJ-02 and AJ-03.

**Likely areas:** `service.py`, `application_queue.py`, `sqlite_workspace.py`, API models, Discover queue/filter and role actions, `public-preview.ts` capability handling, `docs/agents.md`; focused queue/UI tests.

**Acceptance:** store independent `agent_intents`; derive an indexed agent queue without changing Saved/Active/Submitted/Removed semantics. Include roles with no bookmark or draft. Keep selection stable across refresh/pagination; show empty/loading/error/retry states. Role updates and regenerated documents preserve intention. Submitted/removed roles cease to be pending while history survives. Copy includes exact identifiers and how to fetch live context, excludes credentials/tokens/unrelated personal data, and has clipboard-denied fallback. Neither marking, reading nor copying starts work or consumes a slot. The connected start entry remains capability-gated until AJ-06.

**Verification:** new `test_agent_queue.py` plus existing `test_sqlite_followups.py` for pagination, counts, corrections, removal/restore and unchanged ordinary queues. Add frontend behavior tests for mark/unmark failure, role without a draft, multi-selection, stale workspace responses and copy fallback. Round-trip ZIP and Git snapshot restore with queued roles and verify no worker launches. Query tests must retain the existing rule that listing queues do not hash every application document.

**Recovery:** add the next available SQLite migration for the derived agent index (current database version is 5; recheck numbering before implementation). Keep canonical intention in generic records so the index can be rebuilt. Test transactional migration failure and source-backup preservation. Never run a new schema through an older installed binary as a rollback strategy.

### AJ-05 — Complete the self-apply journey in the role workspace

**Outcome:** Prepare → CV → **Open application site** → **I've applied** works without a separate review-status or reservation screen.

**Dependencies:** AJ-02 and AJ-03. It is independent of connected-agent tool availability and can be verified before AJ-04 finishes.

**Likely areas:** `company_handoff.py`, shared submission validation, `service.py`, `CompanySubmission`, application actions/status/history, current `review`/correction handling and browser fixtures.

**Acceptance:** one protected start operation validates the selected version, verified destination and live allowance and creates/reuses a reservation with a request key. It does not send anything. The header's listing link remains read-only. Handle browser popup restrictions with an accessible continuation link without discarding the reservation or falsely recording completion. Show one short completion form with known channel/destination filled in, actual submission time and evidence. Preserve input on error and link a document version only where established. Allow verified-not-sent resolution; an uncertain outcome holds its slot. Preserve receipt/history access, submission corrections and follow-up documents on already-submitted roles.

**Verification:** extend `test_company_cooldown.py`, `test_submission_authority.py`, `test_action_recovery.py` and OpportunityApplication tests. Check double clicks, lost start responses, a stale version/destination, concurrent last-slot use, popup denial, cancel/return, manual report versus channel receipt, unknown file association and failure after retaining evidence but before finalizing state. Add this complete path to the disposable SQLite browser fixture; confirm Submitted and compare document bytes.

**Recovery:** retain existing manual operations for older callers; adapt the UI to the combined operation. Do not globally auto-approve legacy delivery attempts or reinterpret old Reviewed status as submission authority.

### AJ-06 — Deliver connected website application with durable progress

**Outcome:** starting **Apply for me** actually prepares and applies to a selected role through a verified website path, while the user can leave and return to progress/help.

**Dependencies:** AJ-01 must pass for the chosen runtime/tool boundary; AJ-02–AJ-05 supply the workspace, context, selection and recording contracts.

**Likely areas:** new local runner/protocol and authorization helpers; `service.py`, `application_delivery.py`, `companies.py`, `server.py` worker/reload/workspace-switch lifecycle; connection settings, role progress/help and queue start UI. Reuse document validation and browser primitives where they fit rather than stretching a LinkedIn-only adapter into a claim of universal support.

**Acceptance:** preflight the fixed selected roles and resolve competing company slots before starting; never silently choose which role wins. Persist the start authority and run before returning success. Generate a required new version or use the selected intact version, prepare with confirmed facts, resolve known answers and operate a scoped browser session. Bind the exact destination, documents and answers and reserve a slot before the first employer-facing disclosure. Every external tool action must remain within that authority; material changes outside it require help. There is no routine final approval screen. Provide inline help/reply, Stop, current progress and capability errors. Sign-in/verification and unsupported forms stay explicit. Preserve required CV/cover-letter rules and detect a stored/default résumé overriding the intended upload.

The worker continues with the tab closed. Keep network/model/browser work outside SQLite transactions, and use short transactions for reservation, dispatch and result transitions. Extend the central held-state calculation and duplicate checks for the new reserved states. Use run-specific capabilities, not a general workspace token in the model prompt. Preserve legacy `awaiting_approval` attempts under their original contract. Block workspace switching/reload while external work is active and retain request/response generation checks.

**Verification:** planned `test_agent_execution.py` and controlled browser cases cover a one-step and multi-step site, known/unknown answers, original versus wrong stored CV, changed form/destination, malicious page instructions, concurrent starts, lost response, closed tab, user Stop, crash before/after dispatch, exhausted usage, and reconnection. Assert one external attempt and one receipt-linked Submitted record. Restore or clone an in-progress workspace and assert no execution starts. Retain all existing delivery tampering, correction and uncertain-outcome assertions; replace obsolete final-prompt assertions only for new start-authorized runs.

**Recovery:** a checkpoint known to precede disclosure can offer Resume; possible external effects become uncertain and cannot resend until reconciled. Restored workspaces preserve audit but get no inherited executable permission. Disable the runner to return to self-apply/handoff while retaining runs and receipts. Removal/unmark is distinct from Stop.

### AJ-07 — Complete verified Telegram/email fallback and reconciliation

**Outcome:** the agent follows website → verified Telegram → verified recruitment email, respecting role-specific instructions and preserving one vacancy's submission history across channels.

**Dependencies:** AJ-06 and AJ-01's channel capability evidence.

**Likely areas:** scoped channel adapters, `delivery_connections.py`, destination verification/context, central attempt/result handling, existing apply fixtures and new recording Telegram cases.

**Acceptance:** use the existing Gmail transport when the intended account is connected; do not assume a desktop-chat mailbox connection is the app's connection. For Telegram, use the permitted capability established in AJ-01 (an available authorized connector or an isolated visible web session with user-managed sign-in); a bot is not a substitute for the user's identity. Verify recipient and channel against trusted source evidence, bind the exact message and attachments, and preserve provider/site evidence. A successful channel stops the fallback sequence. Verified unavailability or confirmed no-submission can advance to a permitted fallback; an uncertain result cannot. Release/transfer reservations through shared operations and deduplicate by vacancy across channels. If no authorized path is available, show a specific help request and retain context.

**Verification:** planned `test_agent_channels.py` plus `check_delivery_connections.py` and controlled browser fixtures exercise exact attachment bytes, wrong sender/recipient, Telegram identity mismatch, unavailable tools, verified website failure followed by Telegram/email, successful website with no extra messages, ambiguous channel result with zero fallback sends, receipt-save failure and later reconciliation. Inventory real connection readiness separately. Any future live smoke test uses an explicitly authorized user-controlled destination; fixture results never establish real-provider success.

**Recovery:** disable an unavailable channel without deleting its history or trying another after an uncertain effect. Keep confirmed delivery separate from employer acceptance. All three channel contracts and their availability/failure paths are part of feature acceptance; an email-only success cannot close this slice.

### AJ-08 — Verify compatibility and prepare the release candidate

**Outcome:** the complete accepted journey is verified in source and an isolated installed wheel, with recovery instructions and honest execution capability evidence.

**Dependencies:** AJ-01–AJ-07 and their evidence.

**Likely areas:** production-export browser runners, `check_wheel.py`, public-demo/hosted parity, CI inclusion of the new controlled tests, contributor/agent/apply guides, this feature's future `verification.md`. Update previous preview documentation to distinguish preserved legacy attempts from the new authority model.

**Acceptance:** cover every accepted spec path, original document hashes, queue/version precedence, migrations, ZIP and Git-snapshot restore, expired permissions, receipt-only reconciliation and no restored-job replay. Ordinary local/hosted/demo reading and drafting remain usable; demo/hosted cannot dispatch local-only actions. Existing CI quality bars remain in force. Record the early and final rendered desktop/mobile flow, keyboard/focus, Back, unsaved edits, reduced motion, long titles and 200% text. Identify physical-device or real-provider checks that remain unavailable instead of calling them passed. Real execution must have an actual installed-runtime controlled proof in addition to mocked CI results.

**Verification:** run the relevant commands below, build a complete wheel after the frontend, and use `check_wheel.py --browser` against the candidate outside the checkout. Extend the installed-wheel fixture to verify direct CV reading, pending agent roles, old receipts and disabled/missing runtime behavior, not just source TSX. A private-workspace cutover is a separately authorized delivery action after candidate backup/restore and migration checks.

**Recovery:** keep the previous wheel and a verified pre-upgrade export. Never downgrade the migrated database in place. Restore into a separate folder, reconcile submissions made since the backup, and preserve newer receipts before switching. No commit, main-branch push, public deployment or installed-build upgrade is performed by this planning task or automatically by completing a build.

## Verification commands and evidence checkpoints

Coverage of the accepted spec's numbered requirements:

| Spec requirements | Responsible slices |
| --- | --- |
| 1–3: role workspace, persistent listing, CV priority | AJ-02; installed behavior in AJ-08 |
| 4 and 10: deferred agent marking, selection and handoff | AJ-04 |
| 5 and 7: truthful execution action and actual connected capability | AJ-01, AJ-02, AJ-06, AJ-07 |
| 6: employer research and exceptional user questions | AJ-03 |
| 8 and 12: start-time authority, background progress and recovery | AJ-06 |
| 9: website, Telegram and email preference | AJ-07 |
| 11: self-apply completion | AJ-05 |
| Cross-cutting data, compatibility and release evidence | Each slice; final AJ-08 checkpoint |

Commands below were discovered from the repository and are planned checks, **not results from this planning task**. Run from the shared app root using its existing environment. New test files named in tasks are planned additions.

Focused tests use the existing runners; for example:

```sh
npm --prefix frontend test -- src/features/applications/opportunity-application.test.tsx src/features/discover/discover-page.test.tsx
.venv/bin/python -m unittest discover -s tests -p 'test_company_cooldown.py' -v
.venv/bin/python -m unittest discover -s tests -p 'test_sqlite_followups.py' -v
.venv/bin/python -m unittest discover -s tests -p 'test_application_delivery.py' -v
```

At integration/package checkpoints, run the applicable full sets once for the current implementation:

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/run_browser_checks.py
.venv/bin/python tests/run_apply_checks.py
npm --prefix frontend run build:preview
.venv/bin/python tests/run_public_preview_checks.py
.venv/bin/python -m pip wheel --no-deps . --wheel-dir dist
.venv/bin/python tests/check_wheel.py --browser PATH_TO_COMPLETE_WHEEL
```

The normal frontend build must precede wheel packaging; public preview builds use their separate output. Verify the exact candidate path and fresh packaged assets. Existing [.github/workflows/check.yml](../../.github/workflows/check.yml) additionally owns dependency audit, public-release-script checks, Python 3.13/Node 24 across Linux/macOS/Windows, Linux hosted-install/development checks, browser assets and wheel verification. Follow that contract without inventing coverage percentages or bypassing failing assertions. Browser coverage follows [CONTRIBUTING.md](../../CONTRIBUTING.md) and the current viewport matrix, including 320/390/768/1024/1440 and relevant breakpoint boundaries. [Design contract](../../DESIGN.md)

Record evidence by task in one `verification.md` when implementation begins: command and result, fixture/runtime version, key screenshots or returned IDs, remaining limitations and unchanged submitted-file hashes. Keep real personal data out of source fixtures and `output/playwright/`. Completing a checkbox in [todo.md](todo.md) requires the corresponding evidence; a planned command or a mocked channel is not live-integration proof.

## Risks, unresolved technical dependencies and recovery

| Risk/dependency | Deciding evidence and handling |
| --- | --- |
| Installed Codex protocol/tool access differs from documentation or lacks required tools. | AJ-01 validates the actual schema, events, account and tool boundary. Record missing capabilities; do not claim a generic installed CLI can send. The [official SDK guidance](https://learn.chatgpt.com/docs/codex-sdk) informs alternatives, not availability. |
| Website and Telegram forms/session access vary; a site may reject automation. | AJ-01/AJ-06/AJ-07 establish supported paths from actual capabilities and controlled forms. Unsupported/access-denied paths pause or use a verified authorized fallback; no universal-site guarantee or access-control bypass. |
| Start authorization accidentally turns existing drafts, queue marks or restored records into executable authority. | Negative authorization tests, fixed selection, explicit run scope, fresh workspace identity and machine-local permits; no legacy attempt upgrade. |
| New queue/answer/provenance metadata invalidates complete-job fingerprints. | Define a versioned material application binding; retain relevant listing, facts, documents, recipient and answer checks while excluding unrelated queue/view metadata. Preserve old attempt fingerprints under their original schema. |
| Missing atomicity between an external success and local state. | Persist dispatch intent, preserve channel receipt, distinguish unknown and record-reconciliation states, and retry only the local recording step after confirmed delivery. |
| Queue schema/state export drifts or a backup causes duplicate execution. | Generic canonical records plus rebuildable index, migration/restore tests, no restore-time runner start, no inherited live capability. Preserve evidence even when execution is disabled. |
| Overlapping uncommitted source-link/discovery work. | Inspect current diffs and keep existing changes. Reconcile affected components/tests intentionally; never reset generated or source work to get a clean baseline. |
| A push unintentionally publishes a UI candidate or a local upgrade changes the private workspace. | Main pushes trigger public-demo deployment in current CI. Keep delivery separate; review the exact release target, previous build and backup before any separately authorized ship/cutover. |

No product decisions remain open and no further design approval is needed to write the implementation tasks. The next technical decision is AJ-01's verified runtime/channel interface. Implementation itself has not been requested in this planning turn; hand this plan and its task list to the build stage when authorized.
