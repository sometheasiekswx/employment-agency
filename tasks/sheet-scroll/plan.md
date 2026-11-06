# Mobile sheet scrolling and filter cleanup

Work against b7241ce in the public app; leave the private career workspace and its installed build untouched. The user supplied an iPhone recording showing peek-body swipes returning to their original position. This pass is implementation, verification, independent review and release readiness; no commit, push or deployment is requested.

Acceptance:

- A deliberate upward body swipe from peek commits expansion, including short swipes. In the same uninterrupted contact, height is consumed first and remaining movement reads content; subsequent expanded contacts keep native scrolling.
- Reversal first undoes scrolling introduced by that contact, then lowers the sheet. Bounds do not accumulate dead travel. Cancellation/multi-touch restore committed geometry and cancel autonomous scrolling.
- Any deliberate downward peek-body drag, including one beginning on a disclosure/link, can lower/dismiss. Ordinary taps, text selection, editable controls and pinch zoom remain usable.
- One contiguous header drag region spans the grabber, toolbar, tabs/gaps and company identity. Its tap/keyboard controls remain available; company identity stays visible while reading.
- Dismiss at one quarter of peek height, or a downward flick of at least 32px and 600px/s recent velocity with projected travel across the boundary. Last deliberate upward reversal cancels dismissal, including after a pause. These are application choices to verify, not universal standards.
- Preserve charcoal/lavender style, card proportions, native dialogs, focus, Back/Escape, shortlist position, save rollback/retry, dirty guards and submission safeguards. Reduced motion uses direct manipulation and immediate settling, without autonomous momentum.
- Move the existing profile chooser into Filters, retain URL/profile/draft behavior and a compact accessible result count. Verify desktop/mobile and application access.

Build/verify:

1. Reproduce the supplied failure with native CDP touch against the unchanged export; retain the failing assertion.
2. Adapt the existing Pointer Events/Motion hook and native sheet composition. Reuse CSS, controls and Motion14.9.0; no dependency additions.
3. Run focused units/native-touch regressions, then lint/types/build, the existing full browser suite and public static-export checks. Inspect screenshots and short normal-motion recordings.
4. Independent source/mobile UX review; fix material findings and recheck. Finish with local preview/evidence and explicit release boundary.

Research:

- Apple prefersScrollingExpandsWhenScrolledToEdge: upward scrolling first expands detents, then reads at the largest detent. https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller/prefersscrollingexpandswhenscrolledtoedge
- W3C Pointer Events: touch-action changes during an active contact cannot transfer native ownership. Keep the initial peek stream owned and explicitly scroll its excess; native scrolling resumes on later contacts. https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property
- Vaul current source: 25% dismissal distance and velocity thresholds; do not equate its implementation defaults with universal best timing. https://raw.githubusercontent.com/emilkowalski/vaul/main/src/constants.ts
- Apple fluid interfaces: direct tracking, interruptibility, reversal and velocity continuity. https://developer.apple.com/videos/play/wwdc2018/803/
- Motion numeric/inertia APIs were checked against installed motion-dom14.9 types/source before use. https://motion.dev/docs/animate

## Footer and showcase follow-up

After publication of bad915b, the user reported swipes beginning below the company and on Prepare draft. The documented interview confirmed: while partially open, vertical swipes anywhere from the job title through footer buttons and bottom padding resize the sheet; taps retain their action. Fully expanded content keeps native scrolling. There are no open design decisions or new domain terms requiring a glossary/ADR.

The user authorized the fix, refreshed desktop/mobile README GIFs, review and push. The existing checked public-demo release remains the publication path; private workspaces and installed builds stay separate.

1. Preserve a native-touch baseline matrix covering title, body/disclosures, enabled and disabled footer controls, footer notes/padding and background scroll. Add a regression that fails on the omitted footer region.
2. Extend the existing dialog's delegated gesture ownership and predeclared touch policy to its footer. Retain same-contact reading, cancellation, rapid reversal, taps, focus, Back/Escape, draft guards and reduced motion. Contain modal/backdrop scroll chaining without changing page position.
3. Verify native Chromium touch with on-screen coordinates, scoped WebKit checks, desktop/mobile screenshots and recordings. Run units/lint/types/build plus existing browser/public-preview checks.
4. Refresh the existing fictional showcase captures after the verified export. Show single-contact expansion into reading, footer-origin expansion, native subsequent scrolling and drag-to-close. Keep lossless 2x sources, width-only display caps, correct aspect ratios and reduced-motion posters; inspect GitHub's rendered README.
5. Obtain an independent review, resolve material findings, commit/push named files, verify all CI gates and the exact live public-demo release. Record limitations without equating desktop WebKit with physical iPhone testing.

## Safari and Xcode follow-up

The user identified Safari and confirmed that a partial sheet follows a contact anywhere inside it, snapping fully open after roughly 20% of the remaining distance or a deliberate flick; smaller drags return to peek. This supersedes the earlier region-dependent short-swipe rule. Preserve native scrolling after settling, taps, cancellation, reversal and guarded dismissal. Small sideways drift must not permanently abandon subsequent upward intent.

The user requested Mac-based testing so their phone remains free. End physical-phone automation; use the installed Xcode iPhone Simulator with native Safari coordinate gestures, retaining baseline/candidate XCTest results and recordings. Keep Simulator results distinct from physical-device acceptance. Run focused browser regression plus existing motion/mobile acceptance, units, lint, types and static export; obtain an independent review before the already-authorized publication. Leave concurrent live-development/Tailscale work unstaged.
