# Mobile opportunity sheet and search

The mobile Opportunities workspace preserves its charcoal/lavender style, employment mark, factual content and native dialogs. Search is visible in the main view, filters immediately without per-key ranking/network requests, keeps focus, and synchronizes the URL. Real initial boot and ranking loads have static, accessible skeletons; refresh retains available results. Errors remain actionable and never masquerade as zero matches.

## Motion and scrolling plan

| Transition  | Trigger and purpose                                                          | Properties and timing                                                                                                                                   | Interruption and reduced motion                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrival     | Tap a role; show the relationship to the bottom sheet                        | Whole surface translates from below the viewport to its resting height, roughly 320ms spring, no overshoot; opaque content and controls travel together | Grab at the presentation position; a pending tap settles correctly. Keyboard/reduced motion open immediately                                      |
| Direct drag | Drag anywhere in peek; expand or dismiss without a button label | 1:1 tracking after 8px vertical intent; expanded/peek resizing retains a real scroll viewport; below peek, translate the entire sheet towards closed   | Recent 80ms velocity, 160ms projection; multi-touch/cancel restores committed state. Direct tracking remains user-controlled under reduced motion |
| Settle      | Release above the dismissal boundary                                         | Bounded near-critical spring (stiffness 720, damping 48, mass 0.8), around 300ms depending on distance/velocity                                         | Re-grab/reverse immediately from current height. Reduced motion snaps                                                                             |
| Dismiss     | Drag fully down, outside tap or Close                                        | Whole-surface translate down, 220ms deceleration; keyboard/Escape immediate                                                                             | Preserve native modal until dismissal commits. Rejected discard prompt restores geometry and focus; pending unsaved drafts remain intact          |
| Read        | Scroll expanded content                                                      | Native momentum; 100ms scroll-top cooldown in directional-touch browsers                                                                                | A gesture starting as scroll remains scroll; WebKit keeps native body scrolling and uses grip/header for resize/dismiss                           |

The default peek is 60dvh with a 480px minimum bounded by the viewport, giving salary/overview content more room. Expanded height retains an 8px top gap. A visual grip replaces the Expand/Collapse words; its accessible button name, tap toggle, ArrowUp/ArrowDown and Close remain alternatives. Mobile comparison, close and bookmark targets are 44px. Labels in the bottom navigation stay on one line at 320px. The profile chooser is inside Filters; the main workspace retains a compact result count.

## Scrolling from peek

A partial sheet follows upward movement from every starting region. Release commits expansion after 20% of the remaining distance, or an upward flick with at least 32px travel and 600px/s recent speed. Smaller slow drags return to peek. These application-specific thresholds use the same rule for the grip, header, reading body and footer. During the initial contact, movement first increases sheet height; excess movement advances the content before the finger lifts. Reversal first undoes scrolling introduced by that contact, then lowers the sheet. Bounds discard unused travel so reversal never needs to retrace overshoot. A small bounded inertial continuation preserves reading speed after release (`power: 0.24`, `timeConstant: 240ms`); a new press, wheel, keyboard/reduced-motion change, cancellation or role change stops it. Subsequent settled expanded contacts use native scrolling. Reduced motion keeps direct manipulation and snaps on release without autonomous continuation.

This explicit first-contact handoff follows Apple's detent-then-content behavior. It is necessary because changing `touch-action` after a contact begins cannot turn that contact into a native scroll. Native reading is preserved on subsequent contacts, including WebKit. The existing Chromium directional top-edge policy remains an optional enhancement; it is not required for peek expansion or reading. The company identity now stays in one contiguous header region with the grip, toolbar, tabs and intervening space, giving reliable full-width dragging even while the body is scrolled.

Downward dragging from anywhere in peek lowers the sheet, including when content already has a scroll offset. Touch links and disclosures remain ordinary taps until 8px of vertical intent; editable controls and active selection are excluded. Dismissal uses 25% of peek height, or a downward flick with at least 32px travel, recent speed of 600px/s and a 160ms projection across that boundary. A deliberate upward reversal cancels dismissal even after pausing; 4px direction hysteresis filters touch noise. These values are app-specific starting points checked in recordings. Vaul's current source provides a useful 25% reference, not a platform requirement. Native scrolling that began in the expanded body is not converted into dismissal mid-contact.

The reading region includes footer actions, explanatory notes and bottom padding. Upward swipes there use the same expansion threshold, and excess movement in the same contact reads the body. A deliberate vertical drag suppresses its resulting click; ordinary taps still open documents, save a role or prepare a draft through existing safeguards. Partial and settling surfaces declare `pinch-zoom` before contact, retaining one-finger drag ownership even after small initial sideways drift. Native body scrolling becomes available once the expansion has settled and the contact ends. The dialog and backdrop contain scroll chaining; the backdrop establishes a non-scrollable scroll container. This follows the browser guidance without fixing the document body or changing its scroll position. Expanded body contacts retain their native scroll policy.

