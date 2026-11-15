# Card layout and interaction repair plan

Specification: [spec.md](spec.md). Status: [todo.md](todo.md).

Baseline: `dc8d63219033d4d7e002bdf309a64c9399caddeb`, the verified public release. Work in an isolated checkout and retain existing local changes elsewhere.

## Ordered work

1. **Reproduce and measure.** Exercise preview-only save/remove, delayed overlapping mutations and refreshes, failures, Undo, and final-company removal with fictional data. Record card presence, company identity/column, scroll/focus, and action results over time; retain short before recordings and meaningful failing regression checks.
2. **Refine card composition.** Reuse the existing title button, action controls, metadata, and CSS tokens. Put the title and vertical action rail at the top, move status into wrapping location metadata, and omit only the generic sponsorship reminder from previews. Inspect a representative desktop/mobile render early.
3. **Repair state and layout continuity.** Use the reproduced causes to correct mutation/refresh reconciliation, placement, focus, or motion lifecycle as necessary. Keep stable-board reset rules and legitimate failure/Undo behavior. Coordinate sequential edits to the large Discover component; avoid competing implementations.
4. **Verify and review.** Re-run the failing scenarios, compare before/after evidence, and test rapid, failed, reduced-motion and keyboard paths. Run the established frontend, Python, production-export browser and package checks proportional to the final change. Independent review must assess the resulting diff and evidence.
5. **Deliver both targets.** Push the reviewed shared change to `main` and follow the complete existing public-demo workflow to actual live verification. For the private installation, identify the current runtime and existing unpublished feature layer, export and restore a backup, test a candidate that preserves those capabilities, then perform and verify the authorized cutover. Keep the prior interpreter/build and backup available for recovery.

## Dependencies and evidence

The layout and reproduction lanes may proceed in parallel after the confirmed tag decision; edits to the same file are handed off sequentially. Regression tests follow the actual failure mechanism. Installed private compatibility must be established before replacing its runtime; a passing shared build alone is insufficient.

Screenshots establish composition. Recordings and frame/state measurements establish continuity. Physical device evidence is separate from browser emulation. Keep public fictional evidence in ignored `output/playwright/card-interactions/`; private operational evidence belongs in the machine-local recovery directory.

The public deployment gate and installed-workspace backup/restore requirements remain unchanged. No required check may be weakened to ship. Delivery is complete only when both actual targets show the intended behavior and preserve their data/workflows.
