# Application queues and decision controls

Status: implemented and locally verified, 2 November 2026. See [verification.md](verification.md). Local fixes and release readiness only; no commit, push or deployment performed.

## Acceptance contract

- Show one current decision card per job across Active, Submitted and Rejected. A submitted snapshot takes precedence over other versions; otherwise show the latest current version. Preserve original statuses, document links and complete version History.
- Earlier review queues remain an explicit option without making submitted jobs actionable again. Distinct jobs/requisitions must remain distinct even when titles/employers match.
- Counts, destination choices, empty states and visible cards use the same queue selection.
- Reviewed controls/tags use the existing sky-blue accent treatment; Submitted uses green; Reject remains red. Readable text and visible keyboard focus remain required.
- Review heading and Apply For Me/Submission details share a deliberate, responsive header layout; comments/actions retain consistent spacing and wrapping. Preserve the white/black visual language and existing controls.
- Reproduce the bug with fictional data; add regression checks for submitted/rejected/edited/historical versions, counts, filtering, comments and cross-tab decisions. Check responsive layout, contrast, keyboard and browser errors.
- No private career data in public fixtures, screenshots, source or docs. Do not rewrite private state, master, package files, receipts or installed pin.

## Implementation and verification order

1. Capture preservation baselines and reproduce the version/queue issue in a disposable workspace.
2. Centralize current-version queue selection, align counters/filtering, and cover related state transitions.
3. Apply scoped decision colours and review-header spacing using existing CSS tokens; inspect adjacent controls.
4. Run focused unit/browser tests, frontend gates, relevant full regressions and packaging checks. Inspect rendered narrow/wide states.
5. Review the final change and repair/recheck findings. Record evidence, unverified release gates and recovery. Update the local exported frontend for the running app without upgrading the private installation or publishing.

## Decision rationale

Queues represent job decisions; History represents preserved document versions. Filtering the presentation avoids changing historical draft statuses into submissions that never occurred, deleting older documents or migrating personal state. Existing submitted versions remain immutable.
