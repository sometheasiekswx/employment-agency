# Automatic public demo releases

Agreed 6 November 2026: publish changes to `main` automatically after all existing Checks pass. Failed checks retain the working public demo. This agreement completes the requested deployment-policy interview; implementation, verification and release are authorized through Auto.

The public showcase is the static fictional site at `employment-agency-demo.vercel.app`. The authenticated private pilot and installed career workspaces keep their existing explicit upgrade boundaries. No paid services, provider calls, real career data or wheel release are part of this change.

## Acceptance and implementation

1. **Reproducible public artifact.** Stamp the isolated static build with its source commit and fictional fixture revision. Keep the normal Python export unchanged. Verify using the existing public-preview browser runner and the new dependency-free release checks.
2. **CI-gated release.** Upload the tested Linux artifact only for pushes to `main`; deploy only after the full Linux/macOS/Windows matrix succeeds. PRs receive no deployment credential. Release operations are serialized without dropping queued candidates and check current `main` before staging and promotion. Old workflow reruns must not cancel a newer release.
3. **Public-only deployment.** Use the explicit demo project/team and an isolated working directory, never the root private `.vercel` link. Use a dedicated project-scoped Actions token. Stage a production build without moving domains; verify its source, routes, fictional identity, documents and security headers, then promote and verify the public alias.
4. **Review and release evidence.** Test failure detection, review the final diff, push the cohesive change, observe the actual CI deployment and inspect desktop/mobile against the live demo. Record the deployed SHA and limitations in the verification record.

## Recovery

Pre-promotion failures leave the public alias unchanged. After promotion, the previous known-good deployment can be promoted explicitly if live verification identifies a defect. Disabling the deploy job stops public releases without affecting the private pilot. Revoke/replace the dedicated deployment token if access must be removed. Source reverts preserve history; no data migration or private workspace rollback is needed.

## Pre-release checkpoint

- Policy agreed and existing deployment boundaries inspected.
- Pipeline, commit provenance, release verifier and runbook implemented.
- Local checks passed: 47 release-verifier tests, 253 frontend tests, lint, types, static build and the desktop/mobile public-preview browser runner.
- Independent review findings about stale reruns and promotion timeouts resolved; no remaining material source concerns found in the final review.
- Vercel email verification completed. The project-scoped token was validated against the public project, denied access to the private project, and stored directly as the GitHub Actions secret `VERCEL_DEMO_TOKEN` without displaying its value.
- Source is ready for its first automatic release. Observe the [Checks workflow](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml) and the public `/release.json` for hosted execution and live revision evidence. No private pilot deployment or installed workspace upgrade is part of this release.
