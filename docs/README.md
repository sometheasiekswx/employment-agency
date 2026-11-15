# Documentation

The [root README](../README.md) describes current `main`. A tagged wheel, a running private installation and a deployed site can have different revisions; their release notes, installation pin and deployment receipt identify what is actually running.

## Current guides

| Task | Guide |
| --- | --- |
| Set up a personal workspace and prepare an application | [Getting started](getting-started.md) |
| Install, back up, restore or upgrade | [Running locally](running-locally.md) |
| Choose or switch the workspace folder | [Workspace selection](workspace-folder-selection.md) |
| Connect an application agent | [Connected applications](apply-for-me.md) |
| Research companies or use CLI/API operations | [Agent cookbook](agents.md) |
| Edit documents without changing preserved versions | [Document editor](document-editor.md) |
| Reach a private local app from another device | [Tailscale](tailscale.md) |
| Understand demo data, privacy and README recordings | [Demo guide](demo.md) |
| Build or verify changes | [Contributing](../CONTRIBUTING.md), [frontend parity](frontend-rebuild.md) |
| Understand product behavior, terms and implementation | [Product](../PRODUCT.md), [glossary](../GLOSSARY.md), [system design](system-design.md), [design system](../DESIGN.md), [mobile sheet motion](mobile-sheet-motion.md) |
| Review security or dependencies | [Security](../SECURITY.md), [dependencies and notices](dependencies.md) |
| Release or recover the static public demo | [Public-demo deployment](public-demo-deployment.md) |
| Configure the separate authenticated cloud pilot | [Hosted pilot](hosted-pilot.md) |
| Build the optional native browser wrapper | [Mobile README](../mobile/README.md) |
| Compare tagged releases with newer source | [Changelog](../CHANGELOG.md), [GitHub releases](https://github.com/sometheasiekswx/employment-agency/releases) |

## Decisions and historical evidence

[Architecture decisions](adr/) record why a policy was chosen. A later decision can supersede part of an earlier one; the supersession notes and current guides take precedence for present behavior. An accepted design decision alone is not proof of implementation or a live deployment.

The following documents preserve their original release scope and measured results. Their test counts, commands, deployment status and screenshots are historical observations:

- [Original 0.1 contract](../SPEC.md), [delivery plan](plan.md) and [verification](verification.md).
- [Workspace refactor](workspace-refactor.md) and [original application decisions](application-decisions.md).
- [0.4 redesign](redesign-0.4.md) and [startup verification](startup-verification.md).
- The dated completion evidence in [frontend rebuild](frontend-rebuild.md).
- [Task plans and receipts](../tasks/README.md) and [older media provenance](evidence/).

Use the current guides for commands and capabilities. Use dated records to understand a past change or reproduce its stated revision; they do not authorize new deployments, workspace upgrades or employer submissions.
