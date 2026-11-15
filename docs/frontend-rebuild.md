# React / Next.js frontend architecture and parity

The parity table describes the maintained interface. The ordered plan and 31 October 2026 completion evidence below preserve the original rebuild scope; its test counts and release status are historical. See [system design](system-design.md) and [Contributing](../CONTRIBUTING.md) for current runtime and validation instructions.

## Contract

Use React components and TypeScript with Next.js App Router and a static export served by the Python local server or hosted Flask service. Preserve the current [design system](../DESIGN.md), responsive layouts, Python service contracts, immutable document versions and private/public boundaries. Normal builds do not read a private workspace. The separate public-demo build uses approved public inputs and a browser-only adapter. Deployment and installed-build upgrades remain separate operations.

### Required parity

| Area | Required behavior |
| --- | --- |
| Workspace | Setup, location, native Open Folder, cancellation, existing/empty-folder selection, Save, settings, stale-tab rejection, active-run protection |
| Career | Identity, PDF/Word/TeX/text import and size limits, supplemental facts, edit/confirm/retire/conflict states, master diff/identity/facts/conflicts/confirmation |
| Search | Multiple profiles, filters/expectations, manual jobs with all metadata and salary evidence, edit jobs, URL import, sources/status/refresh, ranking/evidence/gaps, explicit handoff selection in Search |
| Company board | Company grouping with location filters; original logo in header/details, initials fallback, title-first previews, vertically stacked remove/save controls and status beside location. Ordinary save/remove/Undo and accepted refreshes preserve company columns and review order; intentional scope or column-count changes can reset layout. |
| Opportunity details | The desktop pane reserves a separate column with a scrolling heading and body and a pinned action row. Mobile uses an expandable native dialog. Successful removal or restoration notices expire after eight seconds of unpaused time. Hover, keyboard focus and the reason editor hold the notice. Pending and failed actions keep their controls, and Removed retains restoration and reason editing after expiry. |
| Jobs and To apply agent instructions | The local boards use the same instruction row and copy directly. Jobs uses the active search profile. To apply covers the whole pending queue across pages and filters. Clipboard denial exposes the prompt for manual copying. Existing connected runs remain accessible in To apply. |
| Opportunity links | Listing and company links open their HTTPS destinations in a new tab on mobile and desktop. The selected role stays open in the workspace. Company links use the recorded careers page when available and fall back to the listing site's home page. |
| Runs | Bounded local/OpenAI runs, consent, model/prices/budget approval, progress/errors, cancel/resume |
| Applications | Active/Submitted/Removed, destination filters, historical queues, evidence/gaps/dates, file downloads, decisions/comments, immutable submitted records, external-edit validation. Submitted contains recorded snapshots and listings tagged Already submitted. A tagged listing's draft is accessible there as a separate version. |
| Documents | PDF preview, blocks/TeX/view modes, add/remove/style, preview without saving, preserved new drafts, errors, stale-base rejection, unsaved-close warning, keyboard/focus and object-URL cleanup |
| History | All canonical versions by city/company/job/date, source/uncertain dates, integrity-checked files and external-edit adoption |
| Hosted | Google PKCE/session refresh, errors/logout, authenticated downloads/export/delete, isolation, capability restrictions; local paths/pickers/runs/TeX/paid actions remain unavailable |
| Shell | Real URLs/back/forward/reload, loading/error/retry, keyboard labels/focus, narrow/wide layouts, safe untrusted text, no broad fetch monkeypatch or whole-page DOM replacement |

## Architecture

`frontend/` owns Next routes, shared controls, typed models/API/auth, workspace state and feature components. Python retains storage, rules, exports, generation and security. One API transport handles local workspace tokens or hosted bearer tokens explicitly. Server refreshes must preserve in-progress form input; workspace changes must clear derived state and invalidate outstanding requests. All file and mutation operations retain server validation.

