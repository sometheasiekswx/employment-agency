# Appearance and interface refinement

The owner chose to retain Agency’s mark, type and lavender accent while refining the whole application. Dark remains the default. Settings, the desktop rail and the phone menu offer Dark, Light and System. The browser remembers the choice and System follows live changes to the device preference. Both palettes cover the app, including loading, forms, warnings, modal dialogs, review and public preview chrome.

1. Apply the stored preference on the first paint. Verify reload, live System, explicit overrides, cross-tab sync and blocked storage on the production export. The shared workspace schema and installed package are outside this change.
2. Refine visual hierarchy on Opportunities, Career profile, Search preferences, History and Settings with the existing controls and design tokens. Inspect desktop and phone renders in both themes, including role details and document review.
3. Preserve opportunity search context and show applied filters. Give Documents safe entry focus, expose open checks in the phone inspector, place review beside the current documents and link directly to import on phones. Verify version and submission safeguards with fictional records.
4. Check the production and preview exports, lint, test and inspect the rendered states. Have an independent principal designer score the rendered candidate, address concrete findings and repeat while the work yields meaningful improvements. The requested acceptance score is 9.5/10.

MotionSites supplies design references and the screenshot iteration method. The app uses its local fonts, existing controls and existing motion stack. Release preparation uses the shared software checkout and disposable demo data.

## Verification and independent review

- Frontend lint, 353 frontend tests, the production export, the full local and hosted browser acceptance suite, and the public preview build and browser check passed. Browser checks exercise the persisted appearance preference and the existing application workflows. An additional axe sample found zero reported violations across 28 desktop and phone states in both themes. Axe marked some contrast checks for manual review.
- The first independent principal designer scored the initial candidate **9.3/10**. That review used 72 fictional roles and 17 application versions. It verified the complete evidence warning at 320px and 390px, all six cities in the phone picker, keyboard focus on desktop and the link from Submitted to the correct History version.
- Local screenshots and accessibility results are under `output/playwright/appearance-release-Y0Eeza/`. The scale review captures are under `output/playwright/principal-audit-scale-final/`. Both sets use fictional records.

## Release follow-up

The release candidate isolates the refresh and its Saved and Submitted queue behavior. It uses the existing fictional public demo workflow. The known-good rollback deployment is `dpl_GLencqEKgK1YtN4WKHK19RxGXPV1` at `fa1928c`. See [public demo verification and recovery](../../docs/public-demo-deployment.md#verify-and-recover).

- Chromium and WebKit verified that cancelling Back after Forward retains the Activity draft and that confirming Back discards the unsaved changes. The Submitted filter moves focus to the destination stage. Desktop Back restores the filtered shortlist and role focus.
- The mixed-script PDF rendered and exposed both English and Chinese text in Chromium and WebKit. The original download bytes matched, and pagination retained keyboard focus at its limits. An iPhone simulator running Safari and VoiceOver announced search, Appearance and role inspector controls.
- The fresh independent principal designer rated the final candidate **9.5/10** at 1440px Chromium Light and 320px WebKit Dark. The review verified filtering across all 72 ranked jobs, visible focus on the first newly revealed result, and History filters across reload and removal of the role scope. The remaining deduction was phone comparison density. Physical-device and real-user checks remain outside this review.
