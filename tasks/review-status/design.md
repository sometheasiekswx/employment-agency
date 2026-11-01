# Review toggle: corrected design

Status: design confirmed, implemented and locally verified, 2 November 2026. The owner explicitly confirmed the actual bell and full demo motion after the documented clarification round. This supersedes the previous fixed-looking, one-way implementation. See [the corrected verification](bell-toggle-verification.md).

## Accepted requirements

- Use the actual React Bits [Bell Toggle](https://reactbits.dev/c/micro/bell-toggle) as the component to adapt, not a fixed-looking status button loosely inspired by it.
- Clicking the active application's review control switches **Draft ↔ Reviewed**. Both directions must be available and persist through the existing application service.
- Preserve the reference's visibly expanding and contracting pill and its label transition. A fixed-looking equal-width surface does not meet the brief.
- Movement is an intended part of the premium feel. Keep the reference's authored motion instead of stripping it down because this is a productivity interface. Impeccable leads; compatible layout, polish and motion guidance support the owner's pinned reference.
- Preserve the site's existing brand and the current comment, document-integrity, error/retry and version-history workflows. Submitted snapshots retain their existing immutable boundary.
- Implement shared software in employment-agency; do not modify private career files or copy them into public source, tests or evidence.

The domain term [Review status](../../GLOSSARY.md) records the reversible decision. This is a small, reversible UI choice, so no architecture decision record is warranted.

## Reference facts

The official component measures the two labels, reserves the longest label's layout space, and animates a right-side clip so the **visible pill** grows and shrinks. That reserved layout space does not justify rendering a visibly fixed-width pill. Use the source behavior, including its interruptible spring and input/reduced-motion handling.

The existing upstream source attribution and licence remain in `frontend/public/licenses/react-bits-bell-toggle.txt`.

## Confirmed reference detail

The owner chose to retain the reference's bell, ringing animation, expanding/contracting pill and label transitions, with Draft/Reviewed labels and the site's colours. Clicking or tapping switches either way; hovering never saves. The documented interview is complete and implementation is authorized by the original correction plus this confirmation.

Use the source's spring and bell/wave motion, not the earlier stripped-down treatment. Notification counts in the reference demo are demonstration data and do not become invented application metrics. Respect keyboard and system reduced-motion behavior. Keep current comments and server validation: after a successful save, the controlled toggle follows the persisted review status; failures retain the previous status and comment for retry.

Verify both directions, actual visible pill sizing, the bell/waves, motion interruption, persistence, failures and keyboard/touch paths using fictional data. These are implementation checks, not additional design questions.
