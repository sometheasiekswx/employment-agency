# Spec: Apply For Me

Status: implemented local preview, 31 October 2026. Build/test is authorized; real employer actions and release are outside this implementation run. Gmail delivery and the experimental LinkedIn adapter pass controlled integration tests. Live Gmail OAuth/delivery and an authenticated LinkedIn form still require separate validation. See [verification.md](verification.md) for evidence and [setup](../../docs/apply-for-me.md) for supported behavior.

## Outcome and users

Let a user request an application for a selected job, use their confirmed career evidence and preserved documents, complete the required email or supported website workflow, and retain evidence of the outcome. This extends the current preparation/review product into external actions. The initial execution audience is the local Mac user; hosted execution is outside the first version.

## Baseline before this implementation

- React/Next.js static frontend, shared Python services, loopback server and separate Flask hosted pilot.
- `service.py` offers drafting, fact selection/handoff, generation and manual review decisions. There is no sending, account-creation or application-submission operation.
- Generated `application.eml` and validated attachment files are reusable inputs; they are not a sent message.
- Recording Submitted currently records a human decision and protects its exact document snapshot. It must not be silently reinterpreted as proof of automated delivery.
- `docs/agents.md` describes external coding-agent access; its existing handoff supplies job data and confirmed fact IDs, not a browser/mail execution agent. A web button cannot invoke the current chat or inherit its tools automatically.
- ADRs 0001–0004 preserve reusable application/data separation, canonical document versions, recovery and account isolation. Existing consent for fact selection does not authorize sending or site registration.

## Confirmed initial scope

Clarified requirement: every automated application must use the selected listing's custom résumé and cover letter from the same canonical version. Gmail attaches both. LinkedIn must verify both uploads and final selections; a missing or unsupported cover-letter field pauses the attempt without submitting. This requirement does not authorize access-control, CAPTCHA or login bypass.

Confirmed: local Mac execution with a visible browser, keeping accounts and browser sessions on the machine; hosted execution comes later. Confirmed: email plus one explicitly supported job-site flow, with one final Send/Submit review per application. The first-version worker processes one selected application at a time. Apply For Me prepares/fills, then presents an exact review before an agent/connector performs the approved send/submit. Show needs-your-help states for verification, missing answers and unsupported sites. Broader coverage is a staged extension, not an initial promise of arbitrary-site reliability.

The user handles signup, sign-in, email codes, MFA and CAPTCHA; automation can resume afterwards. Automatic account creation is deferred. Gmail is the first mail provider; LinkedIn is the selected job-site channel, replacing the proposed Greenhouse choice. Codex is the first local-agent integration; a live fictional-data check proved validated document generation through the installed ChatGPT-signed-in CLI; account usage limits still apply.

**LinkedIn execution boundary:** The owner asked to proceed past the integration restriction rather than select a manual-only handoff. Plan an experimental local, visible-browser Easy Apply adapter using the user's signed-in session. LinkedIn's published restriction remains in force and no approved application API access has been established; browser automation does not remove those facts. Feasibility, current form support and session behavior must be proven before committing to a working submission feature.

The previously agreed user-handled verification still applies. Pause at CAPTCHA, MFA, account restrictions, denied access or unknown questions; do not design anti-detection/identity spoofing, CAPTCHA defeat, hidden endpoints, access-control circumvention or automatic replacement accounts. A blocked attempt is reported as blocked, not success. External employer sites reached from LinkedIn are separate destinations; stop for a supported-adapter decision instead of treating an arbitrary redirect as approved scope.

## Custom résumé for every LinkedIn listing — confirmed

Each Easy Apply attempt must upload a résumé tailored to that listing's role and employer using confirmed career facts. Use an intact job-specific application version already prepared for that listing, or generate a new tailored version through the shared application services and review it. Do not silently reuse a generic profile résumé or a document prepared for another job. Tailoring changes selection/emphasis, not the truth of experience or qualifications.

