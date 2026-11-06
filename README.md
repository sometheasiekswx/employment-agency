<div align="center">

<img src="frontend/public/employment-mark.svg" alt="Employment Agency briefcase and person mark" width="48" height="51">

# Employment Agency

**Your next move, with the evidence in view.**

A career workspace for discovering roles, reviewing your experience and preparing applications you control.

[![Checks](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml/badge.svg)](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml)
[![Release](https://img.shields.io/github/v/release/sometheasiekswx/employment-agency?color=C994F3)](https://github.com/sometheasiekswx/employment-agency/releases)
![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-C994F3)
![React + Next.js](https://img.shields.io/badge/React-Next.js-26272A)

[**Explore the live demo →**](https://employment-agency-demo.vercel.app/discover/)

Six fictional roles · Four locations · Desktop and mobile

[Run locally](#run-locally) · [The workspace](#the-workspace) · [Use your agent](#use-your-agent) · [Architecture](#architecture) · [Contribute](#contribute)

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/discover-review.png">
  <img src="docs/media/discover-review.gif" alt="The charcoal and lavender Discover workspace, with roles grouped by location and an opportunity inspector showing confirmed evidence and requirements to check" width="1120">
</picture>

[Static desktop preview](docs/media/discover-review.png) · [Demo content and media provenance](docs/demo.md)

</div>

The public demo shows the charcoal and lavender interface: a location board, an inspector that keeps each role in context, and application documents backed by recorded evidence. It uses a **fictional Alex Morgan profile and six invented vacancies** in Singapore, Melbourne, Berlin and Toronto.

Purposeful motion connects review to the shortlist: the desktop inspector arrives with a short spring, mobile details open in an expandable sheet, and bookmark feedback acknowledges a confirmed save. Keyboard operation stays immediate, and the interface follows your operating system’s reduced-motion preference.

Explore the screens, inspect sample documents and bookmark roles in your browser. The public showcase is read-only apart from those browser bookmarks. Use the local application for your own résumé, imports, profile changes and application preparation. The [private hosted pilot](https://sams-employment-agency.vercel.app) is a separate, invite-only service.

**Preparing a draft does not send an application.** You review the documents and record your own decisions. The unreleased [local Apply For Me preview](docs/apply-for-me.md) requires separate, explicit approval for Gmail sending or experimental browser submission; the published 0.6 wheel remains draft-only.

## The workspace

| View                   | What it helps you do                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Opportunities**      | Compare and save roles, then assess, edit documents and record decisions in one workspace. Switch between Recommended, All roles, Saved and Applications; filter applications by Active, Submitted or Rejected. |
| **Career profile**     | Import a résumé, reconcile master changes, confirm facts and retain their sources.                                                     |
| **Search preferences** | Set roles, locations and work preferences; manage employer sources, imports, matching and preparation runs.                            |
| **History**            | Search preserved versions by role, employer and location, then open the exact recorded documents.                                      |
| **Settings**           | Choose a local workspace, manage disclosure consent, export a backup and review recovery options.                                      |

Matching exposes evidence, gaps and unknowns. It does not establish qualifications, work rights or current vacancy availability. Configured Greenhouse and Lever boards, structured job URLs and agent research provide job records; paid AI selection is optional. [Sources, providers, consent and budgets](docs/agents.md).

In the current source build, each role has Overview, Documents and Activity panels. Switching panels keeps an unfinished review with that application; leaving it prompts before discarding changes. The document-version selector opens preserved versions without leaving the role. Application records remain available even when matching is unavailable, and existing application bookmarks continue to work.

Documents and History use matching version numbers, statuses and dates. In the text editor, Move up and Move down let you tailor section order with the keyboard before updating the preview and saving a separate draft.

Recording a submission requires confirmation that you submitted it yourself. A mistaken manual record can be corrected into a draft while preserving the original record and verified documents; active, uncertain or confirmed delivery evidence blocks this correction. Retired career facts can be restored for reconfirmation.

### Documents with their history

Open a generated résumé and inspect its preserved version. The walkthroughs use the local application with fictional data; the public demo offers the read-only exploration described above.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/application-documents.png">
  <img src="docs/media/application-documents.gif" alt="A fictional application record opening its generated résumé PDF, then reviewing the preserved document version in History" width="1120" loading="lazy">
</picture>

[Static document preview](docs/media/application-documents.png)

### Review on mobile

The same role assessment opens in an expandable sheet, with a brief content transition as details expand. Previous and next controls keep the shortlist available while you compare opportunities.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/mobile-review.png">
  <img src="docs/media/mobile-review.gif" alt="The mobile Discover workspace opening and expanding an opportunity sheet, reviewing requirements and returning to the shortlist" width="390" loading="lazy">
</picture>

[Static mobile preview](docs/media/mobile-review.png)

## Run locally

<a id="quickstart"></a>

The public demo updates automatically after all checks pass on `main`; its [release marker](https://employment-agency-demo.vercel.app/release.json) identifies the live commit. The GIFs are recorded walkthroughs and may predate the latest interface changes. The published **v0.6.0 wheel contains its earlier release interface**. Public demo releases do not publish a new wheel or upgrade an existing private workspace. [Deployment and recovery](docs/public-demo-deployment.md).

### Current source interface

Requires Python 3.11+, Node 24+ and npm. Build the frontend before installing the Python package:

```sh
git clone https://github.com/sometheasiekswx/employment-agency.git
cd employment-agency
python3 -m venv .venv
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
.venv/bin/python -m pip install .
.venv/bin/python -m employment_agency --workspace ../career-workspace serve
```

Open **http://127.0.0.1:8766**. The explicit workspace path keeps personal files outside the software checkout. The local server serves the built React interface and Python API together; Node is needed for building, not for running the installed application. No app API key is required.

Keep the terminal running; Ctrl+C stops it. **Open Folder** selects another workspace. If you already use the app, export a backup and test a restored copy before upgrading. See [running locally and recovery](docs/running-locally.md).

### Published v0.6.0 release

For the released application, start in a new folder. The wheel already includes its interface.

macOS / Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install https://github.com/sometheasiekswx/employment-agency/releases/download/v0.6.0/employment_agency_local-0.6.0-py3-none-any.whl
.venv/bin/python -m employment_agency serve
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.venv\Scripts\python -m pip install https://github.com/sometheasiekswx/employment-agency/releases/download/v0.6.0/employment_agency_local-0.6.0-py3-none-any.whl
.venv\Scripts\python -m employment_agency serve
```

Installing a release does not upload local data or update a workspace's version pin. [Upgrade instructions](docs/running-locally.md#existing-environments-and-upgrades).

### Local demo workspace

The existing CLI demo remains available after either installation:

```sh
.venv/bin/python -m employment_agency demo demo-workspace --serve
```

Open **http://127.0.0.1:8770**. On Windows, use `.venv\Scripts\python`. It creates a new, isolated workspace with a fictional candidate and **14 dated real employer-board snapshots**. This is a different dataset from the six entirely fictional roles in the public web showcase. It runs offline and generates actual PDF/DOCX files through the shared document engine.

Reopen without replacing your demo edits:

```sh
.venv/bin/python -m employment_agency demo demo-workspace --open --serve
```

[Demo datasets, source dates and reproduction details](docs/demo.md).

## Use your agent

Codex, Claude Code or another coding agent can use the same validated CLI/API. Keep the software checkout separate from your private career workspace:

```text
Help me prepare applications using Employment Agency.

Read README.md, CONTRIBUTING.md and docs/agents.md in the software checkout.
My career workspace is: /absolute/path/to/my-private-workspace

Inspect existing facts, search profiles, applications and decisions before making changes.
Use confirmed experience and retain its sources. Ask about missing facts and work rights.
Research relevant jobs and keep source URLs and retrieval dates.
Show a ranked shortlist with evidence and gaps before preparing drafts.
Create new document versions through the app; preserve submitted snapshots.
Stop before any paid AI request, employer upload, email sending or submission.
Keep personal data out of the public software repository and its screenshots.
```

[Agent cookbook: operations, JSON inputs, running-server access and recovery](docs/agents.md).

## Architecture

React, Next.js and TypeScript own the interface. Python owns validation, matching, documents and durable workspace state. The current interface uses self-hosted Inter, Lucide icons and the existing React Bits navigation and review interactions.

| Mode                     | Runtime                                                                       | Data boundary                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Public showcase**      | Static frontend with prebuilt fictional state, assessments and document files | Browser bookmarks only; no account, uploads, provider calls or application backend |
| **Local application**    | Python loopback server serving the static frontend and shared API             | Your selected private workspace folder                                             |
| **Private hosted pilot** | Authenticated hosted adapter over the shared Python services                  | Account-scoped cloud workspace; separate from local files                          |

The production application uses a static Next.js export; it does not need a second Node server. Private career workspaces contain data and intentional documents. Reusable UI, rendering, storage and application logic stay in this repository. [System design](docs/system-design.md) · [Design system](DESIGN.md) · [Hosted pilot boundaries](docs/hosted-pilot.md).

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Use disposable fictional data and keep behavior checks meaningful:

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
.venv/bin/python -m unittest discover -s tests -v
npm --prefix frontend run build
npx --prefix frontend playwright install chrome
.venv/bin/python tests/run_browser_checks.py
```

For frontend development against an explicitly selected workspace:

```sh
.venv/bin/python -m employment_agency --workspace ../career-workspace dev
```

Open **http://127.0.0.1:3000**. React and CSS edits update automatically; Ctrl+C stops both servers. Use the [isolated development setup](CONTRIBUTING.md#live-frontend-development) for contributions and preserve existing running sessions.

Useful contributions include source adapters, import fidelity, accessible interactions, document rendering and regression coverage. Describe the problem, resulting behavior and verification in your PR. Publishing, deployment and private-workspace upgrades are separate actions.

## Your files stay yours

`state.json` holds facts, profiles, jobs and decisions. `applications/City/Company/Job/Date/` holds canonical versioned documents. Master changes require confirmation. External edits create a new draft after validation; submitted snapshots retain their verified bytes. [Document editing](docs/document-editor.md) · [Backup and restore](docs/running-locally.md) · [Security](SECURITY.md).

The default renderer produces PDF and editable DOCX without LaTeX. Trusted local TeX is optional. Scanned PDFs need separately supplied OCR; arbitrary layouts are not reproduced, and unsupported font/script content fails validation.

Original code is MIT. React Bits and other third-party components retain their own terms and notices. Inter is distributed under the SIL Open Font License. [Dependencies and licences](docs/dependencies.md).
