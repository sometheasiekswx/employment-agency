# Public demo refresh delivery

## Catalog and activity

The shared SQLite research operation completed for all 102 reviewed roles and 39 employers with no blockers. The catalog adds 69 roles at 21 employers and retains 33 roles at 18 baseline employers. Of the 25 baseline employers that needed a logo, nine passed the new verification attempts. The other 16 employers and their 34 roles are absent from the public fixture.

| Destination | New employers | Added roles |
| --- | --- | ---: |
| Singapore | Zenika, Open Government Products, NCS | 9 |
| Melbourne | Linktree, Civica, Ippon Technologies | 9 |
| New York | Bloomberg, Oscar Health, The New York Times | 9 |
| London | Jane Street, Palantir, Lendable | 13 |
| China | Tencent, Flexport, HSBC | 9 |
| Berlin | Taktile, Kombo, Almedia | 10 |
| Toronto | Cohere, Feathery, Braze | 10 |

The final catalog has 25 reviewed pairs. The export revalidates the remaining eligible inventory after sample activity and the approved résumé publication. It shows 19 current highlight pairs. The five initial queues contain 72 Jobs, 10 To apply, eight Active, seven Submitted and five Removed. Half of Jobs carry New. Active, Submitted and Removed samples are assigned to new employers so saved visitor choices from the earlier release remain usable. The two-selection allowance holds for the initial state.

The approved static export contains 39 local normalized PNGs and 15 application versions. The 15 sample CV PDFs match the approved résumé SHA-256. Sample submissions display “No application was sent.” The strict file audit confirmed that the 34 excluded role IDs, superseded source archives, orphan document versions, unused logo files and machine paths are absent from both exported fixtures. The candidate fixture revision was `9da6121b590fc8de393e`. The final approved local static fixture revision after the public label update was `a5061ff041e2b8326cc2`.

## Verification

| Check | Command or evidence | Result |
| --- | --- | --- |
| Import and shared completion | `sh output/public-demo-logos-activity/product/final-import.sh --resume "$PWD/tasks/public-demo-logos-activity/research/melbourne-extra.json"` | 102 roles, 39 employer records, 39 logos, zero completion blockers. The resumed import recovered an intermittent Ippon branding fetch using the same isolated workspace. |
| Logo formats and provenance | `.venv/bin/python -m unittest discover -s tests -p test_company_logos.py` | 30 passed, including SVG resource and complexity boundaries, static GIF, exact responsive width variants, raster integrity, provenance and readback. |
| Importer checks | `.venv/bin/python -m unittest discover -s tests -p test_import_showcase_research.py` | Two passed, including retained logo integrity, reviewed coverage, pick validation and a 12-role employer. |
| Preview projections | `.venv/bin/python -m unittest discover -s tests -p test_public_preview.py` | Eight passed, including the independent 96-role projection, stable choices, all five activity stages, approved document publication, and current highlights. |
| Full Python suite | `.venv/bin/python -m unittest discover -s tests` | 414 passed on the final catalog and product code. |
| Tracked fallback export | `.venv/bin/python -m employment_agency.public_preview --output frontend/public/demo` | 102 roles, 15 packages and 119 unique downloadable document assets. |
| Approved production static build | `EA_PUBLIC_DEMO_RESUME_DIR="$PWD/output/demo-listing-refresh/public-resume" EA_PUBLIC_DEMO_PYTHON="$PWD/.venv/bin/python" npm --prefix frontend run build:preview` | Passed with 394 static files. The approved version has 94 unique downloadable document assets. |
| Production-CSP browser checks | `.venv/bin/python tests/run_public_preview_checks.py` | Both scripts passed on the approved final build. They verify all 39 marks in actual Light and Dark settings, queue membership, sample labels and files, stored-role pruning, admitted bookmark and removal persistence, tab-local résumé and draft editing, mobile and desktop layouts and accessibility. |
| Shared local and hosted browser checks | `.venv/bin/python tests/run_browser_checks.py` | Passed on the product code before the final catalog import. |
| Hosted install | `.venv/bin/python tests/check_hosted_install.py` | Passed dependency bootstrap before the frontend build. |
| Frontend | `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm --prefix frontend test`, `npm --prefix frontend run build` | Typecheck and lint passed, 391 tests passed, and normal packaging built. |
| Public demo label | `npm --prefix frontend test -- src/components/shell.test.tsx src/lib/public-preview.test.tsx`, approved static rebuild and `.venv/bin/python tests/run_public_preview_checks.py` | All 37 focused tests and both production-CSP browser scripts passed after the label update. The actual approved build displays “Public demo” in both desktop and mobile navigation. |
| Static release checks | `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` | 109 passed. The strict live verifier also checks each dated catalog logo checksum on the deployment origin. |

The branch-local product logs and completion receipt are under `output/public-demo-logos-activity/product/`. The browser contact sheet shows each official mark at the 23px card size and at a larger scale on the app’s logo background. Screenshots of Jobs and the sample queues are under `output/playwright/public-preview/`.

## Publication

The exact checked revision and live alias verification will be recorded after repository checks and promotion complete.