Bind the attempt and final approval to the job ID, application-version ID, exact résumé path and verified local file hash. Show the résumé preview and filename in final review. Upload those exact bytes and verify the site's selected-file indication before submission; if selection cannot be established, pause for the user. Record the local hash and the available site evidence without claiming the employer verified that hash. A regenerated/edited/swapped résumé invalidates the prior approval and requires a new final review; preserved versions remain immutable.

## Proposed acceptance criteria

1. The user selects a job and a specific intact document version. The UI distinguishes preparing, needs information, awaiting approval, executing, confirmed, failed and outcome unknown.
2. The review names the sending identity, exact recipient or site/account, documents, employer-visible answers and any required user-completed signup step. Unknown personal facts/work rights are requested, never guessed.
3. Authorization is bounded to the selected application and exact action payload. Changed destination, attachments, answers or site requirements invalidate an old approval. The user confirmed one final Send/Submit confirmation per application; the initial Apply For Me click authorizes preparation/filling, not the final send/submit.
4. Email uses a connected user-controlled mailbox. Reuse validated document bytes; capture a provider result/message identifier. Provider acceptance is reported separately from recipient delivery or employer acceptance.
5. Each LinkedIn listing uses its own tailored, reviewed résumé as specified above; verify the intended file selection and stop on a missing, mismatched or unverifiable attachment. Where approved automated website execution is supported, an adapter recognizes forms, fills known answers and uploads only authorized documents. Signup/verification are user-completed; document disclosure and final submission remain explicit actions. LinkedIn has a requested experimental visible-browser path; implementation is gated on the feasibility proof, and unsupported forms/blocked access produce a user handoff rather than blind continuation.
6. CAPTCHA, MFA, verification, assessments and unknown required answers pause for the user. No challenge bypass or fabricated answers. Capability and permitted-site constraints must be checked in the integration spike.
7. Persist an attempt identifier and payload fingerprint before external execution. Double-clicks/concurrent workers cannot launch duplicate attempts. A timeout/crash after an external effect produces outcome unknown; do not blindly retry. Exactly-once delivery across arbitrary external services is not promised.
8. Confirmed completion has channel-appropriate evidence (mail provider response or site receipt/reference/verified confirmation). A filled form or clicked button alone does not establish success. Reconcile uncertain results before another attempt.
9. Preserve manual Submitted decisions and all existing immutable documents. Automated attempt status is separate from document review state; eventual linkage to Submitted must preserve evidence and distinguish manual reporting.
10. Cancel before the irreversible action prevents submission. Cancellation during/after sending is best-effort and cannot imply recall. Restart/resume never repeats an uncertain external action automatically.
11. Tokens, passwords, cookies and browser sessions remain outside Git, exports and portable career data. Durable redacted attempts/receipts have a defined owner, retention and backup/restore behavior. Credentials for this chat's connectors are not automatically available to the app.
12. All local/hosted draft, review, editor and recovery behavior remains available. Execution cannot be triggered by untrusted advert/page text or by the demo. Unsupported hosted capabilities remain explicitly unavailable until implemented and verified.

## Responsibilities and dependency direction

- UI: request, progress, exact review, scoped approval, pause/resume/cancel, evidence.
- Shared Python service: validate intact versions/answers/permission, own the durable attempt journal and enforce duplicate prevention. Preserve the current single-workspace-writer boundary; a second worker must use the service rather than independently opening a locked workspace.
- Executor: a separate, explicitly configured local runtime/agent bridge, or a service-owned worker, drives the approved workflow. Codex is selected as the first agent; the exact local integration API, account/tool access and usage constraints require the feasibility prototype. The interactive Codex/Claude chat is not an implicit backend.
- Connectors/adapters: mailbox or supported-site mechanics behind a narrow execution interface; return receipts or structured failure/unknown results, never authoritative career facts.
- Credential store: machine/account-specific secrets separate from portable workspace records.

External pages and job content are untrusted input. Execution permissions come only from authenticated user actions. The existing hosted login grants application access, not permission to send mail or create employer accounts.

## Settled decision record

