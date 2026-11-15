# Company logo presentation

Confirmed requirements: focused company-board and opened-role refinement, preserving the existing purple theme and navigation. Original logo artwork stays unchanged, including the accepted lower contrast of some marks in one theme. The request supplies the specification; no new data or application behavior is needed.

Task status: [todo.md](todo.md).

## Acceptance criteria

- The company header presents one clearly sized logo, with the company name readable beside it.
- Job previews do not repeat company logos. Existing status, listing, save, removal, and review controls remain usable.
- Opened desktop and mobile role details retain the company logo.
- Images and their wrappers have no added background, tint, filter, cropping, or replacement artwork. Fallback initials never show through transparent artwork.
- Missing, rejected, or failed images retain an initials fallback and readable company name. Only existing verified same-origin logo paths are accepted.
- Light/dark themes, narrow/wide screens, long names, keyboard operation, and existing board stability remain usable.
- The reviewed change reaches `main`; the existing Checks workflow builds, tests, and deploys the public demo, which is then verified at its public URL.

## Approach and sequence

1. Refine the existing `CompanyMark`, company-header layout, and card composition in the shared frontend. Retain original image bytes and use the existing CSS design tokens and component structure. Use a bounded logo area that improves wide-mark visibility without displacing names or counts.
2. Extend existing component and browser regression checks for one board mark per company, transparent rendering, fallback behavior, and opened details. Capture loaded assets in the existing preview evidence rather than lazy-loading placeholders.
3. Inspect the rendered public-preview board and details in both themes on desktop and mobile. Run the repository's frontend checks, Python contracts, and relevant production-export browser suites. Fix in-scope regressions and recheck affected behavior.
4. Obtain independent review of the actual diff and test evidence. Commit only this isolated change, fast-forward `main`, and follow the full Checks matrix and deployment job through completion. Verify `/release.json`, the existing deployment checker, and the live rendered interface.

## Boundaries and recovery

Work starts from `ace37d325be7ac6dd4431f1e6a6f28488c200059`, which matched remote `main` and the live release marker. Other checkouts contain unrelated work and remain untouched. No private career data, installed-workspace upgrade, job research, logo asset replacement, dependency additions, private-hosted deployment, or wheel release is included.

The original logo can include an opaque background in its own pixels; preserving the artwork means those pixels remain. Some dark or pale marks have limited contrast against the selected theme; adjacent company text preserves identification. Do not reintroduce a gray tile to address this accepted tradeoff.

The existing public-demo deployment workflow and its required checks remain authoritative. Failed checks block deployment. The prior production revision above is the recovery reference; use the documented public-demo recovery procedure if verification detects a release defect.
