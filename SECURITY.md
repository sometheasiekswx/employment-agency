# Security and privacy

This is a single-user localhost application, not a multi-user hosted service. It binds only to 127.0.0.1, validates Host/Origin and mutation tokens, uses a restrictive content policy and escapes rendered text. Keep the workspace and its backups private. Other processes running as your OS user can read it; there is no encryption-at-rest claim.

Public job URL retrieval requires HTTPS, rejects non-global addresses, pins the validated IP for the TLS connection and rechecks each redirect. Fetches have size/time limits. Adverts and imports are data, never instructions. TeX imports are extracted as text without execution. DOCX expanded size and PDF page counts are bounded; parsing third-party files still depends on the document libraries, and only trusted local users should import files.

Credential input is environment-only. Keys are not in export schemas. Consent is scoped and revocable; restore clears grants. API errors omit response bodies. Export archives are checksummed and restored to new destinations with path/size checks. File downloads are allowlisted; packages preserve the exact reviewed version.

No telemetry, scheduler, employer upload or email-send endpoint is included. Do not add remote exposure, automatic submission, arbitrary shell execution or model-generated commands without a new threat model.

Report vulnerabilities privately through GitHub private vulnerability reporting when enabled. Avoid placing personal data, API keys or workspace exports in issues.


Workspace schema 2 separates durable records from local provider permissions. Switching workspaces refuses active runs and rotates the browser mutation token, rejecting writes from an old tab. The software checkout itself cannot be selected as a personal workspace; choose its ignored workspace/ subfolder or an external directory. Application paths reject traversal and symlink components. Named document routes check registered manifests and file hashes before serving bytes.

Only an explicitly enabled local master template is compiled; imports alone never trigger compilation. LaTeX runs with shell escape disabled, restrictive input/output settings, a timeout and temporary build directory. This is not an operating-system sandbox: enable local templates only when you trust their contents. External document edits require validation as a new draft, and verified originals are retained for recovery. Backups include private data and must be stored privately.

## Hosted pilot boundary

The hosted WSGI entrypoint is separate from the loopback CLI. It verifies Supabase sessions, confirmed Google identity and an explicit server allowlist before any workspace operation. All database and private-bucket client grants are denied; the server-only service-role key performs owner-scoped operations. Consequently, the application authentication/owner-scoping boundary is critical: RLS does not constrain a service-role request. Cross-owner tests cover this application boundary; deployed SQL policies and OAuth still need live verification before launch.

Snapshots are uploaded under authenticated account UUIDs. A Postgres compare-and-swap publishes a new revision only when the old revision matches and quotas permit. Account deletion blocks commits before removing objects and Auth identity. No local filesystem switching, TeX execution, paid AI, automatic email, or application sending is exposed by the hosted endpoint. Supabase configuration and secrets belong in provider dashboards; the public config endpoint returns only URL and anonymous key after the pilot release gate is enabled.