Static export preserves the one-process local runtime and current hosted Python deployment. Node is a build/development dependency only. Python wheels include built assets; source/deployment instructions and CI build them explicitly. Inline Next bootstrap scripts receive exact CSP hashes; no unsafe-inline script exception is added. History gains scoped read APIs rather than a second server-rendered UI.

## Ordered plan

- [x] Inventory parity, routes, API envelopes, local/hosted capabilities and security contracts.
- [x] Build typed transport/auth/state, Next route shell, forms and static-serving/package integration.
- [x] Migrate workspace/settings/career, including master/import/confirmation workflows.
- [x] Migrate search/profiles/jobs/sources/ranking/runs and agent operations.
- [x] Migrate applications, destination/history filters, decisions, files and document editor.
- [x] Migrate version history; remove old frontend and update contributor/build/deployment docs.
- [x] Test Python contracts, frontend units/types/lint/build and real browser workflows for local and hosted fixtures; repeat after fixes.
- [x] Review maintainability/security/parity and build/install an isolated wheel. Push/remote CI results are reported against the delivered revision in chat.

## Verification policy

Use synthetic workspaces and isolated machine configuration throughout. Preserve existing meaningful backend tests. Adapt browser selectors only for deliberate semantic UI changes; retain behavioral assertions. Add targeted coverage for unsaved drafts, failed requests, stale workspaces, auth boundaries, history access and editor lifecycle. Test actual production-export assets, deep links, refresh/back, and 320/768/1024/1440 layouts. Automated fixtures do not prove real OAuth, production storage or native OS dialog interactions. Record remaining limitations accurately.

## Release and recovery

For the original frontend rebuild, publication was authorized and no state migration was needed. That historical approval does not authorize future releases or upgrades. Current source uses SQLite schema 7; follow [current migration and recovery guidance](running-locally.md#existing-environments-and-upgrades) for an installation change.

## Completion evidence — 31 October 2026

- Clean `npm ci --ignore-scripts`, production export, TypeScript, ESLint and 20 frontend unit tests passed. The full npm dependency snapshot reported zero known audit findings at verification time; this is not a guarantee of dependency safety.
- 74 Python tests passed, preserving the previous contracts and adding static routing/CSP/HEAD, explicit dev-origin boundaries, scoped history/file access and export coverage.
- All eight production-export browser scenarios in `tests/run_browser_checks.py` passed: the original local and hosted workflows, expanded local parity, editor in both editions, external edits/master review/workspace switching, folder selection and hosted auth/recovery. They exercise source/URL failures, agent handoff/selection, history/old queues, session failure/retry/refresh, authenticated downloads, local/hosted export, fictional account deletion, and responsive routes. Draft input survives polling and failed saves; submitted PDF bytes remain unchanged.
- Desktop and mobile viewport renders were inspected. Keyboard focus, editor close/unsaved warnings and all route layouts were checked at 320/768/1024/1440 widths. URL filters use optimistic state to keep controlled inputs responsive while navigation completes.
- The wheel was installed into a fresh environment outside the checkout. Every page and its script assets loaded; document generation and a submitted snapshot export/restore round trip passed. Packaging rejects a missing frontend and clears obsolete generated package files so the deleted frontend cannot remain in incremental builds.
- The live Next development proxy successfully performed a protected setup save through a disposable Python backend. Normal serving rejects that origin; an explicit exact loopback-origin flag enables development while retaining token checks.
- Review inspected ownership, API/auth scopes, stale-response handling, cancellation, unchanged backend business rules, untrusted text rendering, source/runtime packaging, dependencies and the final diff. No unresolved blocking finding remained in the checked scope. There is no manual HTML rendering, DOM-rewriting layer, global fetch override, TypeScript `any`, ignored type error or weakened test assertion in the new frontend.

Native OS dialog choices and hosted providers use fixtures in automated acceptance. Real Google OAuth, deployed Supabase writes/account isolation, actual native dialogs and a production deployment are not established by these checks. TeX editing is covered as a UI/API contract; compiler availability remains machine-specific. No real workspace or pinned installed build was upgraded.
