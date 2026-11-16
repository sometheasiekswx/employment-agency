# Hybrid research handoff

The Jobs handoff must identify the workspace and selected profile, explain how
to connect, and point to a workflow guide bundled with the running build.
Copying instructions remains read-only. A research task starts explicitly.

Completion must require source receipts for the checked listings and either
valid saved logos or recorded logo attempts for covered employers. Receipts
belong to the current research task; external checks retain their provenance.
Blocked and partial retrievals remain visible coverage gaps. Existing employer,
availability and highlight checks continue to apply.

## Implemented behavior

- The copied Jobs prompt identifies the actual serving API origin, workspace,
  profile, CLI interpreter and a guide bundled in the wheel. The protected
  `GET /api/research-workflow` and CLI `research-workflow` expose the same
  SHA-256-bound text. Copying remains read-only and never embeds the API token.
- `company-research-start` creates a durable task bound to the selected profile
  and guide version. `company-research-status` exposes source and logo evidence.
  Generic workspace records retain the task through ZIP and snapshot recovery;
  no SQLite schema migration is required.
- Shared discovery and registered-board reads save source receipts atomically
  with listing imports. Content fingerprints survive SQLite field ordering.
  A later failed check cannot reuse a source's older success. External checks
  use `company-research-record`, retain operator provenance and distinguish the
  attestation's recording time from a listing's original observation time.
- Logo backfill records actual attempted URLs, supplied evidence and outcomes.
  Completion requires valid saved image bytes or a documented official-source
  attempt. A backfill with no official source does not count as an attempt.
- Completion requires `research_id` and rejects missing or changed source
  evidence, omitted checked jobs, running discovery, a changed workflow guide,
  and absent logo checks. Existing identity, availability and current highlight
  requirements remain enforced. Gaps are returned even when required checks
  pass; `coverage_complete: false` must be reported honestly.
- The showcase importer, documentation and existing browser/API callers use
  the new task contract. Existing scraper calls without a research ID still
  work, but cannot satisfy the research completion gate.
- Release review fixed the parameterless CLI guide, independent board identity,
  equivalent page URLs, delayed failure ordering, stale observations, exact
  closure evidence and empty-source logo retries. Known scraper/parser limits
  and unresolved vacancies remain partial results. Mixed structured/ordinary
  listings are followed without re-fetching already imported URLs.
- Source checks expire after 24 hours, including checks that found no jobs.
  External receipts preserve the original timezone-aware observation time;
  changing a stored timestamp cannot renew an older attestation.

## Verification

Verified 17 November 2026 (Australia/Melbourne) on macOS with fictional data.

| Check | Result |
| --- | --- |
| Initial regression | The former completion operation accepted unchecked sources and logos; the new regression failed before implementation. |
| `.venv/bin/python -m unittest discover -s tests -v` | **452 passed**, 183.505 seconds on the final runtime. Includes HTTP protection, task/profile mismatch, old guide rejection, omissions, active/stopped discovery, source identity/order, freshness, parser limits, changed content, closed listings, corrupt logos, and ZIP/snapshot restore. |
| Frontend typecheck, lint, tests, audit and production build | **Passed**; 395 tests across 36 files, zero audit vulnerabilities. |
| Public deployment scripts | **138 passed**, including staging, promotion and release verification. |
| `research-workflow-browser.cjs` using `serve_research_fixture.py` | **Passed**: actual clipboard copy, matching guide, shared scraper receipts, refusal before logo work, saved image rendered and missing-logo initials retained with an explicit completion gap. |
| `sqlite-company-browser.cjs` | **Passed** at mobile width: read-only copy and guide fingerprint, employer resolution, reservation, exact submitted bytes, cooldown and settings. |
| `company-highlights-browser.cjs` | **Passed** at desktop/mobile widths: required/stale/current comparisons and completion. |
| `tests/run_browser_checks.py` | **Passed** across local and hosted fictional fixtures, including responsive layout, accessibility, clipboard, documents, recovery and capability restrictions. The research workflow browser was rerun after the last backend fixes. |
| Wheel build and `tests/check_wheel.py --browser` | **Passed** outside the checkout: bundled guide and hash, routes/assets, structured listing extraction, documents, SQLite migration, verified recovery and installed queue browser checks. |
| Wheel/source comparison | All 54 runtime Python/guide files match the reviewed source bytes. |
| `tests/check_hosted_install.py`, `tests/check_development.py` | **Passed**: hosted dependency bootstrap, real development proxy, origin/token checks, Fast Refresh and shutdown/restart. |
| Public preview build and `tests/run_public_preview_checks.py` | **Passed**: verified logos, sample documents, public catalog, local choices and desktop/mobile layouts. |
| `tests/run_apply_checks.py` | **Passed** with controlled browser/mail fixtures; no employer action or real mail. |
| Showcase importer fresh/resume smoke | **Passed** with nine fictional roles, three verified marks and separate task receipts; an explicitly empty baseline stays empty on resume. |
| `git diff --check` | **Passed**. |

Browser checks used the existing `run_browser_checks.fixture` and `browser`
helpers. Network source boundaries were controlled; no live employer was
contacted and no application was sent. External browser attestations remain
operator evidence; this does not prove an arbitrary receiving agent will obey
every instruction or discover every vacancy. The public demo and hosted pilot
retain their existing capability restrictions; these research operations are
local workspace capabilities.

Evidence: `output/hybrid-research-handoff/` (ignored local artifacts), including
test logs and the candidate wheel. Browser screenshot:
`output/playwright/hybrid-research-handoff/completed-with-logo-gap.png`.

Candidate wheel: `employment_agency_local-0.7.0-py3-none-any.whl`.
SHA-256: `62cf756b3e4b254d1f72741ff4d499192d1b0df3995d9a875bc361fa661d1a82`.

## Release and recovery

The authorized release targets are shared `main`, its automatically deployed
public demo, the explicitly deployed private hosted pilot, and the installed
private wheel. The existing tagged 0.7.0 release remains a separate immutable
historical artifact, consistent with the repository's current-main convention.

The main `Checks` workflow is the cross-platform and public deployment gate.
The hosted pilot is staged from the exact committed archive, smoke-checked
with its existing protection, then promoted. Previous production is the
rollback target; provider settings and owner access stay in place.

Private installation acceptance requires an integrity-checked backup,
restore rehearsal, matching runtime and guide bytes, and read-only checks on
loopback/private HTTPS before updating its installation pin. The prior wheel
and runtime remain available for recovery. Private data and machine-specific
recovery evidence stay outside this public checkout. Actual release revisions
are observable in GitHub Actions, the demo's `/release.json`, Vercel deployment
metadata and each private installation's `workspace.lock.json`.
