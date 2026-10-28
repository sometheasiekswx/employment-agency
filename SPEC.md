> Version 0.2 workspace architecture is specified and verified in [the workspace refactor](docs/workspace-refactor.md). The original release contract below remains historical context.

# Employment Agency 0.1

A local browser application for individuals to retain confirmed career facts, search with multiple profiles, and prepare job-specific documents for manual submission. Local storage is not a claim of offline AI processing.

## Acceptance contract
1. PDF, DOCX, plain text and LaTeX imports yield unconfirmed candidate facts with provenance. Users edit, associate, confirm and retire facts. Only confirmed facts enter documents; conflicting values are visible and unresolved conflicts block affected facts.
2. Multiple search profiles separate required filters from preferences, minimum compensation from expectations, and unknown eligibility from confirmed conflicts.
3. Manual adverts and URLs plus Greenhouse/Lever public-board discovery and agent-imported results retain sources and timestamps. Unsupported, blocked and failed sources are visible. No universal coverage claim.
4. Bounded runs discover, rank and generate with progress, cancellation and restart/resume. Confirmed conflicts are excluded; uncertain and stretch roles are explicit. No weak-match padding.
5. Templates produce editable DOCX and PDF resumes and cover letters, plus safe LaTeX source with optional local compilation. Outputs retain source fact IDs, immutable versions and review state. EML attachments match generated PDFs. No send capability.
6. Optional OpenAI requests require scoped consent and approved conservative budgets. Credentials are environment-only, never exported. Agent handoffs use the same validated fact-ID contract. Provider output cannot introduce career claims.
7. Local loopback UI enforces host/origin/token boundaries. Untrusted adverts and imported documents never execute instructions. Downloads are allowlisted; outbound URL retrieval prevents private-address requests.
8. Workspace export/restore validates checksums, paths and limits; upgrades snapshot before schema migration. Submitted versions stay immutable.
9. Public repository and history contain only reusable code and fictional examples. MIT original code; dependency licences documented. Private workspace is a pinned-release consumer.

## Non-goals
Hosted accounts, native installers, automatic applications, unattended schedules, universal job-board scraping, exact reproduction of arbitrary input layouts, and guaranteed ATS scores. Scanned PDFs require text/OCR supplied by the user; no silent successful empty import.

## Interfaces and verification
Python package with file-backed JSON transactions and immutable package directories; HTTP UI and CLI share service operations. Source adapters → normalized jobs → evidence matching → confirmed-fact selection → document generation. Optional provider selects IDs, never supplies factual prose. Run `python -m unittest discover -s tests -v`; browser checks use externally available Playwright. Network and paid-provider tests are separately disclosed. No paid calls in CI.
