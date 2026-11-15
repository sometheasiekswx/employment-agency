# Implementation plan: Agency identity rollout

Requirements: confirmed logo interview, 16 November 2026. Task state: [todo.md](todo.md).

## Scope and approach

Replace the current briefcase/person identity with the supplied Industrial Precision **Agency.** wordmark and **A.** compact mark. The application name remains **Employment Agency**. Use the kit at `output/logo-kits/agency-industrial-2026-11-16/index.html`, its outlined production assets and manifest; preserve the exact geometry, square punctuation, proportions, clear space and supplied light/dark colours. This is an asset integration, not a redesign or new image-generation task.

The confirmed scope covers the web shell, browser and installed-site icons, the existing iOS/Android shells, current README walkthroughs and branding documentation, the running private installation, and the established automatic public demo release. Push to shared `main`, public-demo delivery and the guarded private upgrade are authorized. App-store publication, credentials, unrelated UI changes, application documents and private-data publication are outside scope. No new routine approval gate is needed.

Planning baseline: clean shared `main` at `995bf071b666cc53d875bc8a992598f6097dc0e5`. Recheck Git before editing and preserve concurrent work. The public application owns all code; the private workspace remains data-only. Do not add the entire ignored kit/output directory to Git. Copy only the needed deliverables into their maintained destinations and record source-to-destination hashes with the verification evidence.

## Ordered slices

### A1 — Use the exact identity throughout the web app

Dependencies: supplied kit. Areas: `frontend/public/`, `frontend/src/components/shell.tsx`, `frontend/src/app/layout.tsx`, relevant `.brand` CSS, existing branding assertions.

- Replace the separate briefcase and live-text “Agency” with the outlined wordmark. Select supplied on-light/on-dark assets using the app's resolved `data-theme`, which already follows saved Light/Dark/System settings before first paint. A media query alone would ignore an explicit in-app preference. Preserve the accessible “Employment Agency — Opportunities” link and its navigation/draft guard.
- Keep the full wordmark at a readable size (the kit recommends about 160 CSS px or larger) with its intrinsic aspect ratio. Use the compact mark only where a genuinely compact surface requires it. Check the 320px header as well as the desktop rail; do not stretch the SVG or rebuild it with fonts/CSS.
- Wire the supplied SVG/ICO favicons, Apple touch icon, Safari mask and PWA `any`/`maskable` PNGs. Add a small static web manifest with product name, stable root identity/scope and `/discover/` start URL. Link it through Next metadata. This does not require a service worker or offline feature.
- Use new asset URLs for the new identity so existing favicon/image caches can discover it; include the root `favicon.ico` fallback. Any retained compatibility alias must serve the new compact artwork, never the old mark. Keep manifest/icon URLs origin-relative so local, hosted and public-preview builds all work. Preserve existing cache/security behavior; do not relax the deployment CSP or staging validators.

Acceptance: no active old brand reference; correct wordmark on both themes, saved preference/reload and live System changes; readable header without overflow; metadata resolves to the exact supplied compact assets; application title stays Employment Agency. Local static export, installed wheel and public preview include every referenced asset with correct MIME types. Browser-managed existing home-screen icons may require the user to remove/re-add a shortcut; do not claim the website can force that refresh.

Verification: existing appearance/redesign browser flows plus targeted DOM, decoded-image, metadata/manifest and asset-response checks on the production export. Extend meaningful existing checks where they currently assert `/employment-mark.svg` or packaged `icon.svg`; avoid tests that merely duplicate CSS strings. Compare copied asset bytes with kit manifest/source hashes.

### A2 — Replace native shell launcher assets

Dependencies: A1 asset selection; can otherwise proceed independently. Areas: `mobile/ios/Sources/Assets.xcassets/AppIcon.appiconset/`, `mobile/android/app/src/main/res/`, `mobile/README.md` only where explanation is needed.

Copy the supplied iOS default/dark/tinted catalog and Android adaptive, monochrome and density-specific launcher resources. Remove the replaced old icon files. Keep bundle IDs, app labels, origins, signing configuration, deployment targets and store settings. No Xcode project regeneration is needed merely to replace files within the existing catalog.

Acceptance: Xcode compiles the catalog with all appearances; Android resolves foreground/background/monochrome resources and both normal/round launchers; masks do not crop the A or square. Preserve the kit's opaque iOS canvases and adaptive safe area. Source/build completion is distinct from installation on a physical phone or app-store distribution.