## Invariants and implementation

- Native `dialog.showModal()`, Escape/cancel/close, browser Back, shortlist position and focus restoration remain intact.
- Outside dismissal requires both contact start and click outside the sheet; a drag ending outside does not become a backdrop click.
- Pending presses settle through window pointer-up/cancel even if arrival changes their hit target. Active drag capture and native scrolling are retained.
- Delegating once at the dialog avoids double-consuming movement from nested header/company elements. Cancellation and a second pointer restore scrolling introduced by the contact and the committed detent.
- New presses clear prior drag click suppression before excluding interactive targets. Evidence links/toggles work after cancelled drags.
- Closing respects draft guards for pointer Close, backdrop, drag and native close; cancelling confirmation restores a visible modal and retained draft.
- Bookmark optimism/rollback, retries and submission safeguards are unchanged. Resize/dismiss never sends an application.
- Existing `motion@14.9.0` APIs/types are reused. No dependencies were installed. Whole-sheet arrival/dismissal use transforms; real height during resize is the existing measured exception that keeps native scrolling/footer geometry correct without scaling text or React renders on pointer moves.
- CSS and JavaScript honor reduced motion. Skeletons have no shimmer or artificial delay.
- Static Next.js export remains the production build; no private data enters source or fixtures.

## Verification

See [the task contract](../tasks/mobile-workspace/plan.md) and [verification record](../tasks/mobile-workspace/verification.md). Existing motion/browser suites cover rapid reversal, cancellation, focus, Back, failed saves/retry and reduced motion. New mobile acceptance covers live search, header tap during arrival, full/peek drag dismissal, outside taps, dirty-close cancellation, Chromium touch and optional installed WebKit. Recordings/screenshots live in ignored `output/playwright/mobile-workspace/`; they are local observations rather than physical iPhone measurements.

## Research

- [Apple: sheets](https://developer.apple.com/design/human-interface-guidelines/sheets?changes=_1_1) — detents, grabber, progressive disclosure, accessible tap alternative.
- [Apple: Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) — direct tracking, interruptibility and velocity continuity.
- [Apple: scrolling expands the sheet](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller/prefersscrollingexpandswhenscrolledtoedge) — upward scrolling first increases the detent, then scrolls content at the largest detent.
- [Emil Kowalski: Building a drawer component](https://emilkowal.ski/ui/building-a-drawer-component) — scroll-top ownership, a 100ms scroll cooldown, direct style updates; its 500ms animation is a reference, not a universal requirement.
- [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/) — native gesture arbitration through `touch-action`, capture and cancellation; changing touch policy after a gesture begins does not transfer ownership.
- [Chrome: prevent page scroll underneath a modal dialog](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/prevent-page-scroll-under-modal-dialog) — modal inertness does not itself lock background scrolling; contain chaining on the dialog and a scroll-container backdrop. Cross-engine verification remains necessary.
- [Vaul executable defaults](https://raw.githubusercontent.com/emilkowalski/vaul/main/src/constants.ts) — current 25% distance threshold, velocity reference and scroll cooldown; implementation defaults are not universal best values.
- [Motion: animate](https://motion.dev/docs/animate), [drag](https://motion.dev/docs/react-drag) — controlled springs, velocity, axis/constraints and interruption. Current documentation must be checked against the installed version.

The selected timing is an application-specific starting point, refined with recorded interaction and measured layout cost, rather than a claim that one duration is best for every sheet.

## Safari follow-up agreed on 7 November 2026

The owner reports that the gesture still fails on physical iPhone Safari. Prior Chromium native-touch and desktop WebKit mouse checks do not establish iPhone touch correctness.

The confirmed contract is direct finger tracking from anywhere inside the partially open details surface, including header, company, title, content, controls, footer and bottom padding. Use the same release rule for every starting region: snap fully open after about one-fifth of the remaining distance, or a quick upward flick; smaller drags return to the partial position. Ordinary taps retain their actions. Fully expanded content keeps native scrolling. Re-grabbing during arrival or settling must start from the visible position without waiting for an animation.

This contract supersedes the earlier region-dependent short-swipe release rule. Xcode native UI tests reproduced two inconsistencies in the released build: a slow 70-point grip drag returned to peek, while a slow 20-point body drag expanded fully. Both unchanged assertions pass with the shared release rule. The candidate also keeps drag ownership during settling and accepts upward intent after small initial sideways drift. This is implementation and Simulator evidence, rather than physical-device acceptance.

The owner then requested testing on this Mac so the physical phone remains available for normal use. The physical Safari automation session was ended successfully. Its incomplete native touch releases are an automation limitation and do not establish app correctness. Continue with Xcode native UI tests in the installed iPhone Simulator; distinguish that result from physical-device acceptance.
