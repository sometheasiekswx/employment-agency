# Required company highlights

## Outcome and agreed scope

On 15 November 2026 the owner confirmed that the shared research workflow must require two evidence-backed company highlights before reporting completion. This applies to existing and future companies. Only companies covered by the current research task can block its completion; an older unresolved company elsewhere in the workspace cannot.

The agent compares every suitable, distinct vacancy at a verified hiring employer against the selected profile and confirmed career facts. When more than two qualify, it saves exactly two highlights with specific fit reasons and confirmed fact IDs. All other eligible roles remain visible. Highlights are recommendations and neither choose applications nor consume company allowance. Insufficient evidence keeps the review incomplete; no default pair or fabricated reason is permitted.

## Current behavior

`company-best-matches-basis` supplies the private comparison inputs and a fingerprint. `company-best-matches` validates and stores exactly two picks. `company_best_matches.project` exposes only fresh valid pairs. Discover puts these picks first and retains other roles. Material changes invalidate a pair. The research handoff and agent documentation ask for this work, but `company-research` has no completion check and the board does not distinguish missing/stale reviews.

## Acceptance criteria

1. Derive highlight review status from the same current inventory and review validation used to display picks. Verified employer identity, distinct vacancies, selected profile, current listings, removals, confirmed submissions and hard eligibility conflicts must be respected. Duplicate listings must not create a third vacancy or occupy both picks.
2. Companies with zero, one or two suitable distinct vacancies need no pair. Companies with three or more need exactly two valid current picks, each supported by existing confirmed facts. A changed comparison basis makes an existing pair stale; invalid records never become ready.
3. Discovery state identifies missing and stale reviews for existing as well as new companies. In Jobs, show concise review-needed text for the active profile, alongside the existing roles. Reuse the current visual design. Filtering visible cards must not change whether the company's full comparison is required. Other profiles, To apply, application history, and public preview retain their appropriate behavior.
4. Research assessment remains usable while incomplete and returns structured completion readiness and actionable blockers. A protected shared `company-research-complete` operation rechecks the current state and refuses completion when any in-scope company lacks required current highlights. The agent must call it successfully before claiming a completed research result; failure means report incomplete coverage and the specific blockers.
5. Finalization is scoped to explicit checked job IDs and a valid profile in the current workspace. Reject empty, malformed, duplicate, unknown and cross-workspace inputs. Account for the full current inventory of each covered company: sending only two of its roles cannot bypass the requirement. Companies outside that scope do not block. Unknown employer identity cannot be used to bypass a needed comparison; return a resolution blocker when appropriate. Do not silently lose a checked company to the research presentation's five-company cap.
6. Finalization performs a live read and does not persist a permanently complete flag. New roles or changes to listings, profiles, facts, availability, employer identity or submission/removal state are re-evaluated. Preserve the existing fresh-basis check before saving highlights.
7. Update the generated research handoff and shared agent workflow to use the completion operation and report incomplete work honestly. Make the enforcement boundary explicit: this governs the shared research workflow, not arbitrary text from an external agent that bypasses the app.
8. Review/read/finalization operations do not choose roles, create drafts, reserve submissions, contact employers or make paid calls. Submitted documents and existing comparison records remain intact. No new paid service, automatic AI worker, migration, private code fork, or global agent stopping hook is required.

## Implementation and verification

Reuse Python service operations, existing company comparison/identity rules and the React/TypeScript Discover feature. Derive statuses without a new database schema or persistent research sessions. Keep comparison details private; product status and concise fit reasons may be projected through the existing protected local workspace API.

Use fictional fixtures for backend, HTTP and frontend tests. Cover missing → current → stale, insufficient confirmed evidence, at most two roles, duplicate listings, scope isolation, omitted known roles, unknown employer links, invalid input, protected HTTP, and unchanged application choices. Exercise the complete flow in a browser at desktop and mobile widths. Run the relevant existing company/queue tests, frontend checks, production build and wheel install/recovery checks.

Commands (to be verified during delivery): `.venv/bin/python -m unittest discover -s tests -p 'test_company*.py' -v`; `npm --prefix frontend test`; `npm --prefix frontend run typecheck`; `npm --prefix frontend run lint`; `npm --prefix frontend run build`; `.venv/bin/python -m unittest discover -s tests -q`; `.venv/bin/python -m pip wheel --no-deps .`; `.venv/bin/python tests/check_wheel.py CANDIDATE_WHEEL`.

## Delivery

The 15 November 2026 candidate completed a separately authorized local installation. The 16 November branch consolidation authorizes integrating the reviewed source into shared main and following the existing public release workflow. See [delivery.md](delivery.md).
