# Jobs at a full company — follow-up specification and plan

Status: the owner confirmed the complete compact-stack design and recoverable Jobs cleanup on 15 November 2026, including cleanup of already qualifying companies during the upgrade. This extends the published and verified `83b1412` baseline. The earlier selection, editable prompts and sidebar work remains accepted. The private upgrade is authorized but held until this addition is verified and published.

## Requested outcome

The owner asked for a more creative, visibly different treatment of remaining Jobs after selecting two roles at one employer, suggesting tags, stacked cards and minimal cards. They also requested automatic removal of remaining Jobs after two applications are submitted to the same employer, including submissions recorded by the AI agent.

## Confirmed design

### Two pending choices

- Keep the current company grouping and accepted Agency visual system. When the authoritative company allowance confirms two pending choices, compress the remaining eligible Jobs into slim, individually openable rows grouped as one subtle stack.
- Keep every visible result's title readable without expanding a cover card. Retain enough context to distinguish roles, such as location. Remove repeated descriptions, logos, evidence summaries and unavailable Apply later controls from these compact rows; the existing inspector keeps full detail and actions.
- Show the limit once per affected company, using **2 of 2 selected**, with a clear **Change selections** route to that employer's To apply roles. Use quiet layered edges to make the grouped state distinct. Avoid overlapping real hit targets, inaccessible faded text or a repeated warning on every row.
- Any company filter introduced by Change selections must be visible and clearable and support navigation history. It does not change the accepted copy scope: without a temporary selection, instructions still cover all pending roles across filters/pages and display that true count. Use stacked edges in proportion to actual rows rather than implying hidden roles that do not exist.
- Removing a pending choice restores the regular eligible cards after state refresh. Preserve the user's current role, focus and scroll where possible. Respect reduced motion if the density change is animated.
- Derive the state from verified employer identity and the existing canonical pending allowance, never a display-name count. Keep uncertain history, an unverified employer, a closed listing or other specific blocker visible with its proper meaning; do not mislabel them as two selections.
- Keep role titles in the current inspector navigation order. Filters, pagination, deep links, source access, removal and keyboard/touch use remain available. Restrict the new treatment to Jobs; existing To apply and application-history behavior remains intact.

### Two confirmed submissions

- Use the existing two-distinct-vacancy employer round and configured cooldown, not a lifetime count. Count trustworthy dated confirmations using the existing timezone/date rules. Two versions of one vacancy, undated uncertain history, pending choices, holds, or a manual company pause after only one submission cannot independently trigger cleanup.
- When a second distinct submission is confirmed, append reversible removal events to remaining **Jobs** at that verified hiring employer. A prepared draft that is still a Jobs role moves to Removed with its role, while every document/version and activity record stays intact.
- A real second confirmation during an earlier manual pause qualifies; the pause itself does not. Protect exact running/resumable jobs in ordinary batch preparation as well as connected-agent and submission-attempt records.
- Keep submitted vacancies and equivalent listings, existing removal history, and **To apply** choices untouched. Protect roles with active, resumable, uncertain or receipt-reconciliation work, including agent work before a reservation exists. Surface skipped protected/unresolved records for later resolution rather than guessing or cancelling work.
- Share the same rule across manual Submitted decisions, historical submission recording, self-apply confirmation, legacy delivery and connected-agent confirmation/reconciliation. A failed or merely attempted submission must not trigger it.
- Use a plain removal reason such as **Company application limit reached**. The removal is durable: cooldown expiry opens new company slots but does not silently repopulate Jobs with old listings. Existing explicit Restore remains available under the applicable company-capacity rules. Correction of submission history must not delete audit events or silently restore discarded roles.
- If a genuine submission is recorded later for an automatically removed role, show it under Submitted while retaining the original cleanup event. A correction that withdraws that confirmation exposes the original removal again. This exception applies only to automatic company-limit cleanup; explicit user removals keep their existing precedence.
- Keep cleanup idempotent by canonical employer, qualifying pair and role. Retries, additional receipt writes and cooldown extensions must not multiply events or undo an explicit Restore.
- Apply the same policy to already qualifying companies in active cooldown through an explicit shared preview/apply operation during the authorized upgrade. Recompute inside the transaction, preserve unknown associations, and report skipped records. Do not silently sweep old pairs on unrelated writes, mutate GET/read operations, or rewrite backup/restore snapshots.

## Evidence and design tradeoffs

[Apple's stacks](https://support.apple.com/en-mn/guide/mac-help/mh35846/mac) give a useful grouping metaphor. [NN/g's accordion guidance](https://www.nngroup.com/articles/accordions-on-desktop/) explains the space benefit of disclosure and the cost of hiding essential information. The proposed stack preserves all job titles, keeping the board scannable and the existing inspector navigation straightforward. A fully closed pile would use less space but add an interaction before comparing roles.

The current UI already hides cooling employers from Jobs; that does not create a removal record. This follow-up makes the owner's requested cleanup explicit, recoverable and consistent between human and agent submission paths.

## Implementation order

1. **JC-01 — Backend rule and reversible cleanup.** A Sol builder owns the pure chronological qualifying-pair calculation, the shared SQLite write boundary, idempotent removal events and explicit existing-round preview/apply. Compare trustworthy pre-write and post-write evidence rather than treating a missing new projection field in an old snapshot as a new submission. Reuse existing job removal records without unnecessary schema changes. Verify aliases, equivalent vacancies, actual dates, manual pauses, expiry/new rounds, protected work, recovery and immutable document bytes.
2. **JC-02 — Compact company stack.** A separate Sol builder owns Jobs rendering and focused navigation into that employer's To apply list, using the existing capacity projection. Render an early fictional full-company group beside a company with available slots at desktop and mobile sizes. Check keyboard/focus, long labels, filters, pagination, opened inspector and capacity recovery.
3. **JC-03 — Independent review and integrated tests.** A Sol reviewer checks both changes, the actual data-mutation scope and meaningful failing/passing regressions. Run affected Python and frontend tests, typecheck/lint/build and relevant real-browser workflows. Reuse still-applicable baseline evidence; update expiry tests to distinguish new open slots from deliberately removed old listings. No weakened byte, snapshot or authority validation.
4. **JC-04 — Publish and upgrade.** A Sol shipper commits and pushes the reviewed follow-up to main, follows CI/public deployment, and verifies its actual release. Rebuild and attest the private wheel. On a fresh restored live snapshot, preview and apply the exact cleanup, verify canonical document bytes and all retained queue/record invariants, and rehearse rollback. After the same checks pass, use the already authorized private cutover and explicit cleanup with a fresh backup, preserve the manual launch/access setup, and verify localhost and private HTTPS. Never apply this policy to the real workspace before the implementation and selected cleanup scope are confirmed.

The final design confirmation resolves the cleanup scope and existing-round rollout. There are no open product decisions. The existing private upgrade authorization includes applying this confirmed cleanup policy after the combined build, recovery rehearsal and CI pass. No additional submission, messaging, job research or private Git publication is authorized by this work.
