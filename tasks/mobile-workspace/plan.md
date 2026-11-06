# Mobile Opportunities workspace

Scope: visible immediate search, genuine loading skeletons, native details sheet with a visual grip with bottom arrival, drag-to-dismiss and outside-tap dismissal. Preserve charcoal/lavender design, content, proportions, desktop browsing, native dialog/focus/Escape/Back, browser bookmarks, optimistic recovery, draft and submission guards. Reuse Motion 14.9.0 and existing components; no dependencies or private workspace changes.

Acceptance:

- Search is visible at 320/390px, filters while typing without Enter, clears accessibly, preserves URL/filter context and input focus without extra rank requests.
- Skeletons appear only for real initial loading, preserve geometry, announce once and respect reduced motion; refresh retains available results; failures retain retry.
- A compact grip replaces visible Expand/Collapse text. Keyboard/tap resize alternatives and Close remain available.
- Pointer opening slides from the bottom (~320ms spring, no overshoot); reduced-motion/keyboard paths remain immediate.
- Drag follows the finger; expanded/peek/closed destinations use recent velocity and position. Full downward drag closes; cancellation/reversal never leaves transient geometry or swallows the next tap.
- A genuine outside tap closes; drags ending outside do not accidentally click the backdrop. Native scrolling stays native and shortlist position/focus return correctly.
- Independent senior UX engineer uses actual mobile workflows and scores honestly with a stable rubric. Address actionable feedback and repeat until >=9/10, without coaching the score or weakening safeguards.

Plan:

1. Baseline browser review + official motion/scroll research.
2. Parallel visible live-search/skeleton slice and sheet interaction slice.
3. Focused regression tests, static export, mobile touch/WebKit and desktop checks, reduced motion, failure/retry and focus.
4. Independent mobile judge, iterate on concrete findings, final code review and release readiness.

Shipping boundary: local implementation and readiness. No commit/push/deploy in this request. Earlier releases remain unchanged.

Research: [Apple sheets](https://developer.apple.com/design/human-interface-guidelines/sheets?changes=_1_1), [drawer implementation and scroll cooldown](https://emilkowal.ski/ui/building-a-drawer-component), [Motion animate](https://motion.dev/docs/animate). Existing measured height resizing remains for accurate scroll viewport/footer geometry. Translate the whole surface for arrival and dismissal, without scaling controls. Keyboard and reduced motion snap immediately. Motion APIs checked against installed types.
