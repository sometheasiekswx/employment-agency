# Clear, stable opportunity cards

## Confirmed outcome

Put the job title at the top of each full card, with Remove above Apply later in a narrow vertical action column at the right. The owner confirmed that the status tag belongs beside the location below the title, wrapping on narrow cards. Remove the generic “Work rights / sponsorship need confirmation” reminder from previews; keep the underlying eligibility information in opened details. Preserve the existing theme, logo treatment, card actions, evidence, and substantive blockers.

Saving or removing a role from the board must give a single coherent result without moving unrelated companies under the pointer or briefly resurrecting a disappearing card. This includes actions with the detail panel closed. The accepted [stable-board behavior](../stable-opportunity-board/spec.md) still applies: preserve company columns and surviving order until a deliberate reset, close gaps within the affected column, and restore original placement on Undo or a failed operation.

## Reported defects and investigation

- Apply later from a preview can make a surviving company move elsewhere while the pointer remains over another company's job.
- Save/remove can show a disappearing card again before it finally leaves.
- Related actions need investigation for rapid activation, delayed/failed requests, out-of-order refreshes, Undo, final-company removal, focus, viewport changes, and reduced motion.

These are reported symptoms. Record observed reproductions and causes before claiming each defect is confirmed. Use fictional fixtures for mutations and before/after recordings. Existing career decisions and submitted documents are not test fixtures.

## Acceptance

1. Full-card titles begin at the top-left beside the vertical actions. Long titles wrap with readable space; controls have separate usable targets at narrow widths and enlarged text.
2. Location and status form a wrapping metadata row below the title. Missing tags/location do not leave an empty header. Compact/capacity, removed, and application cards keep their correct actions and states.
3. The generic sponsorship unknown is absent from previews and remains discoverable in details. Real failures, capacity restrictions, and other substantive warnings remain visible where needed.
4. With the view/filter/profile and column count unchanged, ordinary card actions preserve surviving company columns and relative order. Closed details remain closed, scroll/focus stay appropriate, and only the affected column closes its gap.
5. Successful save/remove transitions do not restore stale cards between optimistic feedback and confirmed state. A failed action restores its previous state once with an actionable error; Undo restores the correct version and position.
6. Concurrent actions, late responses, and interrupted motion cannot overwrite a newer result or revive an obsolete state. Explicit refresh/filter/view/workspace changes still work.
7. Pointer, keyboard, mobile, reduced motion, both themes, and existing document/queue behavior remain usable. Tests cover the actual state and positional regressions, not only static screenshots.
8. Reviewed shared changes reach `main` and the public demo. The explicitly authorized private installation update preserves existing supported workflows, records, and document bytes, with export/restore and candidate verification before cutover.

## Scope and trust boundaries

All reusable implementation belongs in the shared application. Preserve unrelated work in other checkouts. Public tests, recordings, and source contain fictional data; private backup and upgrade evidence stay outside the public repository. No employer contact, application submission, job research, new dependency, or schema change is intended. New consequential findings should be explained before expanding beyond these card interactions.
