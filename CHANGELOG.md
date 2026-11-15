# Changelog

## After 0.7.0 — current main

These source updates are newer than the tagged 0.7.0 wheel. The public demo follows verified `main` deployments; private installed builds require an explicit upgrade.

- Combine bookmark and agent-mark choices into **Apply later → To apply**. SQLite schema 7 rebuilds the queue indexes; the tagged 0.7.0 wheel uses schema 6.
- Keep company columns and remaining review order stable during save, remove and Undo. Preserve optimistic decisions across superseded or failed refreshes.
- Show original company logos in group headers and opened details without added backgrounds. Put titles at the top of previews, stack Remove and Apply later vertically, and place status beside location. Keep the generic work-rights confirmation notice in details.
- Enforce company allowance for pending choices and recoverably remove remaining Jobs after two distinct confirmed submissions. Preserve submitted versions, uncertain holds and removal history.
- Require reviewed, evidence-backed pairs of highlights when research covers a company with more than two suitable distinct roles. Retain every other eligible role and report missing or stale comparisons.
- Publish a dated, reviewed public catalog with official logo evidence, supported highlights and sample activity instead of automatically replacing listings from live feeds.
- Refresh current setup, architecture and security guidance; keep dated task evidence separate and local design-tool state out of Git.

## 0.7.0 — 14 November 2026

Prepare an application and open its CV in the same role workspace. Self-apply follows **Open application site → I've applied**, retaining actual submission evidence and exact documents. The local connected agent can prepare and submit a named role when started with explicit authority and a supported runtime/channel. Missing information and uncertain outcomes pause for help. Hosted and public-demo execution remain disabled.

This release uses SQLite schema 6 and the earlier **For my agent** queue. It also includes the company submission rules, private remote/development workflows and current React/Python architecture developed since 0.6. See the [release notes and verified wheel](https://github.com/sometheasiekswx/employment-agency/releases/tag/v0.7.0) and [upgrade guidance](docs/running-locally.md#existing-environments-and-upgrades).

## 0.6.0 — 30 October 2026

The then-current white/Sky Blue interface reduced visual noise and expanded the offline fictional demo to 14 dated job snapshots and 12 generated packages. README media, source setup and packaged-wheel checks were updated. Later source changes replace that visual direction. [Release notes](https://github.com/sometheasiekswx/employment-agency/releases/tag/v0.6.0)

## 0.5.0 — 30 October 2026

Added the populated offline demo, README walkthrough media and Python-only wheel installation guidance, with the then-current Sky Blue theme. Shared workspace storage, React frontend and hosted-pilot work between 0.1.1 and 0.5 are retained in the [historical documentation](docs/README.md#decisions-and-historical-evidence). [Release notes](https://github.com/sometheasiekswx/employment-agency/releases/tag/v0.5.0)

## 0.1.1

Validate restored job links at rendering time and restrict package download IDs, including for manually edited or externally supplied workspace archives.

## 0.1.0

Initial local-first release: confirmed career facts and imports, multiple search profiles, supported live-source adapters, explainable matching, bounded resumable runs, editable documents and email drafts, scoped optional AI selection, review history and portable recovery.

Known limits: Latin-script PDF templates, lexical matching, configured-source coverage and no live paid-provider verification. All applications require human review and manual submission.
