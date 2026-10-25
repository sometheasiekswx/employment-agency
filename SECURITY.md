# Security and privacy

This is a single-user localhost application, not a multi-user hosted service. It binds only to 127.0.0.1, validates Host/Origin and mutation tokens, uses a restrictive content policy and escapes rendered text. Keep the workspace and its backups private. Other processes running as your OS user can read it; there is no encryption-at-rest claim.

Public job URL retrieval requires HTTPS, rejects non-global addresses, pins the validated IP for the TLS connection and rechecks each redirect. Fetches have size/time limits. Adverts and imports are data, never instructions. TeX imports are extracted as text without execution. DOCX expanded size and PDF page counts are bounded; parsing third-party files still depends on the document libraries, and only trusted local users should import files.

Credential input is environment-only. Keys are not in export schemas. Consent is scoped and revocable; restore clears grants. API errors omit response bodies. Export archives are checksummed and restored to new destinations with path/size checks. File downloads are allowlisted; packages preserve the exact reviewed version.

No telemetry, scheduler, employer upload or email-send endpoint is included. Do not add remote exposure, automatic submission, arbitrary shell execution or model-generated commands without a new threat model.

Report vulnerabilities privately through GitHub private vulnerability reporting when enabled. Avoid placing personal data, API keys or workspace exports in issues.
