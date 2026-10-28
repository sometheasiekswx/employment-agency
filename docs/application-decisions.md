# Application decisions and listing details

Agreed 29 October 2026: Active, Submitted and Rejected sections with counts; direct Reviewed, Reject and Submitted buttons; separate comment saving. Submitted implies review without a prerequisite click or confirmation dialog. File integrity checks and immutable submitted snapshots remain. Rejected packages can return to Active. No sending is added.

Display available location, work arrangement, advertised salary, posting/reposting/deadline, availability/last-check, generation/review/submission dates. Unknowns stay unknown; do not infer posting from generation or import dates. Preserve approximate wording. See GLOSSARY.md and ADR 0002 for durable records.

Implementation/verification order: backend transitions and comment semantics; metadata import; grouped UI; API regressions and browser actions at narrow/wide widths; review and release readiness. Existing data requires no destructive migration; old decision comments supply dates when available.

## Verification

36 unit/integration tests passed on macOS. The Chrome browser workflow exercised comment-only saving, rejection, return to Active, direct submission from Draft, submitted comment saving and persistence after reload. No page errors or horizontal overflow at 320/768/1024/1440 widths. Desktop screenshot inspected; exact dates display in workspace timezone, approximate text remains unchanged. JavaScript syntax and diff whitespace checks passed. Submitted integrity rejection and immutable status covered by API tests.

Local installation updated after a successful private-workspace export/restore check. Live read-only checks verified section counts and absence of status dropdowns; application records matched the recovery copy. Source changes remain uncommitted; no remote publication or employer submission occurred. Existing posted dates are unavailable and remain unknown. Cross-platform CI was not run for this change.
