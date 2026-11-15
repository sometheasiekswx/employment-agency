# Card interaction tasks

Plan: [plan.md](plan.md).

- [x] Confirm title/action/tag composition and retain the accepted stable-board behavior.
- [x] Reproduce preview-only jumping and flicker; collect before evidence and inspect related interactions. See [findings.md](findings.md).
- [x] Implement and render the new card composition. Desktop and 320/390px captures inspected; focused Discover tests pass.
- [x] Fix confirmed interaction causes and verify regression/failure/Undo cases.
- [x] Complete broader checks and independent review with after evidence. See [verification.md](verification.md).
- [x] Prepare the reviewed shared candidate for the authorized main push and existing public-demo workflow.
- [x] Verify private compatibility, backup/restore and candidate installation; retain the prior runtime for rollback.

Delivery is verified operationally after the commit: follow its complete Checks workflow and live release marker, then record the actual private cutover and target checks in the machine-local recovery evidence. A green candidate checklist alone does not establish successful deployment.
