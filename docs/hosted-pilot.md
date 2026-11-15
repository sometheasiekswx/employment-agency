# Private hosted pilot

The private pilot uses Google sign-in and a server-enforced account allowlist. It supports private workspaces, résumé imports, fact confirmation, profiles, Greenhouse and Lever feed controls, JobPosting URL import, evidence-based ranking, template PDF/DOCX/EML generation, application decisions, export and account deletion. The local app provides **Find new jobs**, filesystem watching, custom TeX and connected agents.

The pilot's scope excludes paid AI and automated submission. Keep the owner allowlist in deployment configuration. Enable access after verifying provider configuration, isolation and recovery.

## Plan and acceptance

1. Shared summaries and metadata presentation: use confirmed facts, state gaps without asserting qualification, hide unknown values, retain important warnings. Verify with unit/browser tests.
2. Authenticate protected API requests with Supabase and enforce the verified Google identity and account allowlist. Use private storage with RLS, temporary workspaces, concurrency checks and quotas. Exercise auth, cross-owner access, conflict preservation, safe responses and import, generation, export and deletion in fictional fixtures.
3. Hosted interface: Google sign-in, explicit cloud-storage notice, shared career/search/application UI, export/sign-out/deletion. No local-folder controls. Test desktop/mobile and failure states.
4. Release: fictional README preview, setup instructions and exact limitations, package/build verification. Deploy only within authorized free plans; record missing configuration and never describe an unconfigured landing page as a working service.

## Storage decision

Pilot workspaces are bounded portable snapshots in a private Supabase bucket, with a Postgres revision pointer. This reuses the integrity-checked local format and retains all version files. Each mutation uploads a new immutable snapshot then atomically compares the previous revision; stale writes fail. The previous pointer remains recoverable if upload/commit fails. Temporary files are removed after the request. This intentionally caps pilot scale; incremental object storage and durable background execution are follow-up work.

## Provider setup (required before enabling the pilot)

