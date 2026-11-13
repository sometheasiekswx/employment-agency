---
status: accepted
---
# Use active cooldowns for company research

The owner chose to exclude employers while their SQLite-backed company cooldown is active. A second distinct confirmed submission starts the pause, an additional submission during the pause moves the deadline, and expiry opens two new slots. This lets the agent prefer first-time employers while still using eligible past employers when needed to find five companies.

Compute deadlines from the actual submission time in the workspace timezone. Use local midnight for older date-only evidence and label it as assumed. Keep the recorded evidence intact. The company limit controls selection and submission, so the research result can include every eligible vacancy for review. [Research and company policy](../../tasks/sqlite-workspace/spec.md#employers-to-skip-in-agent-research)
