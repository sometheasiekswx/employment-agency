# Task records

These directories retain specifications, plans, reviews and verification receipts for individual changes. Each record describes its own date and scope. Earlier names, selectors, test counts, deployment states and approval policies may have been superseded by later work.

Use the [documentation index](../docs/README.md) for current setup and behavior, the [changelog](../CHANGELOG.md) for release boundaries and [architecture decisions](../docs/adr/) for policy changes. A checked task item or an accepted specification is not evidence that every current deployment contains it.

Test output under `output/`, private recovery files and local design-tool state are intentionally outside Git. Where a historical receipt names one, it is a local evidence location rather than a file guaranteed to exist in a fresh clone. Removed auxiliary worktrees were archived during [branch consolidation](branch-consolidation/README.md); old absolute paths in their original logs are historical capture paths.

Keep historical claims intact. When a current change supersedes them, add a dated pointer or pin a source/media link to the recorded commit instead of rewriting an old test result as a new one.