Verification: inspect native capabilities first, then build with existing tools. Xcode 27.2 is present and an iOS simulator is available. `adb devices -l` showed no attached Android target during planning; inspect available emulators and SDK 37 before claiming Android runtime coverage. Build and install on a disposable simulator/emulator when available, inspect the home-screen icon and launch the existing fictional workspace. Record unavailable physical-device/tinted-launcher checks explicitly; do not invent their results or silently install an absent capability.

### A3 — Refresh current presentation and brand guidance

Dependencies: A1. Areas: `README.md`, `DESIGN.md`, `docs/demo.md`, the three current `docs/media/` GIF/PNG pairs and their generated provenance/quality reports; other current references found by inventory.

Use the exact themed wordmark in the README with natural dimensions. Update the old briefcase/person description and source authority in DESIGN, retaining the rest of the established interface direction. Record which maintained assets own each surface, the product name and colour/size rules. Regenerate current README walkthroughs from the existing six-role fictional fixture using the established capture/encode/check tools. Inspect the rendered GIFs/posters, not just their metadata.

Acceptance: current documentation and media show the new identity and carry updated capture provenance. Dated task screenshots, `docs/evidence/`, earlier `docs/demo.gif`/`docs/preview.png` and other historical evidence keep their original bytes. No real private records enter screenshots or public source, and no application document is rebranded.

Verification: `scripts/check-showcase.py`, current-link/old-brand inventory review, visual inspection of all three refreshed walkthroughs, and `git diff --check`. Classify historical matches rather than performing a repository-wide text/image rewrite.

### A4 — Verify the complete shared candidate and review it

Dependencies: A1–A3. Areas: existing tests, wheel proof and task verification record.

Run the project's normal frontend checks, Python suite, production-export browser suite and public-preview acceptance. Build the wheel and run its installed proof outside the source checkout. Check the branded asset bytes in both generated export destinations and wheel; keep `tests/check_wheel.py` aligned with the supported icon/manifest files. Review the final diff independently using the user's requested implementation/review model, with findings fixed and relevant checks rerun.

Acceptance: existing navigation, appearance, application/submitted-version handling, company highlights and public-demo checks remain passing. An asset-only change does not justify weakened assertions or dependency upgrades. Evidence distinguishes local checks, native builds/simulators, CI, deployed verification and physical-device gaps.

### A5 — Prepare and verify a normal private upgrade

