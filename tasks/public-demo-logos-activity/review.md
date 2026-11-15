# Coordinator review

Release candidate approved after content, code, generated-artifact and browser review. Required CI and live verification remain part of the publication step.

## Scope and source

Reviewed the isolated branch based on `f848eac904b5980afc2b8cf160762cf5f55f7ad1`. The private workspace and the unrelated shared checkout are outside this change. The public résumé remains the previously approved redacted artifact. The owner also confirmed Australia-wide remote listings may count for Melbourne when their actual location remains visible.

## Resolved findings

- The New York Times Games platform advert explicitly requires five years operating high-traffic web/distributed systems. That tenure is not established by the public résumé. Replaced it with the official Elections Data Developer role, whose Python/cloud/data-delivery requirements are supported; R work and schedule requirements remain visible.
- Linktree Authentication explicitly requires previous high-traffic critical-path rollout work. Excluded it as a stretch and retained the distinct Operations Engineering Lead role, which matches the public operational systems, requirements, adoption and coaching work. Removed an unsupported “real-time Python pipelines” phrase from the Grow rationale.
- Confirmed Kraken is the energy software employer at kraken.tech, distinct from the cryptocurrency exchange. Only the correct company's official branding receipt is admitted.
- Rejected Airwallex's DOCS composite after visual inspection; technical retrieval success alone does not establish the right company mark.
- Existing visitor bookmarks must not be displaced by newly seeded Submitted/Removed/Active decisions. Those cohorts now use new employers; retained-role bookmark choices remain overridable. Regression verification is recorded with the implementation.
- The approved public résumé build still called its profile fictional in the shell. Both desktop and mobile now say “Public demo”; the production-CSP browser checks assert the visible labels.
- The first release attempt exposed a staging adapter gap: the new logo verifier received `text/html` for captured PNG files. The adapter now uses the captured filename's media type. Reviewed the regression proving valid PNG bytes stage unchanged and changed or missing assets reject before provider access. The approved 102-role artifact also passed offline staging preflight. The previous live deployment was independently confirmed unchanged.
- Vercel rejected the larger inline creation request with HTTP 400 after every platform check passed on `305e5e9`. Reviewed the replacement against the official file-upload and deployment APIs. It validates the public project and pending promotions first, uploads exact captured bytes with SHA-1 integrity headers in bounded batches, deduplicates identical files, and creates the deployment once from file references. It preserves the narrow token, deadline, fixed team/project, static configuration and promotion checks; known error codes are allowlisted and raw responses stay out of logs. Independently verified the exact CI artifact across the complete mocked provider boundary: 394 references, 379 unique uploads, maximum concurrency ten, one 44,638-byte creation request. Provider history showed no partial deployment from the rejected request. The exact HTTP 400 cause remains unconfirmed; no undocumented server size limit is asserted.

## Code review

Reviewed public-only admission, sample allocation, current-catalog browser migration, highlight regeneration, importer identity/provenance guards, release asset verification, and UI status handling. Isolated media fixtures and private initials fallbacks remain available. New logo support keeps byte/dimension/deadline bounds; validates a limited static SVG grammar; rejects external references, scripts, entities and unrestricted CSS; and runs rendering in a bounded subprocess. Explicit responsive-image selection accepts only a bounded same-host width-descriptor srcset candidate, preserving exact reviewed URLs and hashes. No production state migration is involved.

## Content review

Inspected all regional role summaries, requirements, evidence and selected public skill references. Independently read the higher-uncertainty primary content for New York, HSBC, NCS, Open Government Products, Linktree and Civica. Civica's hands-on manager role uses documented technical project-team leadership; formal engineer reporting relationships are not claimed. Framework-specific gaps remain candid in fit notes. Work rights and sponsorship remain unknown; the original listing location is retained.

## Final acceptance

Independently checked the successful shared completion receipt against all 39 employer names, 102 vacancies and the exact selected public profile; it reports ready with no blockers. Verified the catalog contains exactly three new employers in each of the seven destinations, and checked every normalized logo hash and the absence of orphan logo files. The approved résumé fingerprint remains `377160dca04d95678f6cc5d1d990e205e1012d9f1e3ae174f7925d3bf7aaf56c`.

Inspected the full 39-company contact sheet and the actual Jobs and Submitted screenshots in light and dark themes. Accepted the 72 Jobs / 10 To apply / 8 Active / 7 Submitted / 5 Removed split, with 36 New badges. Reviewed the generated-file privacy and membership audit and the passing verification record: 414 Python tests, 391 frontend tests, 111 release tests, normal and approved static builds, hosted/bootstrap checks and production-CSP browser acceptance. The final label correction also passed 37 focused frontend tests and both rebuilt browser scripts. All three platform test jobs passed for `bdc5718` in [Checks run 43708468597](https://github.com/sometheasiekswx/employment-agency/actions/runs/43708468597) and `305e5e9` in [Checks run 43709992924](https://github.com/sometheasiekswx/employment-agency/actions/runs/43709992924); their staging findings are addressed above. The follow-up revision must pass the normal pipeline before promotion. No unresolved review findings remain.

## Publication and recovery

Publish this isolated branch through the existing checked `main` workflow; the final commit and deployment result are identified by the Actions run and public `/release.json`. The coordinator will run the strict live verifier and browser acceptance against the promoted alias. Preserve the pre-release production deployment `dpl_H1m2CUTEVaJr7rZTQLaG4g5QHii4` (`employment-agency-demo-r25w8oo73-somethea-sieks-projects.vercel.app`, source `f848eac904b5980afc2b8cf160762cf5f55f7ad1`) for the documented recovery procedure. This release has no private workspace migration or install upgrade.
