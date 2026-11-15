# Consolidate Employment Agency development work

The owner requested review, publication to main, and pruning of unused branches and worktrees on 16 November 2026. This authorizes publishing the previously private-installed company-highlight feature, subject to integration review and the existing release checks.

## Decisions

- Retain the current main card layout, transparent logos, stable board ordering, save-receipt reconciliation and public-demo release workflow.
- Integrate the unpublished required-company-highlights feature: current/missing/stale review status, evidence-backed pairs, scoped research completion, protected API/CLI behavior and agent guidance. Preserve the existing research-assessment input contract.
- Adapt the public catalog builder to the changed comparison/projection interfaces and verify the reviewed demo catalog. Do not transplant the older Discover implementation over the current UI.
- Discard duplicate working copies of the already-shipped board changes after preserving the original bytes and verifying the integrated result.
- Review historical stashes and retain their recoverable contents outside the active checkout before retiring superseded entries.
- Keep career documents, application decisions, installation metadata and any private backup commit in the private workspace repository. No private career records belong in this public source tree.

At inventory time, the three auxiliary worktrees and every local branch had no committed work ahead of main `478173a7bb33e24cdac929f8c58ea94032fea070`. The primary checkout held the unpublished feature mixed with duplicate board changes. A verified source-file archive, binary patch and Git bundle preserve that starting point.

## Verification and delivery

Review the integrated source, exercise current/missing/stale highlights and completion failure paths, and verify the public catalog using the new interfaces. Run the frontend checks, Python suite, production builds, relevant browser acceptance and installed-package checks. Follow the existing exact-commit public-demo deployment workflow and verify the actual release marker and target.

Remove an auxiliary worktree only after its intended source is on main and valuable ignored evidence/configuration is preserved. Remove local branches only after their commits are reachable from main or their superseded content is captured in the recovery archive. Recheck working-file hashes and process ownership before clearing the old primary checkout, then place that checkout on current main. The private installed runtime is independent of these source worktrees and must remain available.

Final deployment and cleanup evidence is recorded locally after these operations, so this preparation record does not itself claim successful release or pruning.

## Integrated review result

The unchanged port broke the public catalog's listing-inventory call and would have put a picks/status tuple where the demo expects a picks list. It also tightened previously accepted empty or repeated inputs to preliminary research assessment. The integrated change fixes these callers, uses the shared distinct-vacancy grouping while retaining the reviewed listing, excludes private review-status projection from public bundles, and keeps assessment compatible while finalization remains strict.

The current source passed 395 frontend tests, 423 Python tests, typecheck, lint, production builds, focused highlight/SQLite/board/card browser checks, both public-preview browser workflows and installed-wheel verification. Review found no remaining actionable issue in the port. Physical-device behavior was not newly tested.

The three historical stashes contain superseded versions of shipped features and two unpublished design/handover documents. Their complete working, index and untracked trees were captured in an independent bundle, restored into a fresh bare repository and verified with Git fsck before retirement. Old board files in the primary checkout were matched to main or earlier published versions; their two differing task documents predate the recorded release.
