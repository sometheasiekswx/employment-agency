# Bell Toggle correction

Verified locally on macOS, 2 November 2026. The owner rejected the previous visibly fixed-width, one-way treatment and confirmed the [corrected design](design.md): actual bell and full reference motion, expanding/contracting pill, Draft ↔ Reviewed, and the site's colours. The documented interview is complete; [Review status](../../GLOSSARY.md) records the agreed domain meaning. No new ADR is warranted for this reversible UI choice.

## Implemented behavior

The app now uses a close port of the actual [React Bits Bell Toggle](https://reactbits.dev/c/micro/bell-toggle), not the earlier label-only approximation. Its source lives separately in `frontend/src/features/applications/bell-toggle.tsx` and `bell-toggle.css`; `review-status.tsx` supplies the application labels, colours, persisted state and native form association.

- The bell remains present. Pointer activation of Reviewed starts the reference's 17° decaying ring, five passes and 820ms duration, with its waves.
- The visible pill expands for Reviewed and contracts for Draft, using the original measured-label clip mechanism and 0.3s, zero-bounce spring. Both directions work, including interruption and repeated round trips.
- Labels retain the reference's 200ms crossfade and 2px blur. Hover only tints the fill; it does not save or switch labels.
- The source keyboard path jumps the clip and avoids a new bell ring. System reduced motion also suppresses spatial motion and blur. These accessibility paths do not reduce the normal pointer interaction requested by the owner.
- Both states remain actionable. The next native submitter value is Reviewed or Draft as appropriate, so the existing form saves the correct card's current comment and decision. During a request, repeated/conflicting saves are blocked and the prior persisted state remains visible. Errors preserve that state and the comment for retry.
- Submitted and rejected remain noninteractive tags, with the existing separate decision workflows and immutable submitted snapshots preserved.

The official source reserves the longest label's layout width while changing the visible pill with clipping. Tests measure **visible width**, rather than incorrectly treating the reserved wrapper rectangle as proof that the pill did not resize.

## Source adaptations

The official source was verified against GitHub commit `4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4`. The existing Lucide Bell uses the source's icon slot; no Hugeicons or other dependencies were installed. The full upstream notice remains in `frontend/public/licenses/react-bits-bell-toggle.txt`.

Application-specific additions are limited to native button props, a busy guard, controlled persistence and accessible focus. A wrapper focus ring follows the visible clip, because clipping the original button would otherwise hide its outline. Press feedback uses the site's 0.96 scale once, avoiding a second inherited button transform. Measurements and animation cleanup handle resize, font readiness, unmount and reduced-motion changes. The reference demo's simulated notification counts were not copied into application data; the optional badge is disabled.

## Checks and evidence

| Check | Observed result |
| --- | --- |
| `npm --prefix frontend test` | **40 passed** across 8 files, including 10 card tests for both directions, comments, failure/retry, concurrency and native form ownership |
| `npm --prefix frontend run lint` | **Pass** |
| `npm --prefix frontend run typecheck` | **Pass** in an isolated source tree |
| `npm --prefix frontend run build` | **Pass**, final source exported and packaged without rebuilding/stopping the live Next.js development cache |
| `tests/review-tag-browser.cjs`, fresh fictional queue | **Pass**: actual bell/waves/rotation; visible expansion/contraction; repeated persisted round trips; comment saves; pending/failure/retry/duplicate guards; keyboard/touch; immutable statuses/PDF bytes |
| Three viewport checks | **Pass** at 390, 768 and 1440px: 44px control, 22px radius, readable labels, no overflow, changed-header axe checks |
| Motion inspection | **Pass**: inspected native browser video and extracted frames showing Draft → expanded/ringing Reviewed → contracted Draft; reduced-motion and keyboard behavior checked separately |
| Independent review | **Approve for corrected scope**; 10 card tests independently passed; source compared with reference and fresh screenshots/video inspected |
| Running development app on port 3000 | **Pass**, read-only fresh Chrome check: actual Bell controls/waves present, separate Reviewed action absent, no browser errors; no personal status/comment/delivery mutation |
| `git diff --check` | **Pass** |

Mechanical Impeccable detection reports one advisory for the upstream optional badge's bounce curve. The badge is not rendered in this application. The source is retained, and the owner's explicit motion reference takes precedence over a generic advisory. The actual pill spring remains the source's zero-bounce spring.

Existing whole-page accessibility failures on the user's white-on-blue Apply For Me and white-on-bright-green Submitted controls remain outside this correction. Their findings and ratios are retained in [the earlier report](verification.md#broader-accessibility-failures). They are not suppressed, and this report does not claim the full application or remote CI is green. No backend implementation changed in this correction.

## Interface-polish review

Mode: full within the corrected review-toggle scope. Impeccable leads; Taste supplies compatible app grouping, polish supplies state/target checks, and motion guidance supports the owner's pinned expressive reference. The inherited palette and typography remain in place.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Draft/Reviewed labels at three widths, busy and failure states | Source label stack and readable site type retained |
| Surfaces | Draft/Reviewed fills, clipped pill, 44px target and keyboard focus | Visible size changes match the source; focus remains visible |
| Animations | Clip spring, ring/waves, native recording, repeated reversals and reduced motion | Original authored motion retained; no fixed-looking fallback in normal operation |
| Icons | Actual ringing Bell, waves, no notification badge | Existing icon family; no artificial application counts |
| Performance | Measured label widths, source Motion values, cleanup and build | No new dependencies or layout-width animation; one bounded interaction |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `review-status.tsx` | Reviewed permanently disabled the tag | Both Draft and Reviewed submit the opposite state | Meets the confirmed reversible status decision |
| MEDIUM | `bell-toggle.tsx`, `bell-toggle.css` | Fixed-looking surface and a label-only crossfade | Actual source clip spring, growing/shrinking pill, ringing bell and waves | Follows the requested demo and premium-motion direction |
| MEDIUM | `bell-toggle.css` | Upstream clipping would hide the native focus outline | Visible wrapper ring tracks the clipped pill | Keeps keyboard focus clear while retaining the requested shape animation |

Considered but rejected: retaining the equal-width visible tag (explicitly rejected by the owner); stripping ringing/waves for productivity-tool restraint (the explicit reference wins); introducing fake notification counts (not career data); replacing the source with a new custom width-animation engine (unnecessary and less faithful).

Verdict: **Approve for the corrected requested scope.** Existing unrelated whole-page contrast failures remain disclosed. Remote CI/deployment and Windows/browser-platform coverage beyond the local checks were not established.

## Reviewable artifacts

All visual evidence uses fictional candidate/job fixture data:

- [Actual motion GIF](../../output/playwright/review-tag/bell-toggle/bell-toggle.gif): 768×250, 3.25 seconds, converted from native browser frames.
- [Native video](../../output/playwright/review-tag/bell-toggle/bell-toggle.webm).
- `output/playwright/review-tag/bell-toggle/draft-{390,768,1440}.png` plus `reviewed.png`, `saving.png`, `failure.png`, `touch.png`, `reduced-motion.png`.
- `/tmp/ea-bell-toggle-browser.log`, `ea-bell-toggle-unit.log`, `ea-bell-toggle-build.log`, `ea-bell-toggle-lint.log`, `ea-bell-toggle-detector.json`.

The earlier `output/playwright/review-tag/` captures describe the superseded implementation; the nested `bell-toggle/` folder is the fresh evidence. The running development app picks up the source change through Fast Refresh. Changes remain local, with no private workspace migration, commit, push or deployment.
