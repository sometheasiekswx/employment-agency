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
