# Automatic public demo deployment

The public showcase at **https://employment-agency-demo.vercel.app/discover/** follows successful `main` changes automatically. This policy was agreed on 6 November 2026. The private hosted pilot and installed career workspaces retain their separate explicit deployment/upgrade procedures. See [ADR 0006](adr/0006-automatic-public-demo-releases.md).

## Release path

1. A push runs the existing `Checks` workflow on Linux, macOS and Windows. Pull requests run checks without deployment access.
2. Linux builds and browser-tests the static site under `output/public-preview/site/`, then uploads that directory as `public-demo-<commit>`. Production includes reviewed employer listings and logos, the approved public résumé and sample activity. A failed check prevents the deployment job from running.
3. After the entire matrix succeeds, the release job downloads the artifact into an isolated runner directory. It checks the commit and demo markers, then stages a production deployment with domain assignment disabled.
4. A dependency-free HTTP check verifies the exact source commit, public fixture, routes, sample CV checksum, every current company logo checksum and security headers on the staged URL. Only a verified candidate that still matches `main` is promoted.
5. The same check runs on the public alias with `--wait-for-alias`. While promotion propagates, a valid stale commit marker or a mismatch between individually valid CSP headers restarts verification, up to eleven attempts total with three seconds between attempts. Every attempt rereads the release marker and checks the release against that marker's CSP; stale commits and CSP mismatches share the retry limit. The Actions job summary records the source SHA and public URL. Inspect [/release.json](https://employment-agency-demo.vercel.app/release.json) to identify the live source commit and fixture revision.

Retries do not relax validation: persistent mismatches still fail, and unsafe or missing security headers, malformed metadata, invalid content, checksum failures and HTTP/transport errors stop the check when encountered. Concurrent logo reads finish before a retry, and a validation failure takes precedence over a CSP mismatch in the same batch. Artifact and staged-URL checks remain single-attempt checks without `--wait-for-alias`.

Release jobs are serialized, and queued releases are preserved so that rerunning an older workflow cannot cancel a newer waiting release. The release job compares its SHA with current `main` before staging and before promotion. A push arriving after that final comparison can briefly leave the previous successful revision live until the next checked revision releases. A skipped superseded candidate does not move the alias.

The generated static directory is deployed through Vercel's deployment API with its own empty build and install configuration. After validating the captured artifact, the stage command confirms the public project and team and checks for pending promotions. It uploads the exact captured bytes once per unique SHA-1 digest in batches of up to ten. The creation request references each path, size and digest. Domain assignment stays disabled until verification. Root `vercel.json` continues to disable native Git deployment and configure the private Flask application. [Vercel file upload API](https://vercel.com/docs/rest-api/deployments/upload-deployment-files) · [Vercel deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)

In the original integration, Vercel CLI 65.2.0 returned HTTP 404 from `/v2/user` with the project-scoped token despite successful project access. Its inline file representation also had size, count and file-type limits. The current workflow calls the API directly with digest references so it can retain the dedicated token and deploy the multi-format export. Staging uses `autoAssignCustomDomains: false`. Promotion uses the project deployment endpoint.

Project status requests include `rollbackInfo=true`, as in the official CLI, because Vercel otherwise omits `lastAliasRequest`. Both the pending-operation guard and promotion polling require that metadata; the public release marker remains the final routing check.

## One-time credential setup

The release job requires the GitHub Actions repository secret **`VERCEL_DEMO_TOKEN`**, containing a deployment token scoped only to the public demo project:

- Repository: `sometheasiekswx/employment-agency`
- Vercel project: `employment-agency-demo` (`prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0`)
- Vercel team: `team_QmjRFzULoHfOTipsjFByfxON`

