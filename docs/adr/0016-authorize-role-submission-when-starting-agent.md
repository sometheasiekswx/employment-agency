---
status: accepted
---
# Authorize a role's submission when starting the agent

On 14 November 2026, the owner chose to make **Apply for me** authorize preparation and submission for the selected role when the user starts the connected agent. A routine final Send/Submit confirmation is no longer required. This supersedes [ADR 0005](0005-explicit-approval-for-external-application-actions.md): it trades inspection of every final form for fewer interruptions, while requiring the application to retain the user's bounded authorization and verify that each external action remains within it.

Marking **For my agent** records intention only. Starting selected roles from that queue authorizes only that selection; another saved role or later queue addition is not included. The agent follows role-specific instructions and otherwise tries the employer/job-board website, verified Telegram, then verified recruitment email. Missing facts, unresolved employer identity, access problems and uncertain submission outcomes require help rather than invented answers or blind retries.

The shared application must retain the authorized scope, exact documents and answers actually used, applicable company reservation and channel evidence. An uncertain outcome remains unresolved until checked. A connected agent's message alone does not establish Submitted. Keep credentials and sessions machine-local, preserve submitted snapshots, and retain self-apply and external-agent handoff when execution is unavailable. [Application journey specification](../../tasks/application-journey/spec.md)

This is an accepted product-design decision. It does not authorize a live application, connected-agent run, implementation or release during the specification interview. Earlier source behavior remains unchanged until the new flow is implemented and verified.

## To apply follow-up

Jobs and To apply combine the earlier recommendation/browse views and the earlier bookmark/agent-mark choices. Both pending choice APIs now set the same To apply membership. Starting the connected agent still authorizes only the explicitly selected roles.
