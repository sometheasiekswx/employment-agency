# Demo content and walkthroughs

The public web showcase and the installed CLI demo use separate datasets. Both use fictional career information and generated sample documents. They do not describe the repository owner's career or record real employer contact.

|                     | Public web showcase                                    | Existing CLI demo                                            |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Interface           | Current charcoal and lavender source interface         | The interface bundled with the version you install           |
| Candidate           | Alex Morgan, fictional software engineer in Melbourne  | Alex Morgan, fictional software engineer in New York         |
| Jobs                | Six invented illustrative roles in four locations      | Fourteen real employer-board metadata snapshots              |
| Application records | Three illustrative records with generated sample files | Twelve generated packages with sample decisions and comments |
| Changes             | Browser-only saved-role bookmarks                      | Normal local demo-workspace operations                       |
| Runtime             | Static public site; no application backend or sign-in  | Isolated local Python server and workspace                   |

## Public web showcase

[**Explore the live demo →**](https://employment-agency-demo.vercel.app/discover/)

The showcase presents the approved location board and opportunity inspector on desktop, plus an expandable opportunity sheet on mobile. Its six views are **Discover, Applications, Career profile, Search preferences, History and Settings**. The interface uses the project's briefcase/person mark, charcoal surfaces, lavender accents and self-hosted Inter fonts.

All people, experience, employers, vacancies, compensation and review decisions in this showcase are illustrative. The sample jobs are:

| Role                      | Fictional employer  | Location  | Work model |
| ------------------------- | ------------------- | --------- | ---------- |
| Cloud Software Engineer   | Emberlane Systems   | Singapore | Hybrid     |
| Backend Engineer          | Bayform Labs        | Singapore | On-site    |
| Platform Engineer         | Fernbridge Digital  | Melbourne | Hybrid     |
| Full Stack Engineer       | Paperwell Studio    | Melbourne | Remote     |
| DevOps Engineer           | Northglass Works    | Berlin    | Hybrid     |
| Backend Software Engineer | Cedarlight Software | Toronto   | Hybrid     |

Seven confirmed sample experience statements cover Python, AWS, Terraform, PostgreSQL, React, TypeScript and CI/CD at **Example Labs (fictional)**. The profile prioritises Singapore, Melbourne, Berlin and Toronto. Work eligibility and sponsorship stay unknown; the fictional listings do not establish live availability. Example listing URLs use the reserved `example.test` domain.

The shared Python `Service` generates the bundled state, requirement assessments and real document files before the static site is built. The browser displays those results. Saving a role changes only the demo's browser bookmark state. Personal uploads, workspace edits, new document generation, external source refreshes, paid providers and employer actions are unavailable in this public showcase. Use the local application for those supported workflows.

The sample application records include a reviewed Emberlane package, a Fernbridge draft and a Cedarlight submission record. **The submission is fictional; no employer was contacted.** The documents contain sample content and must not be used as real application material.

## Current interface GIFs

The README walkthroughs are real browser captures of the current local application with the six-role fictional fixture. They show the full local interface; the public static showcase has the read-only capabilities described above. Screens use the application's own fonts and assets. They contain no private résumé, browser session or employer account. Recording does not edit documents or send an application.

| Walkthrough                                 | Animation                                                    | Reduced-motion still                                         |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Desktop discovery and opportunity review    | [discover-review.gif](media/discover-review.gif)             | [discover-review.png](media/discover-review.png)             |
| Application documents and preserved history | [application-documents.gif](media/application-documents.gif) | [application-documents.png](media/application-documents.png) |
| Mobile discovery and expandable review      | [mobile-review.gif](media/mobile-review.gif)                 | [mobile-review.png](media/mobile-review.png)                 |

The README uses `<picture>` to select the still image when reduced motion is requested and provides direct static-preview links. Lossless browser PNGs are captured at twice the displayed resolution: desktop and document assets are 2240 × 1680, displayed at 1120 × 840; mobile assets are 780 × 1688, displayed at 390 × 844. GIF timing follows the captures, with reading holds between interactions. The walkthroughs demonstrate interface navigation and sample evidence; they are not evidence that a vacancy is open or an application was sent.

[Capture provenance, timing and asset metadata](media/showcase-provenance.json).

The shared fictional seed and static exporter live in [employment_agency/public_preview.py](../employment_agency/public_preview.py). To rebuild and preview the public site from the software checkout:

```sh
.venv/bin/python -m employment_agency.public_preview --output frontend/public/demo
npm --prefix frontend run build:preview
.venv/bin/python -m http.server 8789 --bind 127.0.0.1 --directory output/public-preview/site
```

Open **http://127.0.0.1:8789**. The export writes fictional state and content-addressed document files under `frontend/public/demo/`; `build:preview` produces the standalone site in `output/public-preview/site` without replacing the Python package's normal web assets. It needs no application server or provider credentials.

Run `.venv/bin/python tests/run_public_preview_checks.py` after building to check all six routes, document views, browser bookmark isolation, disabled private operations and desktop/mobile accessibility with the production content security policy. CI runs the same static build and browser check on Linux.

For media captured against an isolated local application, [tests/serve_concept_fixture.py](../tests/serve_concept_fixture.py) uses the same seed. Build the normal production frontend before starting its capture server:

```sh
npm --prefix frontend run build
PYTHONPATH=.:tests .venv/bin/python tests/serve_concept_fixture.py --port 8788
```

This fixture creates a temporary marked demo workspace, seeds it through validated service operations and removes it when the server stops. Keep capture tools on its loopback URL and verify the fictional identity and demo marker before recording. The public static deployment uses exported fictional data rather than this local fixture server.

With that fixture running, record and encode the three walkthroughs in another terminal:

```sh
node scripts/capture-showcase.cjs
.venv/bin/python scripts/build-showcase.py
```

Capture requires Playwright with Chrome; encoding requires FFmpeg and Pillow. Lossless PNG frames and the capture manifest go under `output/readme-showcase/`. The encoder preserves their resolution and variable timing, then writes the GIFs, matching PNG posters and `docs/media/showcase-provenance.json`, retaining source timings and asset hashes. It rejects a GIF over 10 MB. `SHOWCASE_URL` can select another loopback fixture port.

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
