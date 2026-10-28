---
status: accepted
---
# Store authoritative documents and durable records in the workspace

On 29 October 2026, the owner chose `applications/City/Company/Job/DD-MM-YYYY/`, with time subfolders for further generations on the same day, as the authoritative application document store. The UI opens those exact files, and regeneration preserves earlier versions. A second permanent working-package copy is unnecessary; this trades duplicate storage for a shared responsibility to preserve and validate the canonical files.

Confirmed career facts, search profiles, job evidence, review comments and application decisions belong in readable, versioned workspace files eligible for a user's private Git repository. Credentials, machine-specific permissions, locks and disposable caches stay outside Git and portable exports. The default workspace remains ignored by the public source repository. Git eligibility does not authorize automatic commits or publication.

The shared app offers create/open workspace setup, remembers the selected location and uses one active workspace per running instance. Switching is explicit and must not mix data between workspaces. This is the agreed target, not a claim that the existing storage or launcher has been migrated.
