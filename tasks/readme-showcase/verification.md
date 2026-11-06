# README and mobile UX release preparation

Prepared on 6 November 2026 against `92d8037a35054395ebe3eb0933efce4a84d691b9`. This is the pre-push evidence snapshot for the user's authorized README refresh and publication of the pending mobile UX work. The earlier mobile stage stopped locally; this follow-up explicitly authorizes commit and push. The existing checked `main` pipeline owns the public-demo release. The private career workspace and hosted pilot remain separate.

## Changes

The README now leads with full-width desktop and centered mobile GIFs, followed by a shorter product summary, current-source quick start, agent brief and links to detailed guidance. The reference repository informed its centered identity, simple navigation and progressive disclosure; no assets, personal claims or workflow instructions were copied. Version, privacy, fictional-demo and submission boundaries remain explicit.

All three walkthroughs were re-recorded against the current exported application in a fresh disposable Alex Morgan fixture on loopback port 8801. Desktop shows assessment, evidence, role comparison and saving; mobile shows live search, whole-sheet arrival, real touch expansion, scrolling, collapse, drag dismissal and outside dismissal. Documents opens from the combined Opportunities workspace and follows preserved History. One fictional bookmark was toggled and restored; no documents were edited, messages sent or applications submitted. Capture blocks external requests.

## Verification receipts

- Existing product checks still match the unchanged mobile source: **260 frontend tests, 163 Python tests, 108 release tests**, lint/typecheck, normal/public static builds, all local/hosted browser acceptance and public-static browser checks. The mobile UX judge rated the final candidate **9.0/10** with an unchanged rubric. See [mobile evidence](../mobile-workspace/verification.md).
- Fresh capture and encoding completed for all three journeys. Served HTML stayed unchanged throughout capture.
- `SHOWCASE_URL=http://127.0.0.1:8801 .venv/bin/python scripts/check-showcase.py` passed: every source PNG hash/dimension, every GIF frame decoded, matching PNG poster pixels, loop/timing/size and all reduced-motion fallbacks.
- Desktop: **2240×1680**, 95 GIF frames, 2,013,102 bytes. Mobile: **780×1688**, 136 frames, 4,571,929 bytes. Documents: **2240×1680**, 104 frames, 1,573,906 bytes. No spatial resizing or lossy video stage was used; each GIF is below the existing 10 MB limit.
- GitHub's Markdown API rendered the actual README, then a browser inspected it in native GitHub CSS at 1440px and 390px. Desktop GIF rendered at **838×628.5** and phone at **390×844** on desktop; narrow GitHub content rendered them at **324×243** and **324×701.156**. All preserve source aspect ratios with no fixed height. Both switched to their PNG source under reduced motion.
- Root and independent reviewer opened all fresh posters and decoded action contact sheets. The independent audit found **no material issues** in product, README, scripts, media privacy/proportions and reproducibility.
- Script syntax, local Markdown links, formatting and diff hygiene pass. `npm --prefix frontend audit --audit-level=moderate` found zero vulnerabilities. Remote publication is verified separately during the release step.

Local receipts live in ignored `output/readme-showcase/`: `capture.log`, `encode.log`, `quality.log`, `draft-readme-check.json`, native GitHub screenshots, `release-review.md` and decoded contact sheets. Public media receipts are [capture provenance](../../docs/media/showcase-provenance.json) and [quality checks](../../docs/media/quality-report.json).

## Publication and recovery

Push only the reviewed source/docs/media changes to the existing `main` remote. Observe the resulting complete CI matrix and automatic public-demo deployment, then verify the actual published README assets and the public `/release.json` against the pushed commit. The final task response records that observed outcome; this pre-push snapshot does not claim it happened. Recovery follows [the existing deployment runbook](../../docs/public-demo-deployment.md), using the previous verified public deployment if necessary. No storage migration or private installation upgrade is part of this release.

GIF's 256-colour palette and approximately 17–18 fps measured capture rate are format/capture limitations, not device performance claims. Real-device/soft-keyboard and screen-reader validation remain unverified. The long search placeholder can still clip at 320px; the mobile judge classified this as optional copy polish.
