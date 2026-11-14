# Application journey release — v0.7.0

The owner authorized testing, review, fixes, the private installed upgrade and publication of the shared release on 14 November 2026. This does not authorize an employer-facing application. Final deployment status, CI evidence and wheel identity belong in the [v0.7.0 release record](https://github.com/sometheasiekswx/employment-agency/releases/tag/v0.7.0).

## Scope

The release delivers the accepted [application journey](spec.md): a single role workspace, automatic CV preview, persistent listing link, self-application completion, a deferred agent queue and capability-checked local agent execution. It preserves the source-link, public-PDF discovery and duplicate-reference fixes already present in the combined installed baseline. Unrelated research-hook files and design notes stay outside the release.

The source release, public static demo and installed wheel are separate verification targets. The public demo cannot run the local application agent. No private career data, credentials, browser sessions or machine-local submission authority belong in the shared repository or wheel.

## Verification and recovery

The [build verification](verification.md) records the pre-review candidate. Independent GPT-6.1 Sol / Max reviews cover execution, user journeys and release recovery. Execution review fixed these reproduced issues:

- Machine-local authorization now authenticates the exact role, destination, version and answers, including trusted updates after preparation and an answered question.
- Website receipts require a fresh affirmative confirmation; stale, conditional and contradictory text cannot mark an application Submitted.
- The service journals successful receipts before touching SQLite. Portable ZIP and Git-snapshot recovery can complete the record without another send, including when snapshot publication previously failed.
- Stop and the durable dispatch checkpoint serialize, so a stop accepted before dispatch prevents disclosure.
- Preparation rechecks the authorized document settings and master skills.

All 48 execution, channel, protocol and legacy-delivery tests passed after these fixes, including real Chrome against a fictional loopback site. The actual signed-in Codex proof also passed again: only `apply_selected_role` was exposed to GPT-6.1 Sol / Max, answering the missing field produced exactly one fixture POST with the expected documents, and Stop produced zero POSTs in a separate run. No employer-facing action occurred. The dependency audit reported no vulnerabilities and all 108 public-release-script tests passed.

Journey review also fixed returning to a self-application reservation, including the popup-denied native link: the service revalidates the employer, vacancy, allowance, listing, documents and destination before opening it. Removed roles retain access to their unresolved outcome. A confirmed receipt awaiting its final version record no longer displays an unrelated newer draft; migration 6 rebuilds that derived queue projection. Equivalent submitted vacancies leave the selected agent handoff immediately, and receipt displays retain their exact version and actual time. The 15 focused Python journey tests and 101 frontend tests passed, along with typecheck and lint. Browser regressions cover the native-link proof, changed-destination refusal and a single Copy job reference action.

Final packaging uses a clean checkout of the release commit, so unrelated working-tree files and stale build output cannot enter the wheel. Installed-wheel verification precedes publication; cross-platform CI must pass before the public demo is promoted.

The shared `Checks` workflow owns the Linux/macOS/Windows gates and public-demo deployment. Production promotion follows its exact-commit staging and public-alias verification. The prior public revision is `da492c130b12508974d055e5dc9ae8a83c0f1364`.

The private upgrade requires an online backup, isolated restore, migration to SQLite schema 6, exact document checks and a retained schema-5 recovery copy. The earlier build must never open the migrated database. Recovery instructions and private backup locations remain outside this public repository. See [upgrade guidance](../../docs/running-locally.md#existing-environments-and-upgrades).

## Execution limits

Connected execution supports the independently verified local Codex build and bounded same-endpoint HTTPS forms. Unsupported forms and sign-in need help. Telegram currently has no scoped personal connector; Gmail needs its own local connection. Controlled fixtures establish channel behavior, not a live employer submission. Physical-device tests and live employer delivery are outside this release verification.
