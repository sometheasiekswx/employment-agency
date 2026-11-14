---
status: accepted
---
# Lead setup with a separate personal career workspace

On 14 November 2026, the owner chose a personal job-search workflow as the README's primary setup path, with a private workspace outside the public software checkout. Frontend live development is a secondary contributor workflow. This supersedes the onboarding emphasis in [ADR 0001](0001-shared-application-data-only-workspaces.md), which preferred the ignored workspace directory inside the checkout. Both locations remain supported; this changes guidance, not the storage contract or existing workspaces.

The separate location makes it easier to identify what should be backed up and what belongs in the public repository. It requires one explicit workspace path in startup commands. The README must carry that same path through initialization, startup and Codex gate setup, and explain the software/workspace distinction before the commands.

The owner also chose local macOS, Windows and Linux as the setup scope. Hosted deployment and live employer submissions remain documented optional integrations. An audit performed on macOS must distinguish executed tests from other-platform instructions or CI definitions; controlled submission fixtures do not establish live employer acceptance.
