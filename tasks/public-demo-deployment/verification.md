# Automatic demo release verification

6 November 2026. This record distinguishes implemented source and local checks from a completed hosted release.

## Local checks

- `node --test tests/check-public-demo.test.mjs`: 47 passing checks, including wrong commit/fixture, unsafe document paths, failed HTTP responses, bad PDF bytes and CSP violations.
- `npm --prefix frontend test`: 253 passing tests across 27 files; application source behavior is unchanged by this deployment task.
- `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck`: pass.
- `npm --prefix frontend run build:preview`: pass, isolated static site includes `release.json` with commit and fictional fixture revision.
- `python tests/run_public_preview_checks.py`: pass, real Chrome desktop/mobile, sample documents, isolated bookmarks, disabled private operations, no API/auth/provider requests and accessibility checks with production CSP.
- Prettier checks on changed code/workflow and `git diff --check`: pass.
- Credential-pattern scan found no matches in new source/docs; manual review confirmed static-only artifact, explicit public project/team, no private workspace files and deployment credentials unavailable to PR jobs.

## Independent review

The reviewer found an old-rerun concurrency edge and unverified promotion timeouts. Removed test cancellation, preserved queued release jobs and retained both current-main guards. The release refuses a pending provider promotion and verifies the public alias after every attempted promotion, including a command timeout. Final independent reread found no remaining material source concerns. Hosted authentication and actual workflow execution remain separate checks.

## Credential setup and first-release checkpoint

The agreed release policy and account configuration work are authorized. Vercel email verification completed in Safari. The new token is restricted to `employment-agency-demo`, with no expiration. A read-only API check confirmed access to the public project and denial of access to the private pilot project. The value was passed directly into GitHub Actions as `VERCEL_DEMO_TOKEN`, then removed from the clipboard. No token plaintext was displayed in chat or written to source.

The [first pipeline execution](https://github.com/sometheasiekswx/employment-agency/actions/runs/42177423023) passed the complete Linux/macOS/Windows matrix, including installed wheels, browser flows and public-preview checks. Deployment then failed before creating a candidate because CLI 65.2.0 tried to load an account profile unavailable to the project-scoped credential (HTTP 404). The public alias remained on its prior deployment.

The corrected transport uses direct Vercel deployment/promotion APIs without widening credential access or loading `/v2/user`. Hosted release evidence is the [Checks workflow](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml), its deployment job summary and the public `/release.json`; local checks alone do not establish deployment success. The private hosted pilot, personal workspaces, dependency manifests and published wheel remain unchanged.
