# Copy agent instructions and simplify To apply

Requirements: current owner request and supplied Jobs/To apply screenshots. This small change reuses those requirements as its specification. Task status: [todo.md](todo.md).

## Outcome

- To apply uses the same unboxed instruction row, button, spacing, typography, and scope text treatment as Jobs.
- Remove the To apply Select/Done/Clear selection controls, role-selection checkboxes, and temporary selection state. The instructions always cover the complete pending queue, including roles outside the current page or filter.
- Both Copy agent instructions controls directly copy the current generated prompt. A successful click must not open an editor/dialog, navigate, clear a choice, create a run, prepare an application, reserve a slot, or submit anything. Read-only handoff retrieval and accessible copy feedback are expected.
- Preserve workspace/profile/scope freshness checks, empty-queue handling, actionable blocker errors, retry, and manual-copy fallback when clipboard access fails. Display prompt fallback with the same shared presentation in both sections.
- Keep the existing per-role connected-agent entry points and existing-run progress controls. Removing bulk selection must not silently start a whole-queue agent or remove controls needed to stop or resume existing work.

## Approach

Start from `f444311311e07eded83c689e0d76b4568770d065`, the installed source revision and verified remote main on inspection. Use this isolated shared-code worktree; preserve other checkouts and all private workspace changes. Reuse `CopyAgentInstructions`, existing handoff operations, and established styling. Remove obsolete bulk-selection plumbing rather than retaining unreachable controls. No backend schema or career-data changes are expected.

Likely files: `frontend/src/features/discover/agent-instructions.tsx`, `agent-queue.tsx`, `discover-page.tsx`, relevant styles, existing component/browser workflow tests, and current behavior documentation. Use fictional fixtures and keep private records and screenshots outside the public source tree.

## Ordered work

1. **CI-01 Build and focused verification (GPT-6.1 Sol).** Implement the complete behavior above, updating meaningful regressions for successful copy, denied clipboard, blockers/stale responses, absence of selection, all-pending scope across filters/pages, and no agent-start side effect. Confirm the new row visually in the production export at desktop and mobile widths. Preserve unrelated features and existing error handling.
2. **CI-02 Independent review (GPT-6.1 Sol).** Review the actual diff and evidence for correctness, scope, accessibility, browser clipboard behavior, and preserved agent-run controls. Fix in-scope findings and recheck affected behavior. Reuse still-applicable passing evidence.
3. **CI-03 Ship preparation (GPT-6.1 Sol).** Run required local frontend checks (typecheck, lint, Vitest, production build), relevant production browser workflows, and the repository's Python checks when packaging. Prepare a wheel and verify its installation outside the checkout, with recoverable upgrade instructions and exact source/artifact hashes. Report actual pass/fail/not-run status.

## Release boundary and risks

The current request enables shipping, with readiness as the default under the invoked auto skill. Finish concrete release preparation before resolving any missing target/action authorization. Publishing shared main also deploys the public demo; replacing the private installed build requires an explicit upgrade plus backup/restore/migration checks. Prior task documents describe earlier authorizations and do not authorize a new release. No employer actions, private Git publishing, or live data mutations belong to this change.

Clipboard access is browser/permission dependent; avoid success claims before the browser accepts the write and retain a usable fallback. A pending read must not copy instructions after its workspace/profile/queue context has changed. Current scope labels must represent the whole pending queue, even with a company filter or pagination.
