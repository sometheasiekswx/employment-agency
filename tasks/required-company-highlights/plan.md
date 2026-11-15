# Implementation plan: required company highlights

Spec: [spec.md](spec.md). Task status: [todo.md](todo.md).

## Approach

Extend the existing company comparison boundary. Use one definition of current, distinct eligible inventory and valid review for both board status and research completion. Keep the existing pair storage and derive status at read time so older companies participate immediately and no completion flag becomes stale. A final read operation validates an explicit research scope; collecting and ranking roles must remain possible before recommendations are ready.

This adds enforceable completion validation to the existing prompt guidance. Do not introduce model-generated default choices or a host-wide stop hook: neither can establish evidence-backed fit, and either would unnecessarily affect unrelated work.

## Ordered slices

1. **Review status and completion contract.** Reuse/refactor `company_best_matches.py`, `companies.py` and service routing. Add a scoped, protected completion check and structured readiness to research assessment. Validate all checked companies and their full current inventory, independently of presentation limits. Verify missing/current/stale reviews, vacancy deduplication, unresolved identity, scope isolation, input validation, no side effects and HTTP protection.
2. **Visible review status and agent workflow.** Expose the derived status through workspace state and the frontend model. Show concise missing/stale text in company headers in Jobs for the selected profile. Retain role navigation, filtering, current picks and other views. Update `research_handoff` and `docs/agents.md` with finalization and honest incomplete outcomes. Verify component behavior, existing company contracts and an actual desktop/mobile browser flow using fictional data.
3. **Integrated verification and review.** Run required frontend checks and production build, Python regression suite, then inspect the actual diff for correctness, security boundaries, data preservation and acceptance coverage. Fix in-scope findings and recheck affected behavior. Reuse passing evidence unless later changes invalidate it.
4. **Release readiness.** Build an installable wheel, verify it outside the checkout including export/restore, record exact artifact/provenance and outstanding limitations. The original candidate received its own installation verification. The branch consolidation also verifies public preview generation and delivery from shared main.

## Risks and checkpoints

- Eligibility and distinctness currently appear in multiple company paths. Keep the new completion check consistent with displayed highlights, including duplicate postings and unverified employer links.
- A research batch may contain only part of a company's stored roles. Completion must consider the full company inventory and all checked companies, while unrelated companies remain out of scope.
- Status must use full inventory rather than the UI's filtered cards. Pending application choices and submitted roles keep their existing semantics.
- Scope/results may change during research. Finalization re-reads current inputs; it is evidence at that instant, not a durable guarantee.
- The shared repository is public. Use only fictional fixtures and generic documentation. No private data, screenshots or credentials enter source, tests or build output.
