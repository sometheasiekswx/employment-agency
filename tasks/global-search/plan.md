# Search all opportunity sources

## Outcome and acceptance

Both role search inputs search the stored workspace across Jobs, To apply,
Applications and Removed. Entering text starts with All sources regardless of
the current browsing tab, employer scope or page. Clearing it restores normal
browsing. Source filters show matching counts and each card carries explicit
source labels, including multiple memberships without duplicate cards.

The search retains current application precedence and includes removed roles,
application records without a current listing, and earlier application queues.
Stored records remain searchable when matching is unavailable. Search does not
change decisions, submission records, cooldowns or application documents.
Opening a result reuses the existing inspector, actions, guarded navigation and
Back behavior. Search remains usable with keyboard and narrow mobile screens.

## Implementation and verification

1. Reuse the existing source sets and text matching, with explicit global search
   membership and URL-based source filtering. Add behavioral unit coverage for
   all sources, duplicates, submitted precedence and missing ranking.
2. Extend the established controls and cards with source counts and badges;
   preserve ordinary browsing, profile selection, input focus and unsaved guards.
3. Exercise the production export with fictional data in Chrome, including
   entering search from other queues, filtering, details/Back, clear, removed
   state and narrow/wide layout. Run frontend unit, lint/type and build checks,
   appropriate existing regressions and installed-wheel validation.
4. Independently review the actual diff and resolve in-scope findings.
5. Build the shared software into a new isolated wheel installation. Export the
   private workspace, rehearse restore and verify schema and preserved document
   bytes. Cut over the explicitly authorized private app and verify its actual
   loopback and existing private HTTPS targets. Record the new pin and recovery.

## Boundaries

Implementation belongs in the shared software repository; private records and
verification artifacts stay in private storage. No database migration is planned.
Preserve concurrent workspace research and all immutable submitted files. The
initial delivery installed the private app for testing. After accepting it, the
user authorized review, commits and pushes to both repositories' main branches,
and release to the public demo. Reuse existing React/Next components and
installed test tools without adding dependencies.

## Status

- [x] Inspect current behavior and agree the scoped requirements above.
- [x] Implement source search, accessible labels and behavioral coverage.
- [x] Verify production behavior and review the final diff.
- [x] Complete recovery checks, install privately and verify the live target.
