# UI copy cleanup

Requirements: the user's 14 November 2026 request to remove redundant explanatory text, including the five named passages in Opportunities, Career profile, Search preferences and History, and reveal useful secondary guidance only when needed.

Task list: [todo.md](todo.md)

## Approach

Keep the existing interface, controls and workflows. Remove page introductions and section explanations that merely repeat headings, field labels or visible navigation. Retain helpful concepts through compact, initially closed contextual disclosures. Prefer the native `details`/`summary` pattern already used throughout the frontend; it supports pointer, touch and keyboard without a dependency or hover-only interaction. Use a small information icon with a clear accessible name (and a concise visible topic label where that improves discoverability). Keep disclosures in normal document flow so expanded text cannot cover actions or escape narrow viewports.

The shared repository owns all implementation. The private workspace, its data, installed wheel and workspace lock stay untouched. Both repositories have pre-existing edits; compare this task against its starting working tree and preserve those edits. No backend, data model, dependencies, submission behavior, commits, pushes, public deployment or installed-build upgrade is in scope.

The user supplied sufficient requirements, so no separate specification document is needed. The coordinator plans and reviews; GPT-6.1 Sol implements. Verification and release-readiness reporting follow the auto workflow, with no publishing authorization inferred.

## Ordered slices

1. **Remove redundant copy.** Delete the named Opportunities, Career profile, Search preferences and History introductions. Remove the analogous Settings introduction and generic control reassurance. Review surrounding steady-state copy across these pages and remove duplicated instructions (for example, preferred-location ordering and import instructions already explained by controls). Preserve actionable onboarding/empty states, selected-role context, errors, pending-review notices, submitted/unknown evidence status, privacy/consent consequences, destructive-action warnings and required input formats. Keep useful navigation links when deleting the prose that contained them. Areas: `frontend/src/features/{discover,career,search,history,settings}` and related styles. Acceptance: the named prose no longer occupies the default page, and controls remain functional.

2. **Reveal helpful guidance on demand.** Add one small shared help disclosure only if existing controls cannot express the repeated treatment cleanly. Use it for History's explanation of preserved documents and submission status, profile ranking guidance, source types, appearance scope and restore instructions where useful. Shorten and consolidate retained text instead of creating an information icon for every removed sentence. Use the existing CSS tokens, visible focus, readable wrapping and adequate hit areas. Keep state-critical warnings beside the affected control or record. Acceptance: help starts closed, has an accessible topic name, opens and closes with mouse/touch and Enter/Space, remains readable at 320px and 200% text, and never submits a form or marks a draft changed. An inline disclosure needs no hover, portal, focus trap or outside-click behavior.

3. **Verify, review and prepare for delivery.** Inspect the actual task diff against the saved baseline. Run existing relevant tests plus frontend typecheck, lint, the frontend suite and a production build. Do not add tests for static wording; only add a focused behavioral check if the shared disclosure warrants it. Use the repository's installed Playwright and disposable fictional fixtures to inspect Opportunities (Browse), Career profile, Search preferences, History and Settings at desktop and phone widths, exercise help with keyboard/tap, check overflow and console errors, and run the existing relevant browser acceptance. Record exact results in `verification.md`; leave unrelated failures visible. Review the final source and evidence before claiming ready.

## Evidence checkpoints and risks

- Capture the pre-task frontend working tree separately before implementation so existing onboarding and application-journey edits remain distinguishable.
- The History warning is useful background, but individual record status/date uncertainty must remain visible in the relevant record.
- Source-input format, work-rights, consent and irreversible-action instructions can affect decisions; do not hide them merely to reduce word count.
- Removing intro containers can leave empty gaps or misaligned actions. Inspect the rendered pages, light/dark appearance and narrow layouts.
- Browser verification uses fictional data and must not submit applications, contact employers or mutate the live private workspace.
- A successful source build does not update the installed private wheel. Report the local result and installed-build boundary accurately.
