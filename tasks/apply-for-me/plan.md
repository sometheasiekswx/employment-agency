# Implementation plan: Apply For Me

Status: local preview implemented and tested. The user authorized build/test after accepting the plan. Controlled Gmail and browser integrations pass; live Gmail OAuth/delivery and authenticated LinkedIn feasibility remain unverified. This run does not publish a release or perform an employer action. See [verification.md](verification.md) and [todo.md](todo.md).

Spec: [spec.md](spec.md)
Task list: [todo.md](todo.md)

## Approach

Build a bounded external-action capability on the existing validated document services. Email provides the smallest complete path; a supported website adds browser state, uploads, dynamic questions, registration and verification. Reuse existing documents, review UI conventions, canonical manifests and protected service APIs. Do not add submission effects to the existing manual `review` operation.

Validate integration access before selecting provider/runtime libraries. For the confirmed local Mac first release, compare a local executor bridge and service-owned local worker. Hosted execution is deferred; it would add worker lifecycle, per-user credential/session isolation, cost and deployment responsibilities; the current hosted request handler is not an established durable browser runner. Choose one adapter from actual target forms rather than promising universal automation.

## Ordered slices

### A1 — Resolve scope and authorization contract

Dependencies: interview answers. Outcome: approved feature boundaries and glossary terms; ADR only for consequential agreed architectural choices. Acceptance: local/hosted, channel, exact meaning of Apply For Me, registration boundaries, unknown-answer handling and execution/runtime choices are explicit. Areas: feature spec, PRODUCT/GLOSSARY and relevant ADRs after agreement. Verify: scenario walkthrough for normal send, new-account site, missing work rights and uncertain outcome. Recovery: keep current draft-only behavior until execution is deliberately enabled.

### A2 — Prove access to one execution channel

Dependencies: A1. Outcome: a fake/controlled integration proves authentication, payload/attachment handling, send/submit response and recovery information. For LinkedIn, validate a visible-browser adapter against controlled Easy Apply-like fixtures first, then inspect a user-selected live form without submitting, only when implementation/testing is explicitly authorized. Document provider restrictions and prove session/tool access without anti-detection or verification bypass. Do not treat employer/partner-only APIs as available. Use a user-controlled fixture for final submission tests; any genuine application remains a separately approved action. Signup and verification are user-completed. Areas: proposed connector/runtime boundary, test fixtures, integration notes. Acceptance: no employer-only API assumption, no implicit access to the current chat's tools, explicit permissions and bounded costs. Verify: user-controlled test destination/sandbox only with separate authorization; no genuine job application. Evidence decides provider and worker choices before expansion.

### A3 — Durable attempt and approval workflow

Dependencies: A1, A2. Outcome: request/review/authorize/execute/result lifecycle with cancellation and resume. Areas: shared service, workspace records, protected APIs, React application actions/history, recovery/export. Acceptance: approval binds exact job/version/destination/answers; duplicate attempts are blocked; timeout after possible external effect stays unknown; manual Submitted remains distinct and intact. Verify: unit/HTTP/browser crash and double-click cases, tampered payload, expired session, changed documents, unknown receipt; backup/restore excludes secrets and never replays an external action.

### A4 — Complete one email application end to end

Dependencies: A2, A3; selected mail channel. Outcome: Apply For Me prepares exact mail and attachments, obtains the chosen authorization, sends through the connected mailbox and records provider evidence. Areas: mail connector, app review/progress, MIME packaging integration, tests. Acceptance: sender/To/Cc/Bcc/subject/body/attachments reviewed; provider acceptance is not called employer acceptance; ambiguous send not retried blindly. Verify: fake transport success/failure/timeout and revoked permission; optional authorized controlled-mailbox smoke test. Disable connector to recover; preserve receipts and existing document versions.

### A5 — Experimental LinkedIn Easy Apply path

Dependencies: A2/A3 and successful browser capability proof. Outcome: experimental visible-browser LinkedIn Easy Apply automation using the user's signed-in session, filled from verified answers and uploading a custom résumé tailored to each listing, followed by the agreed exact final approval. Signup/verification remain user-completed. Limit the supported form shapes explicitly; unsupported sites, external redirects, changed forms and account/access restrictions pause for the user. No stealth, CAPTCHA defeat or access-control workaround is part of the plan. Do not advertise the feature as supported by LinkedIn or universally reliable. Areas: browser executor/adapter, session store, progress/handoff UI, site fixtures. Acceptance: select an intact résumé version belonging to this job or generate/review a new tailored version through the existing services. Final approval binds job/version/path/local hash and shows the document preview and filename. Verify the selected upload rather than silently using a stored profile résumé; missing/mismatched/unverifiable selection pauses. Document changes invalidate approval. Record the local hash and site evidence without implying the employer verified the hash. Unknown required questions stop, page instructions cannot expand permissions, changed forms stop safely, final confirmation follows agreed policy. Verify: fixture variants for account already present, user-completed signup, MFA/CAPTCHA, required unanswered fields, upload failure, a stored generic résumé overriding selection, wrong-job attachment, changed document after approval, unverified selection, closed posting, success and ambiguous submission. Recovery: hand off to user; do not restart the full application automatically.

### A6 — Package and release the bounded capability

Dependencies: completed selected channel slices and their evidence. Outcome: documented installation/connect/disconnect behavior, supported-site list, compatibility, deployment and real observed acceptance. Areas: README/agent guide, packaging, optional runtime setup, CI and release runbook. Acceptance: current workflows pass; secrets excluded; feature can be disabled; unsupported channels labelled; no real application during automated tests. Verify: Python/frontend/browser/wheel suites plus separately authorized controlled integration smoke test. Preserve previous build and workspace backup; account/mail actions already performed remain outside software rollback.

## Difficulty and risk

Planning assessment, not a delivery quote: email is moderate; experimental LinkedIn browser execution is high-risk and high-effort because site changes and account/access restrictions can defeat it independently of code quality; broad arbitrary-site coverage is very high and requires continuing adapter maintenance. Most uncertainty lies in real site variation, registration/verification, runtime integration, authenticating as the user, and safely reconciling an ambiguous external result. Exact schedule and costs require A1/A2; no estimate assumes that agents remove integration/testing work.

## Evidence checkpoints

A1: approved scenario/permission matrix. A2: executable fixture proof and current provider restrictions. A3: duplicate/unknown-result/restart evidence. A4/A5: controlled end-to-end receipts without real employers. A6: regression and installed-build evidence. Actual commands/results are recorded in [verification.md](verification.md). No real employer submission occurred. A2/A5 live integration gates and A6 release remain open.
