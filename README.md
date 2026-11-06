<div align="center">

<img src="frontend/public/employment-mark.svg" alt="Employment Agency briefcase and person mark" width="48" height="51">

# Employment Agency

**Your next move, with the evidence in view.**

Find roles in your chosen locations, assess the match and prepare applications you control.

<p>
  <a href="https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml"><img src="https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
  <a href="https://github.com/sometheasiekswx/employment-agency/releases"><img src="https://img.shields.io/github/v/release/sometheasiekswx/employment-agency?color=C994F3" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-26272A" alt="MIT licence"></a>
</p>

[**Explore the live demo →**](https://employment-agency-demo.vercel.app/discover/)

Six fictional roles · Four locations · No sign-in

[The workspace](#the-workspace) · [Run locally](#run-locally) · [Use your agent](#use-your-agent) · [Documentation](#documentation)

</div>

### Desktop · Keep the shortlist in view

Compare opportunities, choose a profile in Filters and inspect supporting evidence in the same workspace.

<a href="docs/media/discover-review.gif">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/discover-review.png">
    <img src="docs/media/discover-review.gif" alt="Desktop Opportunities workspace comparing fictional roles by location, opening the inspector and reviewing career evidence without leaving the shortlist" width="1120">
  </picture>
</a>

[Full desktop GIF](docs/media/discover-review.gif) · [Static preview](docs/media/discover-review.png)

### Mobile · Search, assess, swipe

Search as you type. Swipe anywhere in the partial sheet to expand or close. Keep swiping upward to move straight into reading.

<p align="center">
  <a href="docs/media/mobile-review.gif">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/mobile-review.png">
      <img src="docs/media/mobile-review.gif" alt="Mobile Opportunities filtering fictional roles live, expanding and reading in one continuous swipe, dragging from the footer, and returning to the shortlist" width="390">
    </picture>
  </a>
</p>

<p align="center">
  <a href="docs/media/mobile-review.gif">Full mobile GIF</a> · <a href="docs/media/mobile-review.png">Static preview</a>
</p>

The recordings use a disposable fictional workspace. The [public demo](https://employment-agency-demo.vercel.app/discover/) lets you explore sample documents and save browser bookmarks; editing, uploads and employer actions are disabled. [Demo data and capture details](docs/demo.md).

## The workspace

| View                   | What you can do                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Opportunities**      | Compare Recommended, All roles, Saved and Applications. Review evidence, documents and activity in context. |
| **Career profile**     | Import your résumé, confirm experience and retain its sources.                                              |
| **Search preferences** | Choose roles, locations and work models; manage sources and matching.                                       |
| **History**            | Open the exact preserved version of a document.                                                             |
| **Settings**           | Select a private workspace, manage consent and export a backup.                                             |

Assessments keep evidence, gaps and unknowns visible. Live search, loading skeletons, save feedback and recoverable errors support the review flow. Keyboard navigation stays immediate; motion follows your reduced-motion preference.

**Preparing a draft does not submit an application.** You review the documents and control the decision. Work rights, sponsorship and vacancy availability still need verification. The source-only [Apply For Me preview](docs/apply-for-me.md) requires separate, explicit approval for sending or submission.

## Run locally

<a id="quickstart"></a>

For the interface shown above, build the current source with **Python 3.11+**, **Node.js 24+** and npm:

```sh
git clone https://github.com/sometheasiekswx/employment-agency.git
cd employment-agency
python3 -m venv .venv
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
.venv/bin/python -m pip install .
.venv/bin/python -m employment_agency --workspace ../career-workspace serve
```

Open **http://127.0.0.1:8766**. Keep Terminal open; Ctrl+C stops the app. `../career-workspace` keeps personal data outside the public software checkout. On Windows, use `py -3` and `.venv\Scripts\python`. Node is needed to build the interface; the installed app runs on Python.

For private iPhone access while the Mac runs the app, use the source checkout's [Tailscale setup](docs/tailscale.md).

The public demo follows checked `main` releases. The published **v0.6.0 wheel contains its earlier interface**; updating the public demo does not upgrade an installed workspace. Export a backup and test a restored copy before upgrading. [Installation, Windows guidance and recovery](docs/running-locally.md) · [Release downloads](https://github.com/sometheasiekswx/employment-agency/releases) · [Offline demo](docs/demo.md#existing-cli-demo).

## Use your agent

Codex, Claude Code or another coding agent can research jobs and use the same validated CLI/API. Start with this brief:

```text
Help me prepare applications using Employment Agency.
Read README.md, CONTRIBUTING.md and docs/agents.md in the software checkout.
My private career workspace is: /absolute/path/to/my-private-workspace

Check existing facts, profiles and decisions before making changes.
Research roles in my chosen locations; retain source URLs and checked dates.
Show a ranked shortlist with evidence and gaps before preparing drafts.
Use confirmed experience, preserve document versions and ask about unknowns.
Stop before paid requests, uploads, sending or submission.
Keep personal data out of the public repository and its screenshots.
```

[Agent cookbook, operations and provider consent](docs/agents.md).

## Contribute

React, Next.js and TypeScript own the interface; Python owns validation, matching, documents and workspace state. Production uses a static frontend export served by Python, with no second Node server. Career workspaces remain separate data folders.

Use fictional data and run the existing checks:

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/run_browser_checks.py
```

[Contributor setup and live development](CONTRIBUTING.md) includes browser prerequisites and an isolated workspace. Preserve submitted snapshots and keep credentials, personal documents and browser sessions out of Git.

## Documentation

[System design](docs/system-design.md) · [Design system](DESIGN.md) · [Document editing](docs/document-editor.md) · [Security](SECURITY.md) · [Deployment and recovery](docs/public-demo-deployment.md) · [Private hosted pilot](docs/hosted-pilot.md)

<details>
<summary>See document review and preserved history</summary>

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/application-documents.png">
  <img src="docs/media/application-documents.gif" alt="Fictional application document files, source evidence and their preserved versions in History" width="1120" loading="lazy">
</picture>

[Static document preview](docs/media/application-documents.png) · [Capture provenance](docs/demo.md#current-interface-gifs)

</details>

Original code is [MIT](LICENSE). Third-party components and fonts retain their own licences. [Dependencies and notices](docs/dependencies.md).
