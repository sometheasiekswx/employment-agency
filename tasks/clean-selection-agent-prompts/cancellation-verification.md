# Browser cancellation verification

The unpublished prerequisite held the employer slot while closing the browser. When the first close raised `OSError`, the attempt stayed in `cancelling`, the service stayed busy, and a second cancellation request could not retry closure. Independent review reproduced this with a fictional browser and SQLite workspace.

`test_legacy_browser_keeps_its_slot_until_cancellation_retry_succeeds` failed before the fix because the held attempt did not expose retry. It now verifies that a failed close keeps the slot occupied, blocks another vacancy from taking it, and prevents approval. The second close succeeds, the attempt becomes cancelled, and the third role can take the slot. Neither mocked provider sends an application.

- `PYTHONPATH=tests .venv/bin/python -m unittest test_pending_company_slots test_application_delivery -q` passed all 38 tests.
- `npm --prefix frontend test -- src/features/applications/opportunity-application.test.tsx` passed all 12 tests. The new Activity test covers asynchronous cancellation, visible recovery, retry for the same attempt, and the final cancelled state without a reload.
- Independent review reran both SQLite cancellation regressions and the 12 Activity suite tests successfully.

The checks use fictional browser and mail adapters and mocked frontend API responses. Real LinkedIn and Playwright transport failures were outside this verification.
