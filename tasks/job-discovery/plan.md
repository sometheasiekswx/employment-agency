# Implementation plan

1. **Fetch and extract public content.** Reuse the pinned HTTPS fetcher and existing ATS normalization. Add documented feed adapters and use maintained HTML/XML and browser tooling for ordinary pages. Test structured details, parsing and pagination, and a real JavaScript page. Only use Firecrawl through the explicit per-run option.
2. **Run within a deadline.** Give local clients start, status and stop operations. Keep network work outside workspace writes, publish completed results incrementally, and discard cancelled or late results. Reuse workspace policy and ranking. Verify status, cache, deduplication, database preservation and deadline behavior with fixtures.
3. **Expose discovery in Search.** Reuse the existing controls, results links and workspace client. Show per-source coverage and progress alongside an import-ready shortlist and general-page evidence. Verify desktop and mobile workflows against a disposable workspace.
4. **Verify and prepare a release.** Check the agreed live sample and report coverage and timing. Run the Python, frontend and browser checks, review the change, and verify the packaged app. Build with a disposable workspace and record remaining provider or source limits.

The service owns import and deduplication so the agent and browser see the same records. Existing structured data and the workspace schema remain usable on open. The provider fallback is optional and can be disabled without data migration.

[Verification and release candidate](verification.md)
