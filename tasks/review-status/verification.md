# Draft-to-reviewed status control

**Correction requested, 2 November 2026:** the owner rejected the fixed-looking, one-way adaptation described below. The current requested design is recorded in [design.md](design.md). These results describe the earlier implementation, not verification of the corrected toggle.

Implemented and verified locally on 2 November 2026. This change is in the shared software checkout, not the private career workspace. No commit, push, deployment, package upgrade or real application decision was performed.

## Interaction contract

- The separate Reviewed action is removed from the decision panel.
- A draft tag previews “Mark reviewed” on mouse hover or keyboard focus. Neither preview saves anything.
- One click, Enter, Space or first touch submits the card's existing review form, including its current comment. The tag becomes reviewed only when the shared service has saved and refreshed the record.
- Pending requests prevent repeated saves and disable the card's other decision/comment actions. Errors retain the draft and comment, expose the existing form error, and permit retry.
- Reviewed is a one-way completed action with a checkmark and readable blue tint. It remains focusable to preserve keyboard position, but cannot save again. Submitted and rejected tags remain noninteractive; existing Return to Active, Reject, Submitted and comment workflows remain available.
- All versions, canonical links and submitted document bytes retain their existing rules. Tests mutate disposable fictional workspaces only.

## Design and motion decisions

Mode: **Operate**. Impeccable leads this requested refinement. Taste contributes established app-screen grouping and stable targets; the surrounding brand, type, layout and user-edited button colours are preserved. No composition draw, new styling system or dependency was needed.

Motion weighting: Emil first, Jakub second. This is a frequent review action, so feedback is fast and bounded. The focal moment is the change from a draft to a persisted review decision. Continuity comes from the same tag position and label width; feedback comes from the intent label, saving state, checkmark and blue tint. Pointer label/icon crossfades use 150ms opacity and a 2px text blur. Keyboard changes are immediate. Reduced motion removes transitions and blur while retaining the labels and checkmark. There are no bell rings, badges, waves, layout animations or loops.