The user confirmed local Mac first with a visible browser, email plus one supported site, and a final Send/Submit confirmation per application. See [ADR 0005](../../docs/adr/0005-explicit-approval-for-external-application-actions.md) and the planned Submission approval term in [GLOSSARY.md](../../GLOSSARY.md). This agreement is for feature design; it is not authorization for a current live submission.

## Integration findings and sources

Checked 31 October 2026 using primary documentation:

- [Gmail users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) supports sending with OAuth, including `gmail.send`. Gmail is selected; OAuth onboarding and any broader read/reconciliation permission still need validation.
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board) exposes public GETs but requires a Job Board API key for submission. Existing job discovery is not applicant-side submission access. Do not design a universal submit API around employer-held credentials.
- [Lever's official Postings API repository](https://github.com/lever/postings-api) documents posting/application integration; applicant-side authorization and current form support require validation before selecting a submission method. Existing public posting discovery is not evidence that submission integration is available to this product.

- [LinkedIn prohibited software guidance](https://www.linkedin.com/help/linkedin/answer/a1341387) prohibits unauthorized software that automates activity on its website and warns of account restrictions. [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) lists public self-service permissions separately from talent programs such as Apply Connect/Apply with LinkedIn. No approved talent integration for this app has been verified. Do not assume an ordinary member login authorizes an application-submission API or that a visible browser removes the policy constraint.
- Codex CLI is installed locally and exposes noninteractive and app-server commands. Installation alone does not prove signed-in access, browser/mail tools or an available usage allowance.
- [Official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) describes programmatic local-agent integration and recommends app-server for custom clients needing authentication, approvals and streamed events. [App-server approvals](https://learn.chatgpt.com/docs/app-server#approvals) describe scoped client responses. An integration prototype must verify that these capabilities can enforce this product's final submission approval; generic shell approval alone is not that contract.

No employer accounts, live applications or mail sends were used to establish these findings.

## Non-goals for the first release

Universal-site guarantees, bulk/scheduled applying, autonomous assessments, invented answers, automatic CAPTCHA/MFA handling, paid requests without an approved budget, and inferring an offer/acceptance from submission. These boundaries remain in force for the local preview.

## Verification and recovery

Use disposable fictional records, a fake mailbox transport and controlled local site fixtures. Cover duplicate clicks, changed document hashes, changed answers/recipient, lost session, a stored default résumé overriding the custom upload, wrong-job résumé selection, changed résumé after approval, unverifiable file selection, verification pause, worker crash, ambiguous timeout, rate limits, user cancellation and receipt reconciliation. No external sends in ordinary CI. Any real smoke test needs a designated user-controlled destination or provider sandbox and separate execution authorization.

Existing commands (known project commands; not rerun for this documentation-only task):

- `.venv/bin/python -m unittest discover -s tests -v`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `.venv/bin/python tests/run_browser_checks.py`
- `.venv/bin/python tests/check_wheel.py PATH_TO_COMPLETE_WHEEL`

Data-format changes require backup/restore and older-workspace compatibility checks. Turning execution off must preserve attempts/evidence and leave drafting usable; an external submission cannot be rolled back by restoring local state.

## Open interview

Round 1 complete: local Mac first with a visible browser; email plus one supported site; prepare/fill then one final Send/Submit confirmation per application.

Round 2 complete: Gmail + LinkedIn selected; user handles signup/sign-in/verification; Codex first.

Q7: owner requested proceeding past the LinkedIn integration restriction. The plan interprets this as experimental local visible-browser Easy Apply automation; no approved API access or ability to evade provider enforcement is claimed.

Final shared-understanding confirmation remains before implementation. Existing confirmed-facts, unknown-answer and private-history rules remain the baseline. Use only verified answers; pause for missing mandatory or sensitive answers. No separate paid API service or new paid capacity is authorized: the Codex access/capability prototype must surface any additional requirement before use. Keep redacted attempt/receipt evidence with the private application history, exclude credentials/session material, and preserve it in backup/restore. The precise schema and retention controls are implementation design to validate, not claims of existing support.
