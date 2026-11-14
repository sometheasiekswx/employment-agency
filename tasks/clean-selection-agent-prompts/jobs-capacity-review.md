# Independent review of company capacity and Jobs cleanup

Reviewed both changes against the published `83b1412` baseline and [ADR 0019](../../docs/adr/0019-remove-remaining-jobs-after-two-confirmed-submissions.md). The independent review used disposable fictional workspaces and controlled submission channels. No actionable findings remain open.

The submission review follows direct version decisions and existing listing history, legacy and self-apply outcome recording, and connected agent receipt storage and reconciliation through their shared SQLite writes. The acceptance checks distinguish dated canonical vacancy pairs, manual pauses and uncertainty, previous rounds, retried receipts, and explicit cleanup of existing active rounds. They compare record membership and document bytes before and after cleanup, including roles with work that precedes a reservation.

## Compact Jobs stacks

The integrated export passed independent Chromium and WebKit checks at 1,440 × 720 and 390 × 844 with reduced motion. Four eligible roles showed all their titles with distinct, non-overlapping 44 px hit targets. An equivalent vacancy and a closed vacancy remained regular cards. The inspector retained the board order and original listing links. Change selections cleared the previous location filter, included the employer's choices in two locations, and excluded the similarly named employer. The scoped deep link kept focus inside the inspector. Releasing a pending place through the shared API restored the ordinary card on the next state refresh while keeping the same title element and its keyboard focus. Fresh captures in both engines painted the top header and four-link bottom dock at their respective viewport edges. These were emulated viewports.

## Backend negative controls

Against the published baseline, two independent fixture checks failed at the expected missing removal event. One used two direct dated decisions with an unchosen prepared job. The other started with two versions of one vacancy, set a manual pause, and recorded the true second dated vacancy during that pause. Before the qualifying decision, no removal occurred in either fixture.

## Backend verification and findings

Independent disposable fixtures passed direct decisions, an uncertain connected-agent outcome later confirmed without document association, and a true second dated confirmation during an earlier manual pause. The retained cases include a pending listing saved only through legacy agent intent, a connected agent queued before reservation, a paused batch, an equivalent submitted vacancy, an existing manual removal and an unlinked same-name job. Both the prepared version record and the exact CV bytes remained intact. The installed policy keeps the removal durable through cooldown expiry and allows explicit Restore.

The explicit rollout preview produced exact candidate and skipped records without persisting changes. Remapping a candidate to another current vacancy under the same employer preserved its job ID and title but invalidated the preview fingerprint. The old apply returned `company_jobs_cleanup_changed`. After a fresh apply, Restore and a cooldown extension left the original audit event intact with no new removal. The initial focused shared suites passed all 56 tests.

- **P2, verified fixed.** A legitimate late submission of a role with an automatic cleanup event was omitted from Submitted. Two dated confirmations removed the standby role, then recording a previously completed third application extended the cooldown but left the role in Removed. The shared queue and frontend now treat the automatic event as inactive while a valid submission exists. Ordinary manual removals keep their existing precedence. The fifth independent Python test verified the Submitted and Removed queues, unchanged event and application bytes, and correction returning the role to its original Removed state. Chromium and WebKit rechecked the final build's direct Submitted deep link and the Restore action after correction. [Queue projection](../../employment_agency/application_queue.py#L55) · [Frontend removal state](../../frontend/src/lib/job-removal.ts#L3)