1. Create a dedicated **Free** Supabase project. Apply `supabase/migrations/0001_hosted_workspaces.sql` in its SQL editor. The private bucket and database have RLS enabled with no direct client grants; the server validates identity before scoped service-role access. Never expose the service-role key to the browser.
2. Configure Google OAuth in Supabase Auth using your Google Cloud OAuth client. Use the callback URL shown by Supabase; set the site's production URL and exact allowed redirect URL. No wildcard redirects. Disable other sign-in providers.
3. Set server environment variables in Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EA_PUBLIC_ORIGIN` (exact HTTPS origin), and `EA_ALLOWED_EMAILS` (comma-separated explicit pilot identities). Do not commit `.env` files or paste secrets into chat. Google sign-in credentials stay in Supabase, not Vercel.
4. Keep `EA_PILOT_ENABLED` unset until live checks pass. On an isolated preview, enable it for explicitly configured fictional test accounts and verify sign-in, denied non-allowlisted access, cross-account data isolation, snapshot conflicts, imports, document generation/download, export/restore and deletion. Direct anon/authenticated table and bucket requests must be denied. Record results before enabling production.
5. Set the production pilot allowlist to the owner's approved Google account only, then enable `EA_PILOT_ENABLED=true`. Do not add testers or open registration implicitly.

### Pilot limits and recovery

The root `vercel.json` configures Flask with `app.py` serving the packaged frontend. Use Node.js 24 or newer for the build. Vercel bootstraps Python dependencies before the npm build, using `[tool.uv] package = false` to consume the source checkout. `git.deploymentEnabled` is `false`. Release this pilot through an explicit deployment that preserves Vercel protection and the owner allowlist. The public demo uses a separate static Vercel project. [Vercel deployment configuration](https://vercel.com/docs/project-configuration/git-configuration) · [Public demo deployment](public-demo-deployment.md)

One package is generated per request; browser users can prepare additional matches individually. No background threads or paid APIs run in hosted mode. Imports are limited to 2 MB; current workspaces to 3 MB compressed / 30 MB expanded; 25 packages, 300 jobs and 500 facts. Historical cloud snapshots consume a cumulative 50 MB and 250-save cap per account; the SQL transaction enforces this before publishing a new pointer. This deliberately small pilot retains snapshots for recovery and prevents unbounded owner storage. Export to the local app when a cap is reached; failed mutations preserve the prior state.

Account deletion first marks the workspace as deleting, then removes all owned snapshot objects and the Auth user. Interrupted deletions can be retried; other operations are blocked during deletion. Browser downloads use authenticated fetch, never public storage links. Session tokens stay in sessionStorage for that browser tab; Google uses PKCE. Logs must not contain tokens, career data or provider response bodies.

The free tier is a pilot constraint, not a promise of production reliability or unlimited traffic. Live Supabase and OAuth tests require connected provider configuration. Local fake-provider tests do not establish deployed RLS or Google sign-in correctness.

## Repeatable local verification

After [source setup](../README.md#set-up-once), run the Python suite and the [production-export browser runner](../CONTRIBUTING.md#browser-checks). The runner starts a disposable hosted fixture on loopback, sets `TEST_URL` and uses an in-memory provider with a synthetic session. To run just the hosted workflow from the macOS/Linux checkout, use two terminals with the existing normal frontend build and Playwright Chrome installed.

```sh
PYTHONPATH=. .venv/bin/python tests/serve_hosted_fixture.py --port 8769
```

```sh
TEST_URL=http://127.0.0.1:8769 PLAYWRIGHT_PATH="$PWD/frontend/node_modules/playwright" node tests/hosted-browser.cjs
```

The fixture verifies application behavior through the hosted boundary. Real Google OAuth and Supabase RLS need the separate live checks above. `.venv/bin/python tests/check_hosted_install.py` uses uv to reproduce Vercel's Python bootstrap in a disposable folder.

## Verification status — 29 October 2026

The following observations apply to the initial pilot deployment.

- 44 unit/integration tests passed, including auth allowlist/verified-provider rejection, account separation, private import confirmation, export/restore, deletion, conflict preservation, no-secret configuration, and rejection of local/paid operations.
- Local and hosted Chrome workflows passed with fictional data: identity, confirmed facts, profile/job, ranking, document generation/download, direct decisions/comments, reload persistence; no page errors or overflow at 320/768/1024/1440. Hosted tests use a fake provider, not real OAuth or database policies.
- README screenshot refreshed from the local fictional fixture. JavaScript syntax, Python compilation and diff checks passed. Private-workspace export/restore verified before local upgrade; personal application records preserved.
- Vercel Hobby deployment built successfully. Initial live startup failed because Flask was only optional; it is now an explicit dependency. The corrected deployment serves `/` with HTTP 200 and `/api/config` with the expected HTTP 503 configuration gate, using the owner's authenticated Vercel access.
- Production URL: https://sams-employment-agency.vercel.app . Vercel deployment protection remains enabled. Supabase and Google OAuth were subsequently configured by the owner. The gate was enabled for the approved owner identity only; the owner confirmed successful Google sign-in and dashboard access. Anonymous database access was denied in a live check. **Still an invite-only verification pilot, not a generally available service.** Live authenticated storage, multi-account isolation, recovery and deletion acceptance remain unverified by the agent.
- The initial check used the owner's approved sign-in and fictional fixtures for automated tests. Paid upgrades, invitations and employer submissions were outside its scope.


## Release checks — 29 October 2026

48 automated tests and both local/hosted Chrome browser workflows passed. Fixed invalid JSON and oversized requests returning HTTP 500; these now retain appropriate client-error status. Added an exclusive private-storage mutation lock plus an account-existence recheck so concurrent save/deletion cannot leave newly uploaded documents behind. New-account deletion creates its tombstone before cleanup; the lock remains until Auth deletion completes. Read-only ranking/proposal requests no longer consume snapshot quota.

A crashed invocation can leave `ACCOUNT_UUID/operation-lock.zip`. Never automatically steal it: an operator must first confirm the invocation has ended, then remove only that account's lock object via Supabase Storage. This conservative recovery choice prevents overlapping writes. Existing database migration remains compatible; no additional SQL migration is required.

Source is published separately from release acceptance. Local/fake-provider tests do not establish live Supabase write/delete behavior. Preserve the current owner-only allowlist and Vercel protection until live acceptance is complete. No test deletes the owner's account or changes their hosted career data.
