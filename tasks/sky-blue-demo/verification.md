# Verification — Sky Blue 0.5

31 October 2026, Melbourne. Scope: brand palette/copy, isolated offline demo, packaged startup, contributor/agent documentation and reproducible media. Impeccable led; explicit brand decisions took precedence over incompatible Taste rules.

## Observed checks

- 82 Python tests passed, including seven new demo contracts: new-only creation, offline generation and canonical file integrity, unchanged remembered config/permissions, existing/symlink rejection, no partial publication on validation failure, guarded reopening and a missing-state error, and actionable CLI errors. Existing workflow/storage/cloud/editor/HTTP tests remain active.
- 20 frontend unit tests, TypeScript, ESLint and the production export passed.
- All nine local/fake-hosted browser scripts passed. The design script checks five routes at 320/768/1024/1440, Axe WCAG 2/2.1 A/AA, fixed navigation targets, an actual proximity spring, keyboard/draft cancellation, reduced motion, bottom-dock position and 200% text. Exact brand fills and removal of repeated slogans are asserted against the rendered export.
- Installed-wheel proof passed outside the source checkout: routes/assets/HEAD, normal generation, submitted backup/restore, and offline populated demo generation/reopening. Demo assets are verified inside the wheel.
- Hosted uv dependency bootstrap passed without frontend assets. Python wheels still require built assets.
- npm audit reported zero known findings for the installed dependency snapshot.
- Impeccable detector ran once and returned no findings. Fresh finish review returned `disposition: ship` with no material fixes; shipped documenter updated DESIGN.md and its token sidecar.
- Taste inspected the production UI at 1440/768/390. Final report has zero FAIL and one defended warning: a scrollable queue shows only its leading records above the fold. `headline-lines` was explicitly allowed for complete real employer titles; truncating factual titles to satisfy a two-line visual preference would conflict with the product and Impeccable. The initial button-shadow finding was fixed with a flat selected-state border. The drawn achromatic colour budget was declined in favour of the user-pinned palette; no competing layout system was introduced.
- Browser CSS feedback was inspected at 0.1x using the Chrome animation playback control. The JavaScript proximity spring was separately checked for response, interruption-friendly behavior and unchanged hit geometry; it is not controlled by that CSS playback setting.

## Evidence and boundaries

The GIF and poster are actual browser captures with a marked fictional candidate and sourced public job metadata. Their 15 facts, three profiles, 13 jobs and 10 packages come from the app state. The 0.5 media files, source/hold-time manifest recipe and provenance are linked in docs/demo.md. No real resume, real account session, employer submission or paid model request was used.

The original private workspace is checked with a before/after SHA-256 inventory. Demo servers use isolated configuration; the private installed environment/version pin is not upgraded. Fake hosted tests do not establish deployed authenticated storage, real OAuth completion or live account deletion. Real job availability can change after the stored retrieval time.

## Polish review

Full mode, React/Next.js, existing plain CSS; no second styling system.

| Category | Evidence | Result |
| --- | --- | --- |
| Typography | Five routes, real long titles, 200% text | System face preserved; readable wrapping and tabular live counts |
| Surfaces | Demo desktop/mobile/editor captures | Exact brand fills, dark labels, flat document surfaces, stable hit areas |
| Animation | Pointer spring, keyboard, reduced motion, CSS feedback at 0.1x | Purposeful response; no staged page-load motion |
| Icons | Existing Lucide set, selected/inactive states | Consistent strokes and currentColor; no substitute assets |
| Performance | Production build, static assets, GIF size | No new runtime dependency; GIF approximately 0.5 MB; no Node runtime for wheels |

Considered and rejected: a saturated sidebar (no need to change navigation topology); clipping long job titles (loses factual content); adding animated entrances (daily interactions need speed); using a real private resume in public media (user selected fictional data). No actionable polish finding remains in the reviewed scope. Unverified: real-user accessibility study and live authenticated cloud writes. Verdict: Approve within this scope.

## Delivery

The release target is the existing public GitHub repository and Vercel project. Publish the checked complete 0.5.0 wheel with its SHA-256 digest so the README's Python-only installation path is real. Observe cross-platform CI, deployment readiness, all live routes/assets, hosted mode and unauthorized-state rejection. Keep the previous working deployment for rollback and stop temporary fixtures. Delivery observations are reported with the final release links; local checks alone are not deployed verification.