Create the scoped token through [Vercel token settings](https://vercel.com/account/tokens) or the documented `vercel tokens create "employment-agency-demo Actions" --project prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0` command. Token creation through the CLI requires a classic account-level personal token; an OAuth login cannot mint it. Never put a broad account token, CLI refresh token or private-pilot credential into this workflow.

Save the resulting project-scoped value directly in [GitHub Actions secret settings](https://github.com/sometheasiekswx/employment-agency/settings/secrets/actions), or use `gh secret set VERCEL_DEMO_TOKEN --repo sometheasiekswx/employment-agency` and enter it at the hidden prompt. Do not paste tokens into chat, source, command-line arguments or logs. The team/project IDs are identifiers, not credentials, and are explicit in the workflow so the root private `.vercel` link cannot select the release target.

Replace the secret when rotating the scoped token, then revoke the old token. An absent or expired token fails the release visibly and leaves the current alias live. No manual reviewer is required for normal successful releases. This uses the existing hosting plan and introduces no paid service.

## Public master résumé

Use the Python environment from [source setup](../README.md#set-up-once) and an installed LaTeX compiler. Set `EA_MASTER_TEX` to the approved source and `EA_PUBLIC_RESUME_OUT` to a new output directory outside the software repository. Render the public copy.

```sh
.venv/bin/python scripts/prepare-showcase-resume.py --master "$EA_MASTER_TEX" --output "$EA_PUBLIC_RESUME_OUT"
```

Review `resume.pdf` and `resume.json` before using them in a public build. Build a local preview and prepare the release inputs from that reviewed copy.

```sh
EA_PUBLIC_DEMO_RESUME_DIR="$EA_PUBLIC_RESUME_OUT" EA_PUBLIC_DEMO_PYTHON="$PWD/.venv/bin/python" npm --prefix frontend run build:preview
node scripts/showcase-resume.mjs "$EA_PUBLIC_RESUME_OUT"
```

For automatic releases, store the four `release-inputs/PUBLIC_DEMO_RESUME_*` files as GitHub Actions secrets with their exact filenames. Use all four from the same generation. The workflow verifies the checksum and uses the approved input for the published profile and sample application packages. Missing or invalid input fails the production preview build. Local and pull-request preview builds can use the sample fixture. Keep the LaTeX source and release inputs outside Git.

## Verify and recover

Run `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` for release, staging and promotion success and failure cases. `npm --prefix frontend run build:preview` writes the candidate and its exact commit marker. With the local Python dependencies and Chrome installed, `.venv/bin/python tests/run_public_preview_checks.py` exercises the static interface, sample application workflow, request isolation and desktop/mobile behavior before release.

The Linux workflow checks that the runner’s Chrome launches through Playwright. It installs Chrome and its dependencies if that check fails. The browser suite uses Playwright’s FFmpeg binary for recording and a checksum-verified Noto Sans CJK font for its unembedded Chinese PDF text check. [Noto Sans CJK release](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004)

For an already staged or live release:

```sh
node scripts/check-public-demo.mjs https://employment-agency-demo.vercel.app EXPECTED_40_CHARACTER_COMMIT
```

Before requesting promotion, any failure leaves the existing public deployment untouched. A promotion command timeout does not cancel Vercel's operation: the workflow verifies the public alias even after a failed promotion command. A following release refuses to stage while the provider reports a pending promotion, so reconcile that operation before retrying. A timeout must not be described as proof that the alias stayed unchanged.

A file upload failure stops staging before deployment creation. A deployment creation failure is never retried by the stage command. After an ambiguous response, inspect the public project for an existing deployment at the expected commit before another attempt. Staging diagnostics include the operation, HTTP status and recognized provider error code when present. Raw provider responses and credentials stay out of logs.

If verification after promotion identifies a defect, inspect the Actions log and use the previous known-good production deployment shown in the demo project's Vercel history. Promote that deployment using the existing Vercel account, verify its `/release.json` and critical pages, and fix the failing revision before releasing again. The first deployment predates `/release.json`; use its Vercel commit metadata and browser verification if it is needed for recovery.

To pause public releases, disable the release job in the workflow or revoke its dedicated token. Preserve the previous static deployment until recovery is verified. Reverting the workflow through a normal commit preserves source history. No database migration, personal-workspace restore, private-pilot deployment or wheel publication is part of this process.

References: [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel token scope](https://vercel.com/docs/cli/tokens), [official static deployment payload](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/index.ts), [production promotion API](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
