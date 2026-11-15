# Public demo logos and activity — implementation plan

Spec: [agreed requirements](spec.md). Task status: [todo](todo.md).

## Approach

Work on `codex/public-demo-logos-and-activity` in the clean existing demo worktree, based on current main/live `f848eac`. Preserve the unrelated original shared checkout and private workspace. Reuse the shared research/import/export and logo operations; do not publish manually trusted or synthetic company marks. No new framework, private code fork or runtime feed is needed.

The coordinator owns planning, independent review and release. Authorized GPT-6.1 Sol agents build the regional research datasets and implementation, then test it. Regional data edits are disjoint; only the implementation owner edits shared product/exporter files. Read the live private company-avoid gate and run company-research-check before targeting employers; only public data and the approved public profile enter the isolated research workspace.

## Ordered slices

1. **R — Verified regional content.** Three regional researchers own Americas (New York/Toronto), Europe (London/Berlin), and Asia-Pacific (Singapore/Melbourne/China). Each supplies three new, globally unique employers per destination, at least three credible roles each, and a shared-operation-accepted official logo. Retry old missing logos in their region. Preserve source evidence, exclusions, coverage and two-pick reasons. Use the existing research JSON shape. Validate before accepting a company; never pad counts or invent facts.
2. **E — Enforce the public catalog contract.** Adapt importer validation for the new addition/minimum requirements without arbitrary old seven-role caps. Reuse approved source/profile inputs and shared comparison operations in an isolated workspace. Reject incomplete additions or missing-logo publication; preserve exclusions for browser migration. Produce and retain a successful completion receipt covering the final catalog.
3. **A — Seed realistic sample activity.** Separate fictional capture seed from public showcase seed. Seed reproducible New/seen, To apply, Active, Submitted and Removed examples on included companies, through shared operations and respecting company slots. Regenerate sample packages using existing redacted-profile publication. Prune excluded companies and references from public JSON/assets/history and browser persistence, while preserving visitor actions on included roles.
4. **V — Verify and review.** Sol runs relevant unit/integration/type/lint/build/browser tests with desktop/mobile, light/dark, every logo, old storage migration, sample labels, queue counts, highlights, resume/drafts and public privacy boundaries. Coordinator reviews the exact diff, research evidence and rendered outcome, returns blocking findings to Sol and checks the fixes. Reuse applicable passing evidence.
5. **S — Publish and verify.** Update demo documentation and record included/excluded counts and evidence. Commit only this scope and publish via the established main Checks/static release path. Observe full required CI and exact deployed SHA, run the existing live verifier and inspect critical demo behavior. Preserve previous live release for rollback. No private install upgrade or database migration.

## Evidence checkpoints and risks

- Logo availability and three credible local roles are admission requirements, not assumptions. Check logos early; report unresolved deficits rather than silently admitting fallbacks or stretch roles.
- Official logo extraction has strict bounded formats and provenance rules. Reuse them; do not disable validation to make an asset pass. Any necessary reusable parser support needs focused security/regression review.
- Existing visitor persistence can resurrect excluded roles. Test actual stored entries from the baseline.
- Application states may overlap in normal workflows. Seed disjoint initial cohorts for the agreed approximate mix and check actual UI counts while preserving normal semantics.
- Public matching must use the approved redacted résumé fingerprint; private supplemental details must not leak into sources, tests or receipts.
