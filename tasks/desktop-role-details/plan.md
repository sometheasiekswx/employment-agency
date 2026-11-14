# Desktop role details

Requirements: confirmed desktop layout and removal-feedback decisions, 14 November 2026.
Task list: [todo.md](todo.md).

## Outcome and boundaries

Opening a role on desktop must immediately expose a useful reading area without first scrolling the page. Use a tall right-side pane near the viewport top, with the role title and details in one scrolling area and a compact pinned action row. Keep the opportunity list available. Preserve the existing mobile sheet, navigation, document guards and application actions.

Show the marked queue action as **To apply** with a filled bookmark; keep the accessible removal action explicit. **Prepare application** must remain readable, and adjacent actions must fit without collisions or uneven accidental wrapping.

Successful removal feedback dismisses after eight seconds. Pause dismissal while hovered, keyboard-focused or editing a reason. Pending operations and failures must retain their recovery controls. Dismiss only the notice, never a reason draft or the removal record. Users can still restore a role and edit its reason from Removed after the notice expires. Put desktop feedback outside the details reading area so it cannot collapse that area.

Reuse the existing React, CSS, removal state and Playwright infrastructure. No new dependency, schema migration, employer interaction or private career-data change is required. The user's request authorizes a scoped source commit/push and a local preview. The installed private workspace remains pinned until an explicit upgrade.

## Approach and tradeoffs

The current pane inherits the space below page controls; its non-scrolling heading, action row and notice can consume almost all of that space. The new desktop pane uses viewport height and reserves its horizontal space so it does not cover list or page controls. The title scrolls with content to keep fixed chrome small. This uses more of the right side, in exchange for immediate access to details. Compacting the existing short pane alone and retaining the full queue-removal label were considered and rejected by the user.

Work on `codex/desktop-role-details`, isolated from the existing dirty checkout and based on published `main` (`584e012`). Use fictional fixture data for all captures and traces. Keep evidence in `output/playwright/desktop-role-details/`; record results and reproduction commands in this task directory.

## Ordered slices

1. **Reproduce before editing.** Build the unchanged baseline and exercise the desktop inspector with long fictional role/company labels, To apply selected, and a removal notice. Capture the initial unscrolled viewport, crowded buttons and the notice persisting beyond eight seconds. Record viewport, body/panel/action bounds and source revision. Prove the reported failure before changing product code.
2. **Make desktop details readable.** Adjust inspector structure and desktop layout, keeping toolbar and actions compact, title/content scrollable, and page controls/list reachable. Preserve desktop nonmodal behavior and mobile modal/gesture behavior. Move preparation guidance into scrolling content if necessary. Verify standard and short desktop windows, long text, zoom, opening/closing and role changes.
3. **Make removal feedback transient and safe.** Add lifecycle-safe eight-second dismissal with interaction/editing pauses, correct ownership across rapid removals, and persistent pending/error states. Keep notice placement from shrinking desktop details. Add focused behavioral timer tests; verify Undo, later reasons, retries and drafts.
4. **Verify the complete result.** Capture matching after screenshots and measurements. Run typecheck, lint, unit tests and production build, then relevant layout, opportunity/removal, motion and sheet browser suites using disposable fixtures. Check 320, 390, 768, 1024 and 1440 widths, either side of 900/1000 breakpoints, a short desktop viewport and 200% text. Use Chromium and WebKit when installed; distinguish emulation from physical Safari.
5. **Review and deliver.** Review the scoped diff and evidence, fix any in-scope blockers and recheck affected behavior. Commit/push only this task's files. Provide the commit/branch and a running local fictional preview for user testing; do not imply that the private installed build or public demo has changed.

## Evidence checkpoints and risks

- Before capture is a prerequisite for product edits; after captures must use matching scenario and viewport.
- Test actual geometry and reachable content, not only class names. Keep existing meaningful checks intact.
- Desktop positioning must not cover the list, navigation, page controls, notices or accessible focus targets, including after resize/scroll.
- Countdown ownership must survive role changes and rerenders; later removals must not be dismissed by an earlier timer. Do not lose focus or an unsaved reason.
- Mobile feedback stays within the active native dialog. Preserve sheet scrolling, footer gestures, keyboard dismissal, focus return and reduced motion.
- No migration is needed. Source rollback is the preceding commit; the private installation is unchanged.

There are no unresolved product decisions. Live installation and public deployment are outside this delivery scope.
