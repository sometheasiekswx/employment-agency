# Global opportunity search verification

Both role search entry points now search Jobs, To apply, Applications and Removed.
Source counts and per-card text labels distinguish membership, including one card
with multiple labels for overlapping queues. Search ignores the browsing view,
employer, location/status filters and queue page; clearing returns to that view.
Archived applications, roles without listings and roles at paused employers are
included. Stored results are available without a successful ranking request.

## Behavior and review

The production-export SQLite fixture covers all four sources, duplicate
memberships, submitted precedence, archived unlisted applications, query entry
from Submitted/Removed and a later To apply page, source narrowing, detail/Back,
clear/focus and 320/1440px layouts. Merely opening a removed match leaves the
record removed. A saved-then-removed role shows Removed without a stale To apply
status. Existing guarded navigation retains profile selection and unsaved drafts.

Independent review found and resolved missing unlisted receipt metadata, stale
saved status on removed cards, assessment freshness before preparation, and the
read-only receipt endpoint's rejection of roles without listings. Regressions
exercise each case. Receipt lookup still rejects unknown roles and mismatched
application IDs. Unknown submitted documents never acquire an older draft.

## Checks

- All 399 frontend tests passed; TypeScript, ESLint and the production build passed.
- The full Python suite passed (452 tests before the final receipt regression).
  All 17 application-journey tests passed after the read-only endpoint change.
- Focused production browser checks passed for global search, search navigation,
  Jobs capacity, company highlights, bookmark/rollback, application navigation,
  role detail, evidence and source links, and desktop/mobile workspace layouts.
  Source links and mobile workspace were exercised in Chromium and WebKit.
- Axe WCAG A/AA checks passed for source controls and badges in both themes at
  320/1440px. The browser check waits for the responsive board to finish placement
  before measuring bounds; the theme audit runs after the color transition.
- Installed-wheel validation passed, including browser queue/application flows,
  document generation, SQLite migration, export/restore and submitted file bytes.
- `git diff --check` passed. No dependencies or schema changes were introduced.

Fictional screenshots and local logs are under `output/playwright/global-search/`
and `output/global-search/`. Private restore, installation and live verification
records belong exclusively to the private installation's recovery directory and
`workspace.lock.json`. Physical-device testing remains outside the automated
checks. Public release uses the existing main-branch deployment workflow after
the user's acceptance of the private build.

## Initial private delivery

Installed the reviewed local source overlay on shared base `9d1e7da`, retaining
the previous wheel and an export verified by isolated restore. The live app
passed global search, source filtering, result details, Back and Clear over
loopback in Chromium and existing private HTTPS in phone-sized WebKit. SQLite
remains at schema 7; provider permission records and checked submitted document
bytes were unchanged. Installation provenance, exact hashes and recovery paths
are recorded only in the private workspace pin. This initial phase did not
publish Git changes or the public demo.

## Main and public release

After accepting the private build, the user authorized committing and pushing
the feature and private installation records to main. The reviewed source and
tests match the accepted wheel's source overlay; final task records document the
completed checks. The [public release workflow](../../docs/public-demo-deployment.md)
builds the exact commit, runs its platform matrix, and verifies the staged and
live demo before reporting deployment success. The private installation pin
retains its original build provenance and records verified equivalence to the
published feature revision.

The first main-branch run caught a company allowance shortcut that still used a
text query to open To apply. With global search, this opened all sources and hid
the queue's agent controls. The shortcut now uses the confirmed employer ID and
the existing employer queue URL. The SQLite browser regression retains its queue
count and agent handoff checks, and also verifies the exact employer scope and
absence of a search query. It passed in Chromium and phone-sized WebKit after
the correction; TypeScript, ESLint and the production build also passed. The
public workflow remains gated by the full platform and browser suites.

Follow-up review also covered saved roles whose hiring evidence becomes disputed
after they occupy company slots. The company queue retains roles with that exact
company and a stored vacancy link, while excluding name-only guesses and other
companies. The existing application blockers remain visible, and the user can
remove the saved choices. The regression verifies both retained and excluded
roles plus the company filter label.