Dependencies: candidate wheel from A4; backup inventory/preflight can start earlier. Owning instructions: [running-locally.md](../../docs/running-locally.md#existing-environments-and-upgrades) and the private workspace's README, lock and instructions. Keep all private paths, exports, hashes of personal records, logs and screenshots outside this public repository.

Prefer the normal shared wheel over another private overlay. The old private pin combined frontend `478173a` with the required-highlight backend. Current `main` contains the consolidated highlight feature (`4dd65e9`). Planning comparison found all tracked `frontend/src` files identical to that installed candidate; the core store/service/CLI/submission code also matches. The remaining backend differences are company-logo/public-catalog changes and compatibility handling for non-final research assessment. `pyproject.toml` adds `resvg-py==0.5.0` and packaged showcase logos. Recheck this comparison against the final candidate; do not infer equivalence solely from the version string `0.7.0`.

1. Read the current lock and inspect the actual running interpreter, workspace and process. Preserve unrelated private Git changes. Record the previous pin, wheel and interpreter in a new protected recovery directory outside both repositories.
2. Export through the running app's supported export operation, or stop it and export with the exact old interpreter. Do not open the live SQLite database independently while its server is active. Hash the completed archive and restore it into a new directory. Install the candidate in a new environment; invoke it from outside source checkouts with a separate `EA_CONFIG_HOME`.
3. Verify restore/integrity and the documented SQLite schema; this branding change needs no schema migration. Compare canonical records and application/history/submitted document bytes, accounting only for documented restore changes (new workspace ID and reset consent). Preserve every unrelated file. Inspect the copy read-only in the candidate UI. Run mutation/highlight regressions on fictional fixtures, not the real data or its restored copy.
4. Exercise `company-best-matches`/research-completion behavior with the existing fictional browser/contract checks and verify the restored workspace still exposes its current highlights and records. Confirm the new assets through the candidate's HTTP server.
5. Immediately before cutover, check for new workspace saves and refresh export/restore evidence if needed. Stop only the identified old process, start one candidate process on the established port/configuration, then verify the intended workspace through loopback and existing private HTTPS. Check theme/header/icon responses, Submitted/history visibility and retained highlight availability without changing application decisions.
6. Update the private lock and minimal installed-build documentation only after acceptance, including exact shared commit, wheel hash, interpreter, backup and rollback evidence. Keep machine-specific artifacts out of shared Git; private commit/push is not authorized by this rollout.

Acceptance: the real workspace runs the tested branded candidate with retained highlights and unchanged application document bytes. Backup restore is demonstrated before cutover. Rollback keeps the old interpreter/wheel/pin available; after any new saves, first export current state and reconcile later decisions rather than overwriting live data with an older backup.

### A6 — Publish and verify the actual release targets

Dependencies: A4 and successful A5 preflight; final private cutover uses the exact reviewed shared commit. Areas: existing shared Git delivery and Checks workflow; private installation metadata only.

Push the reviewed shared change to authorized `main` through the repository's established path, without force-push. Follow all three CI platforms and the existing public-demo deployment through completion. Verify the exact released commit marker, security checks and new branded assets on the public alias, then inspect desktop/mobile and theme behavior in a browser. Do not use the root private Vercel link, change credentials, publish a wheel/tag/app-store build or create a second release mechanism. Complete A5 cutover against that exact shared revision and report both delivery outcomes.

Acceptance: source is on shared main, required CI and automatic public-demo release succeed, the public alias serves the expected commit and new identity, and private installation acceptance is recorded privately. If one target fails, report it specifically and use its existing recovery path; do not label the whole rollout deployed from local evidence alone.

## Concrete verification commands

Run from the shared checkout unless noted. Keep normal and preview builds sequential because their preparation/output paths are shared. Reuse passing results when the tested files have not changed.

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m unittest discover -s tests -q
.venv/bin/python tests/run_browser_checks.py
.venv/bin/python -m pip wheel --no-deps . --wheel-dir output/agency-logo-rollout/wheel
.venv/bin/python tests/check_wheel.py --browser output/agency-logo-rollout/wheel/employment_agency_local-0.7.0-py3-none-any.whl
npm --prefix frontend run build:preview
.venv/bin/python tests/run_public_preview_checks.py
git diff --check
```

Use the installed dependency environment; check its Python version before running. Existing CI additionally runs dependency audit, release-tool tests and hosted/development/apply checks; keep those gates unchanged. If the release verifier is extended to check brand assets, run its existing Node tests as well.

For current media, run `PYTHONPATH=.:tests .venv/bin/python tests/serve_concept_fixture.py --port 8788` after the normal build, then sequentially run `node scripts/capture-showcase.cjs`, `.venv/bin/python scripts/build-showcase.py`, and `.venv/bin/python scripts/check-showcase.py`. Stop only that fixture afterward.

For native build checks, select an available simulator and retain outputs under ignored `output/agency-logo-rollout/`:

```sh
xcodebuild -project mobile/ios/EmploymentAgency.xcodeproj -scheme EmploymentAgency -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath output/agency-logo-rollout/ios EA_WORKSPACE_ORIGIN=http://127.0.0.1:8876 CODE_SIGNING_ALLOWED=NO build
EA_WORKSPACE_ORIGIN=http://127.0.0.1:8876 ./mobile/android/gradlew -p mobile/android assembleDebug
```

The existing native fixture command is `PYTHONPATH=. .venv/bin/python tests/serve_concept_fixture.py --port 8876 --frontend-build frontend/out --native-browser-sources`. Use `xcrun simctl`/`adb` only against an identified test target; Android requires `adb reverse tcp:8876 tcp:8876`. Existing iOS UI tests can run with the EmploymentAgency scheme on the chosen simulator. Native origin/signing files remain local.

After release, run `node scripts/check-public-demo.mjs https://employment-agency-demo.vercel.app EXPECTED_40_CHARACTER_COMMIT` and inspect the live branded asset responses and screenshots. The expected commit must come from the actual pushed revision.

## Evidence and remaining limits

Keep one [task list](todo.md). Add `verification.md` for shareable command outcomes, asset provenance, reviewed commit, CI/deployment links and explicit limits. Local ignored output may contain fictional captures/build logs. Private evidence stays solely in its protected recovery area and private installation records.

No unresolved product decision remains. Risks to resolve during execution are stale browser/OS icon caches, exact theme selection, native catalog/tool compatibility, packaging of new metadata/assets, capture validity, and equivalence of the normal shared wheel before private cutover. Physical iPhone/Android home-screen behavior is unverified until actually observed; a simulator, resource validation or successful build must be labelled accurately.
