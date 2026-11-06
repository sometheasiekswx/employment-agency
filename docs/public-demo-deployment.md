# Automatic public demo deployment

The public showcase at **https://employment-agency-demo.vercel.app/discover/** follows successful `main` changes automatically. This policy was agreed on 6 November 2026. The private hosted pilot and installed career workspaces retain their separate explicit deployment/upgrade procedures. See [ADR 0006](adr/0006-automatic-public-demo-releases.md).

## Release path

1. A push runs the existing `Checks` workflow on Linux, macOS and Windows. Pull requests run checks without deployment access.
2. Linux builds and browser-tests the fictional static site, then uploads that exact directory as a commit-named artifact. A failed check prevents the deployment job from running.
3. After the entire matrix succeeds, the release job downloads the artifact into an isolated runner directory. It checks the commit and fictional markers, then stages a production deployment with domain assignment disabled.
4. A dependency-free HTTP check verifies the exact source commit, fictional fixture, routes, a sample PDF and security headers on the staged URL. Only a verified candidate that still matches `main` is promoted.
5. The same check runs on the public alias. The Actions job summary records the source SHA and public URL. Inspect [/release.json](https://employment-agency-demo.vercel.app/release.json) to identify the live source commit and fixture revision.

Release jobs are serialized, and queued releases are preserved so that rerunning an older workflow cannot cancel a newer waiting release. The release job compares its SHA with current `main` before staging and before promotion. A push arriving after that final comparison can briefly leave the previous successful revision live until the next checked revision releases. A skipped superseded candidate does not move the alias.

The generated static directory is deployed through Vercel's deployment API with its own empty build/install configuration, rather than rebuilding source on Vercel. Files are supplied inline and domain assignment is disabled until verification. API calls use the explicit public project/team and do not request an account profile. Root `vercel.json` continues to disable native Git deployment and configure the private Flask application.

The deployment transport intentionally avoids the CLI: Vercel CLI 65.2.0 requests `/v2/user`, which returns HTTP 404 for this project-scoped token even though project access succeeds. Keeping the token narrow takes precedence over granting CI account-wide access. The staging request follows the official CLI's deployment payload for static configuration and `autoAssignCustomDomains: false`; promotion uses the documented project deployment endpoint.

## One-time credential setup

The release job requires the GitHub Actions repository secret **`VERCEL_DEMO_TOKEN`**, containing a deployment token scoped only to the public demo project:

- Repository: `sometheasiekswx/employment-agency`
- Vercel project: `employment-agency-demo` (`prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0`)
- Vercel team: `team_QmjRFzULoHfOTipsjFByfxON`

Create the scoped token through [Vercel token settings](https://vercel.com/account/tokens) or the documented `vercel tokens create "employment-agency-demo Actions" --project prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0` command. Token creation through the CLI requires a classic account-level personal token; an OAuth login cannot mint it. Never put a broad account token, CLI refresh token or private-pilot credential into this workflow.

Save the resulting project-scoped value directly in [GitHub Actions secret settings](https://github.com/sometheasiekswx/employment-agency/settings/secrets/actions), or use `gh secret set VERCEL_DEMO_TOKEN --repo sometheasiekswx/employment-agency` and enter it at the hidden prompt. Do not paste tokens into chat, source, command-line arguments or logs. The team/project IDs are identifiers, not credentials, and are explicit in the workflow so the root private `.vercel` link cannot select the release target.

Replace the secret when rotating the scoped token, then revoke the old token. An absent or expired token fails the release visibly and leaves the current alias live. No manual reviewer is required for normal successful releases. This uses the existing hosting plan and introduces no paid service.

## Verify and recover

Run `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` for release, staging and promotion success/failure cases. `npm --prefix frontend run build:preview` builds the candidate with its commit marker. The existing `python tests/run_public_preview_checks.py` exercises the static interface, fictional-data isolation and desktop/mobile behavior before release.

For an already staged or live release:

```sh
node scripts/check-public-demo.mjs https://employment-agency-demo.vercel.app EXPECTED_40_CHARACTER_COMMIT
```

Before requesting promotion, any failure leaves the existing public deployment untouched. A promotion command timeout does not cancel Vercel's operation: the workflow verifies the public alias even after a failed promotion command. A following release refuses to stage while the provider reports a pending promotion, so reconcile that operation before retrying. A timeout must not be described as proof that the alias stayed unchanged.

If verification after promotion identifies a defect, inspect the Actions log and use the previous known-good production deployment shown in the demo project's Vercel history. Promote that deployment using the existing Vercel account, verify its `/release.json` and critical pages, and fix the failing revision before releasing again. The first deployment predates `/release.json`; use its Vercel commit metadata and browser verification if it is needed for recovery.

To pause public releases, disable the release job in the workflow or revoke its dedicated token. Preserve the previous static deployment until recovery is verified. Reverting the workflow through a normal commit preserves source history. No database migration, personal-workspace restore, private-pilot deployment or wheel publication is part of this process.

References: [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel token scope](https://vercel.com/docs/cli/tokens), [official static deployment payload](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/index.ts), [production promotion API](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