Adapted from the official [React Bits Bell Toggle](https://reactbits.dev/c/micro/bell-toggle), specifically its stable grid label stack, crossfade and native-button interaction. The source was checked at commit `4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4`; the full upstream notice is retained in `frontend/public/licenses/react-bits-bell-toggle.txt`. Existing Lucide icons replace notification-specific glyphs. The application review action deliberately has one-way semantics rather than a notification toggle.

The existing design registry/surface brief describes older decision colours. The current user brief and live CSS were used for this refinement; unrelated registry drift was not repaired.

## Verification

| Check | Result |
| --- | --- |
| `npm --prefix frontend test` | **39 passed** across 8 files, including 9 new card tests |
| `npm --prefix frontend run typecheck` | **Pass**, in an isolated source build |
| `npm --prefix frontend run lint` | **Pass** |
| `npm --prefix frontend run build` | **Pass**, static export packaged; the live Next.js development cache was not rebuilt or stopped |
| `tests/review-tag-browser.cjs` through a fresh queue fixture | **Pass**: no hover/focus writes; pointer/Enter/Space/touch; current comment; pending/failure/retry; duplicate guards; persisted reload; immutable statuses and submitted PDF hash |
| Changed-header WCAG axe checks | **Pass** at 390, 768 and 1440px |
| Pointer/keyboard and geometry | **Pass**: stable target, 40px desktop / 44px touch height, visible focus, retained completed focus, no overflow |
| Motion inspection | **Pass**: actual CSS transitions inspected at 10% playback, plus settled stills and reduced-motion behavior |
| Eight independent existing local/hosted browser workflows | **Pass**: preparation, comments/decisions, forms, editor versions, external edit adoption, folder switching, recovery/history and hosted restrictions |
| `.venv/bin/python -m unittest discover -s tests -p test_frontend.py -v` | **12 passed**: local/hosted HTTP routes, assets, export and preserved history |
| Running development app on port 3000 | **Pass**, read-only fresh Chrome check: new review tags visible, separate Reviewed actions absent, no browser errors; no personal decisions or files changed |
| Impeccable mechanical detector | **Pass**: no findings (`[]`); this is not a substitute for the browser accessibility checks |
| `git diff --check` | **Pass** |

The first type check caught unsupported Testing Library options and an inferred test-status type; those test definitions were corrected before the production build passed. A narrow screenshot initially caught a crossfade during screenshot-driven scrolling; the harness now waits for the settled intent and draft faces before its still captures. The deliberately slowed animation capture remains separate. No product assertions or accessibility checks were removed to obtain a pass.

### Broader accessibility failures

The existing queue and redesign browser suites **still fail their unchanged whole-page contrast checks**. The inherited button colours produce:

| Existing control | Colours | Observed contrast | Required normal-text contrast |
| --- | --- | --- | --- |
| Apply For Me | White on `#0593C6` | 3.50:1 | 4.5:1 |
| Submitted | White on `#0FB04D` | 2.86:1 | 4.5:1 |

These colours existed when this task started. This work preserves them rather than changing the user's other button styling. The new tag's accessible blue text/tint passes its own checks. No claim is made that the whole application currently passes WCAG or the full browser runner. Existing colour assertions now follow the current semantic tokens instead of frozen previous shades; the full contrast assertions remain intact and continue failing visibly.

## Interface-polish review

Mode: full within the requested status-control, action removal and form-coordination scope. Stack: React/Next.js and existing plain CSS. Other button-colour redesign is outside this scope.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Draft, intent, saving and completed labels at three widths | Existing compact type retained; readable settled labels |
| Surfaces | Tag/decision layout, hover/focus, pending/error/retry and touch | Stable label area, clear focus and adequate targets; inherited adjacent contrast failures recorded above |
| Animations | 10%-speed CSS playback, keyboard, pointer interruption and reduced motion | Fast bounded feedback; no layout animation or keyboard travel |
| Icons | Existing Lucide circle/check, checked and unchecked states | Single icon family, currentColor, no notification semantics |
| Performance | CSS selectors/transitions, component state and build | No new dependency, timer or animation loop; opacity/filter only for the label/icon effect |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `frontend/src/features/applications/application-card.tsx`; `review-status.tsx` | Separate Reviewed decision button and passive draft tag | Review action lives at the status tag; explicit activation persists it | Keeps the state and its action together and reduces decision-panel clutter |
| MEDIUM | `frontend/src/components/controls.tsx`; `application-card.tsx` | Form fieldset alone could not coordinate a new external submit button | Unique native form association, shared busy state and synchronous submit guard | Preserves the correct comment and prevents conflicting or duplicate saves |
| LOW | `frontend/src/app/globals.css`; `review-status.tsx` | No draft-tag intent or completion feedback | Stable stacked labels, bounded crossfade, checkmark, instant keyboard/reduced-motion path | Makes the action discoverable without moving surrounding content or hiding persistence failures |

Considered but rejected:

| Candidate | Reason |
| --- | --- |
| Copy the bell ring, badge, waves or notification wording | They communicate notifications and add repeated motion to a productivity action |
| Toggle reviewed back to draft on another click | The brief asks for an explicit one-way review; repeated activation should not silently undo a saved decision |
| Animate the tag's width | It would move surrounding content; a stable label area preserves the click/focus target |
| Optimistically show reviewed before the server succeeds | It could misrepresent a failed integrity check; keep saving/error states honest |

Verdict: **Approve for the requested control.** Independent source and rendered reviews found no remaining product issue in this change. **The broader whole-page accessibility gate remains blocked** by the two existing contrast failures above. This distinction is intentional; the full runner is not reported as green.

## Evidence and local use

Generated, Git-ignored evidence:

- `output/playwright/review-tag/hover-{390,768,1440}.png`: settled intent labels.
- `output/playwright/review-tag/reviewed.png` and `reviewed-390.png`: persisted completed state and the panel without a Reviewed action.
- `output/playwright/review-tag/saving.png`, `failure.png`, `touch.png`, `reduced-motion.png`, `motion-10-percent.png`: interaction states.
- `/tmp/ea-review-tag-browser.log`, `ea-review-tag-other-browser.log`, `ea-review-tag-unit.log`, `ea-review-tag-build.log`, `ea-review-tag-lint.log`: passing checks.
- `/tmp/ea-review-tag-queues.log`, `ea-review-tag-redesign.log`, `ea-review-tag-contrast.log`: visible inherited accessibility failures.

The existing live development server sees the source changes automatically. A normal browser refresh also loads the updated local static export. No Python restart or workspace upgrade is required for this frontend change. Local macOS checks do not establish deployment or remote CI status.
