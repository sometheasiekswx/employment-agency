# Demo content and walkthroughs

The deployed web showcase uses the owner’s approved redacted master résumé for its public profile and new drafts. The default local static export uses a fictional résumé. The installed CLI demo and the README recordings each have their own fictional workspace. Example documents and application decisions are fictional throughout.

|                     | Public web showcase                                                           | Existing CLI demo                                            |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Interface           | Light and dark interface                                                      | The interface bundled with the version you install           |
| Candidate           | Public profile and redacted master résumé                                     | Alex Morgan, fictional software engineer in New York         |
| Jobs                | 102 reviewed employer postings in seven destinations                          | Fourteen real employer-board metadata snapshots               |
| Application records | 15 sample packages and drafts prepared in the current tab                     | Twelve generated packages with sample decisions and comments |
| Changes             | Browser-local To apply choices and removals, tab-only résumé and draft editing | Normal local demo-workspace operations                        |
| Runtime             | Static public site with browser-local state                                    | Isolated local Python server and workspace                   |

## Public web showcase

[**Explore the live demo →**](https://employment-agency-demo.vercel.app/discover/)

The showcase presents the company board and opportunity inspector on desktop, plus an expandable opportunity sheet on mobile. **Opportunities** contains Jobs, To apply and Applications, alongside **Career profile, Search preferences, History and Settings**. The interface uses the project's briefcase/person mark, light and dark surfaces, lavender accents and self-hosted Inter fonts.

The public site releases automatically after all checks pass on `main`. The release marker records the deployed commit. [Release marker](https://employment-agency-demo.vercel.app/release.json) · [Deployment runbook](public-demo-deployment.md)

The showcase contains reviewed snapshots from 39 hiring companies in Singapore, Melbourne, New York, London, China, Berlin and Toronto. The China profile retains the advertised cities. Open a role for checked dates and the original advert and employer links. Check those sources for current availability, sponsorship and work rights. [Bundled catalog](../employment_agency/demo_data/showcase_jobs.json)

The browser loads the reviewed catalog bundled with the release. Companies with more than two suitable vacancies have two reviewed highlights, with fit reasons tied to the approved public profile. Every other reviewed role stays available. Verified logos appear in company headers and opened role details. An unavailable image falls back to initials. [Catalog decision](adr/0021-reviewed-public-showcase-listings.md)

The initial board shows 72 roles in Jobs, 10 in To apply, 8 in Active, 7 in Submitted and 5 in Removed. All seven Submitted examples are fictional.

The landing page links to the public résumé. Career profile shows the owner’s name and evidence drawn from the redacted master. For a new draft, the demo uses the selected résumé. Choose a PDF with selectable text, a DOCX or plain text, then review the extracted text before using it. Edit the new CV or cover letter under Active and download Word or PDF. Files and drafts stay in the current tab and clear on reload or close. The local app supplies lasting workspace storage, custom LaTeX templates and the complete application workflow.

The shared Python `Service` generates the bundled state, requirement assessments and real document files before the static site is built. The browser displays those results. To apply choices, removal, restoration and optional reasons stay in the visitor's browser. Applications → Removed holds removed roles with their saved documents and activity. Restore returns a role to its previous lists. Persistent career-data edits, external source refreshes, paid providers and employer actions are unavailable in this public showcase. Use the local application for those supported workflows.

## Current interface GIFs

The README walkthroughs record the current local interface with motion enabled. Desktop shows the company board, the profile chooser in Filters, Overview evidence, in-place comparison and Apply later feedback. Mobile shows live search, the sheet opening, one upward body swipe that expands and starts reading, a second swipe to read, header collapse, footer expansion, dismissal and an ordinary disclosure tap. The document walkthrough opens the role's Documents panel, reveals supporting files and follows the version into History. The recordings use the application's fonts and artwork and the six-role Alex Morgan fixture.

| Role                      | Fictional employer  | Location  | Work model |
| ------------------------- | ------------------- | --------- | ---------- |
| Cloud Software Engineer   | Emberlane Systems   | Singapore | Hybrid     |
| Backend Engineer          | Bayform Labs        | Singapore | On-site    |
| Platform Engineer         | Fernbridge Digital  | Melbourne | Hybrid     |
| Full Stack Engineer       | Paperwell Studio    | Melbourne | Remote     |
| DevOps Engineer           | Northglass Works    | Berlin    | Hybrid     |
| Backend Software Engineer | Cedarlight Software | Toronto   | Hybrid     |

| Walkthrough                                 | Animation                                                    | Reduced-motion still                                         |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Desktop discovery and opportunity review    | [discover-review.gif](media/discover-review.gif)             | [discover-review.png](media/discover-review.png)             |
| Application documents and preserved history | [application-documents.gif](media/application-documents.gif) | [application-documents.png](media/application-documents.png) |
| Mobile discovery and expandable review      | [mobile-review.gif](media/mobile-review.gif)                 | [mobile-review.png](media/mobile-review.png)                 |

The README leads with a full-width desktop GIF followed by a centered phone GIF, preserving readable layouts rather than shrinking both into table columns. It uses `<picture>` to select the still image when reduced motion is requested and provides direct static-preview links. Lossless browser PNGs are captured at twice the intended display size: desktop and document assets are 2240 × 1680, capped at 1120 × 840; mobile assets are 780 × 1688, capped at 390 × 844. GitHub can reduce widths to fit its content column; no fixed height stretches or squeezes the images. GIF timing follows the captures, with reading holds between interactions. The walkthroughs demonstrate interface navigation and sample evidence; they are not evidence that a vacancy is open or an application was sent.

[Capture provenance, timing and asset metadata](media/showcase-provenance.json) · [Decoded asset and source-frame quality checks](media/quality-report.json).

### Build the public preview locally

Run the exporter and static build from the software checkout. [Exporter source](../employment_agency/public_preview.py)

```sh
.venv/bin/python -m employment_agency.public_preview --output frontend/public/demo
npm --prefix frontend run build:preview
.venv/bin/python -m http.server 8789 --bind 127.0.0.1 --directory output/public-preview/site
```

Open **http://127.0.0.1:8789**. The exporter writes reviewed listing snapshots, fictional profile and application state, and content-addressed files under `frontend/public/demo/`. `build:preview` produces the standalone site in `output/public-preview/site`, leaving `employment_agency/web/` available for the local app. Serve the static files directly with the Python command above.

Run `.venv/bin/python tests/run_public_preview_checks.py` after building to verify the routes, sample decisions, reviewed listings and highlights, displayed logos, browser bookmark isolation, résumé import, draft downloads and desktop/mobile accessibility with the production content security policy. CI runs the same static build and browser check on Linux.

To refresh the public catalog, follow the [shared research workflow](agents.md#research-five-companies), then use `scripts/import-showcase-research.py` with a new isolated workspace, the already-approved public profile bundle and reviewed research files. The installed shared build must support `company-research-complete`. The importer refuses incomplete destination coverage, stores logos through shared operations, saves comparison bases and requires successful research completion before writing `demo_data/showcase_jobs.json`. Keep the workspace and approved résumé inputs outside tracked source. Regenerate `frontend/public/demo`, build and verify the static site. Changing the approved résumé requires another comparison review. The older metadata-only refresh script refuses to overwrite this reviewed catalog.

### Record the fictional walkthroughs

Build the normal production frontend and start the six-role local fixture. [Fixture source](../tests/serve_concept_fixture.py)

```sh
npm --prefix frontend run build
PYTHONPATH=.:tests .venv/bin/python tests/serve_concept_fixture.py --port 8788
```

This fixture creates a temporary marked demo workspace, seeds it through validated service operations and removes it when the server stops. Keep capture tools on its loopback URL and verify the fictional identity and demo marker before recording. The public static deployment serves exported state and documents without this local fixture server.

With that fixture running, record and encode the three walkthroughs in another terminal:

```sh
node scripts/capture-showcase.cjs
.venv/bin/python scripts/build-showcase.py
.venv/bin/python scripts/check-showcase.py
```

Capture requires Playwright with Chrome, and encoding requires FFmpeg and Pillow. Chromium touch input drives the mobile gestures. The capture asserts that a swipe expands and scrolls before release, a second swipe continues scrolling, a footer drag preserves the To apply choice, and a normal evidence tap still works. The script checks the fictional fixture before recording and verifies its To apply choices after restoration. `SHOWCASE_URL` selects the same loopback fixture for capture and checking.

Lossless frames and the capture manifest go to `output/readme-showcase/`. The encoder writes the GIFs, PNG posters and `docs/media/showcase-provenance.json` with source timing and hashes. It enforces a 10 MB GIF limit. The checker verifies GIF decoding, source hashes and dimensions, poster pixels and README fallbacks. It saves `docs/media/quality-report.json` and local action contact sheets. Use the palette-error measure to assess GIF encoding. [Mobile interaction details](mobile-sheet-motion.md)

## Existing CLI demo

The CLI dataset is unchanged by the new web showcase. Its fictional New York candidate, Harbor Metrics, Northstar Transit, Hudson College, dates, experience, education and review decisions are sample material. The source résumé is bundled at [employment_agency/demo_data/resume.txt](../employment_agency/demo_data/resume.txt) and is imported and reconciled through normal validated operations.

The jobs are real metadata snapshots from MongoDB and Datadog employer boards, checked on **31 October 2026, Melbourne time**. The exact UTC retrieval timestamp and role URLs are in [the bundled snapshot](../employment_agency/demo_data/jobs.json). Its fourteen listings cover New York, New Jersey/Princeton, Boston, San Francisco and Toronto. Descriptions are short metadata summaries; salary, work rights and ongoing availability are not invented.

Sources: [MongoDB employer board](https://boards-api.greenhouse.io/v1/boards/mongodb/jobs), [Datadog employer board](https://boards-api.greenhouse.io/v1/boards/datadog/jobs). These employers do not endorse the project. Recheck the original listing before acting. Boston and San Francisco appear in the All destinations profile; multi-office examples retain their complete advertised location lists in the bundled data.

### Start and reopen

After installing the released wheel or building this checkout:

```sh
.venv/bin/python -m employment_agency demo demo-workspace --serve
```

Open **http://127.0.0.1:8770**. Windows uses `.venv\Scripts\python`. Seeding runs offline, without a paid model, provider key or external account. It creates fifteen confirmed sample facts, three profiles, fourteen job records and twelve application packages, including PDFs, editable Word documents, evidence and review comments.

An existing destination is refused. Reopen a marked demo without replacing its edits:

```sh
.venv/bin/python -m employment_agency demo demo-workspace --open --serve
```

The header identifies the fictional profile. Runtime configuration stays under the demo's `.runtime/`, preserving the remembered personal-workspace location. `--open` verifies the demo markers and rejects ordinary personal workspaces. Seeding stages all documents before publishing the new destination; normal package validation, integrity checks and workspace locks apply.

### Earlier release media

[docs/demo.gif](demo.gif), [docs/preview.png](preview.png) and the `docs/evidence/0.6-*` assets belong to the earlier release walkthrough. Their source provenance is retained in [0.6-media-origin.txt](evidence/0.6-media-origin.txt). The old capture script targets that earlier interface; these assets are historical references rather than the current README showcase.

A maintainer can explicitly refresh the CLI's public metadata with `python scripts/refresh-demo-jobs.py`. That makes bounded read-only employer-board requests and is never run at startup, during demo seeding or by automated tests. Review changed jobs, keywords, dates, counts and media before publishing a refreshed snapshot.
