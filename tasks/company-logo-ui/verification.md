# Company logo presentation verification

Verified on 16 November 2026 against the change based on `ace37d3`.

## Behavior and review

The existing component regression check failed on the original initials-behind-image behavior and passed after the fix. The final component renders either the verified original image or initials. Source validation and the verified-employer gate are unchanged.

The static preview verifies every bundled company logo in light and dark themes, requires transparent image/wrapper backgrounds, and checks there are no initials behind artwork. Jobs, To apply, and Applications contain no role-card logo marks. Desktop and mobile details retain the same verified logo.

The SQLite browser workflow verifies a decoded header logo, no duplicate card marks, a simulated HTTP 404 fallback, initials in unconfirmed role details, and the verified detail logo after employer confirmation. This workflow passed in Chromium and WebKit.

Rendered boards were inspected at 1440px and 390px in both themes, with opened details also checked at 320px. The header, desktop-detail, and mobile-detail logo areas are 44×24, 56×39, and 48×32 CSS pixels respectively, using `object-fit: contain`. Names, counts, statuses, and actions remained readable. Original opaque pixels and low contrast in some artwork remain as explicitly accepted; no asset bytes were changed. These are browser checks, not physical-device tests.

An independent reviewer inspected the complete product/test diff and representative rendered states and found no actionable issue. The final mobile sizing and test-context correction were included in that review. Subsequent light-detail screenshots were inspected by the coordinator.

## Checks

| Check | Result |
| --- | --- |
| Frontend typecheck and lint | Passed |
| Vitest | 391 tests in 36 files passed |
| Regular frontend build and public-preview build | Passed; preview contains 418 files |
| npm audit at moderate threshold | Passed; zero vulnerabilities |
| Python unit/integration suite | 414 tests passed |
| Public release/staging/promotion checks | 111 tests passed |
| Hosted dependency bootstrap | Passed |
| Wheel build and installed-wheel smoke | Passed: routes/assets, documents, export/restore, SQLite, controlled delivery, offline demo |
| Static public-preview browser workflows | Both passed on the final build |
| Full local/hosted browser runner | Passed, including board stability, accessibility, 200% text, mobile gestures, removal/restoration, queues, and hosted flows |
| Patch whitespace validation | Passed |

Loaded-asset captures are kept in the ignored `output/playwright/company-logo-ui/` evidence directory. Fixture-only checks do not read or modify a private career workspace.

## Delivery criteria

The reviewed change is intended for the existing `main` release path. The full Linux/macOS/Windows Checks matrix must pass before the existing workflow deploys and verifies the public demo. Final verification must match the delivered commit in `/release.json`, pass `scripts/check-public-demo.mjs`, and confirm header-only board logos and opened-detail logos in the live interface. The workflow run and live release marker provide the final external status; local passing checks alone do not establish deployment success.

The prior live revision `ace37d325be7ac6dd4431f1e6a6f28488c200059` is the recovery reference. No state migration, private-workspace upgrade, private-hosted deployment, or package release is part of this change.
