# Delivery plan

[Agreed behavior](spec.md)

- [x] Add the exact workspace ID and original listing link to a readable copy action in Details. Inspector tests verify the clipboard payload and manual copy fallback.
- [x] Add one workspace operation for evidence, then connect it to the requirement row. Python tests cover retries, changed requirements, and hosted isolation. Desktop Chromium, mobile WebKit, and native Simulator Safari verify the saved evidence flow with fictional roles.
- [x] Connect the listing links to a sandboxed website preview. HTTP and browser checks cover exact-host framing, blocked embeds, saved-details fallback, and the fictional public experience.
- [x] Check and review the integrated local release candidate. Production export, lint, 349 frontend tests, 205 Python tests, and the local, hosted and public browser suites passed with fictional workspaces.

## Reusable skill confirmations

- [x] Save the exact requirement as a confirmed skill and link it to the role in one workspace operation. Service tests cover retry deduplication, reuse of an existing skill, and work eligibility.
- [x] Match reusable skills across listings by normalizing case and common requirement phrasing. Browser checks verified equivalent wording in Browse, Applications and newly added listings. A requirement with an additional skill still showed a gap.
- [x] Show the saved skill beneath the requirement and in Career Profile. Earlier job-only confirmations offer an explicit add action when the role lacks reusable evidence.
- [x] Build and test the shared app in fictional workspaces. Production export, lint, 356 frontend tests, 207 Python tests, desktop Chromium and mobile WebKit passed.
