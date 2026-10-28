---
status: accepted
---
# One shared application with data-only workspaces

On 29 October 2026, the owner confirmed that employment-agency owns all reusable UI, rendering, discovery, storage and application logic. Personal workspaces hold master resumes, supplementary career information, research, preferences, document templates, generated files and decision history, but no executable application plugins or private UI forks. This prevents useful capabilities from existing only in a particular user's installation.

A normal source installation defaults to an ignored `workspace/` directory inside the checkout; setup also allows an external workspace. User information must never enter the public source repository's Git history or distribution. Existing external workspaces remain a supported use case.

These are agreed target boundaries, not a claim of completed migration. Package storage, durable decision records, workspace selection and migration details are still being clarified. This decision does not authorize publication or automatic submission.

Follow-up: [ADR 0002](0002-authoritative-workspace-files.md) records the subsequently agreed document-storage, durable-record and workspace-selection boundaries. Migration details remain under discussion.

Subsequent clarification: the ordinary setup should emphasise keeping software and personal data together on disk, using the ignored `workspace/` folder. Choosing another folder is a discoverable secondary option, not the main onboarding path. Master-resume change detection follows the selected workspace, whether internal or external; this does not require committing personal data to the public source repository. [ADR 0003](0003-reconcile-edits-and-preserve-migration-history.md) records the settled migration and external-edit behaviour.
