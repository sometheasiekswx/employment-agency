# Opportunity sheet gestures

The mobile Overview inspector keeps its native dialog, existing charcoal/lavender surfaces, content, two resting heights and persistent bottom actions. The title action uses the card's outer focus ring; the duplicate title outline is removed. Bookmark buttons retain their own focus indicator.

## Motion plan

This is an operate/read surface: use Jakub's production polish with Emil's input-frequency discipline. The focal interaction is the sheet following the hand, without changing the approved visual direction. There is no new page-load choreography or dependency.

| Transition      | Purpose and trigger                                                           | States/properties                                                            | Timing and interruption                                                                                                                                                                                                                                                                     | Reduced motion                                               |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Direct resize   | Drag the full-width 44px grabber; touch-drag collapsed noninteractive content | Existing half-height ↔ expanded height; actual sheet height, bottom anchored | No easing or delay after 8px direction/intent threshold; follows pointer 1:1, bounded to the two detents                                                                                                                                                                                    | Same directly controlled tracking; no automatic continuation |
| Settle          | Release a drag or tap the grabber                                             | Current rendered height → nearer projected detent                            | Near-critical Motion spring: stiffness 720, damping 48, mass 0.8; usually around 300ms, distance/velocity dependent. Projects the last 80ms of movement 160ms ahead. No overshoot; velocity capped at 2500px/s. A new drag stops it at its current height; a reversal retargets immediately | Immediate destination, no spring                             |
| Cancel          | Pointer cancellation, lost owner capture, multiple touches                    | Return to the committed detent                                               | Same bounded settle; stale callbacks cannot change a newer gesture. Transfer of implicit capture from a child does not cancel the drag                                                                                                                                                      | Immediate return                                             |
| Keyboard resize | Enter/Space toggle, ArrowUp expand, ArrowDown collapse                        | Destination height and expanded state                                        | Immediate; focus remains on the same grabber                                                                                                                                                                                                                                                | Immediate                                                    |
| Read content    | Swipe inside the expanded body                                                | Native scrolling; sheet stays expanded                                       | Browser momentum; a gesture starting below the top stays a scroll even after reaching the top                                                                                                                                                                                               | Native scrolling                                             |

Existing arrival, close, role-selection and bookmark feedback remain coordinated with these changes. Escape, native `cancel`/`close`, URL Back, shortlist position, focus restoration, error rollback, retry and draft/submission guards retain their existing behavior. Resizing never dismisses the inspector or submits an application.

## Scroll ownership

- The grabber is always a resize surface. Tap remains available for assistive technology and people who prefer buttons. A small static grip reinforces the affordance.
- Collapsed noninteractive content expands before scrolling. Interactive controls, links, selectable text with an existing selection and mouse text-selection gestures are excluded.
- In browsers supporting directional `touch-action`, expanded content at scroll position zero permits native scrolling down the content (finger up). A fresh finger-down gesture can collapse it. A 100ms cooldown after native scrolling prevents momentum at the top from unexpectedly resizing the sheet.
- Declare `touch-action` before contact. Never change ownership mid-gesture or implement artificial content momentum. Preserve pinch zoom and horizontal browser gestures.
- WebKit's installed build does not support directional `touch-action`. Expanded content therefore keeps unrestricted native vertical scrolling; use the grabber to collapse. This intentional fallback avoids taking over iPhone reading/scrolling. Grabber dragging, tap and keyboard resizing work in WebKit.

## Rendering and compatibility

Reuse the installed `motion@14.9.0` numeric `animate`, spring/velocity options and playback `stop`/`finished`, verified against its installed TypeScript declarations. Motion's documentation MCP was unavailable; consult the official web documentation instead. No new library or React modal wrapper is introduced.

Height is a deliberate, measured layout-animation exception here. Translating a full-height sheet below the viewport would move its footer offscreen or create a scroll viewport extending behind the actions. Scaling would distort text and controls. The implementation makes one bounded style write per animation frame, reads geometry at gesture/snap boundaries, and never renders React on pointer moves. The footer remains anchored and the body retains a correct native scroll viewport throughout. No global CSS variable cascade, blur or permanent `will-change` is added. Resize/orientation changes and unmount clear transient geometry.

Reduced-motion preferences and keyboard input cancel pending automatic motion immediately. Direct dragging remains an explicitly controlled interaction, followed by an instant snap. CSS also removes the grabber-chevron transition under reduced motion.

The Next.js build remains a static export. Tests and recordings use disposable fictional data, never a personal workspace.

## Evidence

`tests/motion-browser.cjs` exercises real Chromium touch input, scrolling ownership, mid-drag geometry/footer hit testing, short drags, cancellation, interruption, focus, Back, save failures/retry and reduced motion. It records desktop/mobile video and frame/layout observations under ignored `output/playwright/motion/`. Unit tests cover rapid retargeting, stale completion and instant keyboard resizing. Browser observations describe the tested machine; they are not physical iPhone performance measurements.

On 6 November 2026, typecheck, lint, 254 frontend tests, 163 Python tests, the full local/hosted browser suite, static export and the fictional public-preview checks passed. WebKit pointer dragging and native Escape passed separately. Short flicks use explicit native CDP input timestamps so automation/geometry-query delays cannot turn them into held drags. Live reduced-motion changes and viewport resizing also clear an unfinished height transition.

Ten transitions in the regular Chromium run used about 10.5ms of total layout time, with a 16.8ms p95 frame interval. A separate warmed-up 4× CPU slowdown simulation recorded 21.6ms of layout work across ten transitions and a 16.7ms p95 frame interval. These are local observations, not cross-device guarantees. The short review MP4 is encoded from lossless PNG browser frames at the original 390×844 proportions; screenshots, recordings and logs remain ignored local artifacts.

## Research

- [Apple: sheets](https://developer.apple.com/design/human-interface-guidelines/sheets?changes=_1_1) — detents, grabber, progressive disclosure, accessible tap alternative.
- [Apple: Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) — direct tracking, interruptibility and velocity continuity.
- [Emil Kowalski: Building a drawer component](https://emilkowal.ski/ui/building-a-drawer-component) — scroll-top ownership, a 100ms scroll cooldown, direct style updates; its 500ms animation is a reference, not a universal requirement.
- [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/) — native gesture arbitration through `touch-action`, capture and cancellation; changing touch policy after a gesture begins does not transfer ownership.
- [Motion: animate](https://motion.dev/docs/animate), [drag](https://motion.dev/docs/react-drag) — controlled springs, velocity, axis/constraints and interruption. Current documentation must be checked against the installed version.

The selected timing is an application-specific starting point, refined with recorded interaction and measured layout cost, rather than a claim that one duration is best for every sheet.
