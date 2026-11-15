# Stable opportunity board

## Outcome and agreed behavior

People reviewing roles should be able to keep track of the board after Apply later, removal and Undo. The owner accepted [ADR 0020](../../docs/adr/0020-preserve-columns-during-opportunity-review.md): close gaps within the same column; let the next company in that column move up when a company empties; leave exhausted columns empty until a deliberate layout reset.

The shared application owns this behavior across its Discover board views. Preserve the current visual identity, company grouping, highlights, pending-capacity compact cards, inspector, actions and recoverable decisions. No private workspace code, schema changes, external applications or installed-workspace upgrade are in scope. The subsequent explicit review/ship request authorizes shared `main` delivery and the established automatic public-demo release.

## Current evidence

- `groupOpportunities` derives company order from the first remaining ranked role. Removing that role can change a company's relative order.
- Discover's ResizeObserver repacks the entire CSS grid after section heights change; ordinary articles and sections have no position transition.
- A Chromium run against the disposable Alex Morgan fixture reproduced the problem: saving its first role moved all three surviving company groups. Two moved 376px left; one moved 752px right and 272px upward.
- The shared app already installs Motion 14.9.0 and uses React 19, Next.js and plain CSS. Preserve the installed stack.

## Acceptance

1. At a fixed board width and unchanged view/filter/profile, saving or removing a role does not move surviving companies to other columns or reorder surviving roles. Only later content in the affected column closes the gap.
2. Removing a company's final role removes its heading and allows the next existing group in that column to rise. Other columns retain their positions, including an empty column where appropriate.
3. Undo and failed optimistic actions recover their original ordering and column. Rapid successive actions remain usable, and an older animation or response cannot overwrite a later result.
4. New companies append without displacing existing groups. Existing-company arrivals append behind established roles until a deliberate refresh. Background ranking or evidence changes do not reshuffle established roles.
5. Explicit Refresh matches, view/filter/profile changes and column-count changes may reset placement. Opening or closing details alone is not a reset unless it changes the column count. A workspace change clears the old arrangement.
6. Use brief, clean, interruptible movement for actual local displacement. Avoid bounce, staggered cascades and scaling text. State changes, focus and controls do not wait for animation. Reduced motion and the existing immediate keyboard convention remain usable.
7. Preserve scrolling, selected-role visibility, empty/loading states, keyboard focus, Undo, error recovery and the current company allowance/highlight behavior. Verify desktop, narrow widths and inspector layouts.

## Research and implementation guidance

Use `animate` for purposeful state transitions and `choreograph` for coordinating removal with local gap closure. The existing component-craft guidance supports retaining established controls and styling. No additional animation package is needed.

- [NN/g: The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/) supports restrained feedback and warns that simultaneous movement competes for attention. Stable column allocation is this project's design choice, not a prescribed NN/g pattern.
- [Motion layout animation](https://motion.dev/docs/react-layout-animations) documents position/layout transitions and their constraints. Verify the installed APIs and the board's imperative resizing before choosing the integration.
- [Motion accessibility](https://motion.dev/docs/react-accessibility) documents reduced-motion support. Retain explicit state feedback without travel.

## Verification and delivery boundary

Use fictional fixtures only for actions and browser recordings. Cover positional invariants, same-column movement, rollback/Undo, arrivals, resets, rapid interactions, reduced motion and keyboard use. Reuse current regression checks for card layout, opportunity removal and capacity.

Planned verification commands (completed evidence is recorded in [verification.md](verification.md)): `npm --prefix frontend test`; `npm --prefix frontend run typecheck`; `npm --prefix frontend run lint`; `npm --prefix frontend run build`; targeted scripts through `tests/run_browser_checks.py` fixture helpers; package/build checks appropriate to the final change.

The original Auto request authorized implementation, verification, review and release readiness after the documented interview. The later explicit review/ship request authorizes committing and bringing this change to shared `main`, which triggers the existing automatic public-demo workflow. Replacement of the installed private build remains a separate explicit upgrade. Preserve the unrelated required-company-highlights work already present in the checkout.
