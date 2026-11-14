# Implementation plan: first-time setup and complete workflow audit

Requirements: the owner's 14 November 2026 request to test a fresh GitHub clone with independent GPT-6.1 Sol agents, identify confusing setup and usage, fix findings, and repeat verification. Task status: [todo.md](todo.md). Evidence and coverage: [verification.md](verification.md).

## Approach

Use the public software repository with fictional career data and separate configuration, ports and workspaces. Preserve the owner's private workspace, installed build and existing local changes. The initial GitHub baseline is `5745b56d1c0f1f16800608d91af92bbbab447faa`. An independent new-user audit starts from the README without being primed with implementation findings. Separate agents inspect the Codex gate and existing feature contracts. Fix reproduced problems in an isolated candidate, then repeat the user journey and required checks.

Retain the current Next.js/Python/SQLite architecture and existing application/submission boundaries. Use the project's current tests and browser harness. Local fixtures establish application behavior without sending real applications or contacting employers. Preserve submitted documents and exact evidence; no migration of real data, release, push or deployment is part of this audit.

## Ordered slices

1. **A1 — Establish reproducible baseline and feature coverage.** No dependency. Read README, CONTRIBUTING, glossary, relevant ADRs, CI and existing tests. Run documented fresh setup, map each feature to contract/browser/manual evidence, and retain failures before fixes. Areas: task evidence only. Acceptance: baseline revision, environment, commands, independent findings and explicit untested integrations are recorded.
2. **A2 — Make Codex gate setup and failure behavior reliable.** Depends on A1's gate findings. Areas: gate installer/runtime, gate tests, agent documentation. Acceptance: empty and populated successful responses identify the exact workspace; failed/malformed/wrong-workspace responses block supported search/browser calls; setup preserves unrelated hooks; recovery and covered tool limitations are clear. Verification: isolated fake HTTP services, installer preservation tests, actual hook subprocess tests and current Codex contract inspection. Do not change live project hook trust or config.
3. **A3 — Make the first career workflow understandable.** Depends on A1's rendered new-user audit and any material user decisions. Areas: README, running-locally guide, career/settings/search/application UI and their tests only where findings justify it. Acceptance: a new user can choose a private workspace, import and confirm a master CV, enter locations, obtain/import roles, prepare documents, understand self-apply versus agent submission, and retain evidence using the instructions. Verification: repeat fresh setup and rendered synthetic journey; targeted regressions for behavior changes.
4. **A4 — Correct feature regressions and documentation gaps.** Depends on A1. Areas determined by reproduced failures, not speculative redesign. Acceptance: all discovered in-scope problems have a concrete correction or an explicit external limitation; backup/restore, installed-wheel behavior, public preview, optional connected channels and developer workflow are represented in the coverage matrix. Verification: focused reproduction followed by affected integration/browser checks.
5. **A5 — Repeat independent acceptance and integrate safely.** Depends on A2–A4. Run the independent reviewer through the revised README/candidate, obtain another adversarial gate review, and repeat checks affected by changes. Run required frontend/Python/build and relevant browser/wheel checks on the final candidate. Copy only the verified task changes into the shared checkout after checking for concurrent edits. Acceptance: no remaining reproduced setup or usage blocker; every feature's evidence and limits are documented. Do not equate absence of reviewer findings with proof that no future user can be confused.

## Evidence checkpoints and recovery

- Preserve initial observations before implementation; keep test failures distinct from environment/dependency problems.
- Codex hook matching, hosted search bypass, timeout semantics and arbitrary-code wrappers are important boundaries. Document what is enforced instead of promising a network sandbox.
- Resume import extraction and user confirmation are distinct; document formats and required follow-up rather than silently asserting facts.
- The owner accepted personal-workspace-first onboarding and local-platform scope. ADR 0017 records those decisions and supersedes only the old onboarding emphasis; no remaining material design choice blocks these fixes.
- Existing agent submission authorization is governed by ADR 0016. This audit uses local fixture destinations only.
- Execute available macOS checks and clearly distinguish Windows/Linux CI definitions from checks executed here. Real OAuth/accounts, physical phones and employer-site acceptance require their own evidence.
- Recovery: all audit state is disposable; retain before/after test evidence and original local gate-file hashes. No real workspace upgrade or rollback is needed.
