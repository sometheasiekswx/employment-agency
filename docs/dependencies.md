# Dependency and licence review

Original implementation is MIT. No code or history from the private application pilot, career-ops or other job-search projects is included.

## Current interface typography

The current workspace self-hosts Inter at weights 400, 500, 600 and 700. The font copyright and SIL Open Font License are included in [Inter-OFL.txt](../frontend/public/licenses/Inter-OFL.txt) and the packaged export. The interface does not request fonts from an external service. Earlier Manrope assets and their licence remain in the bundle.

## Document preview

The editor uses [Mozilla PDF.js 6.5.438](https://github.com/mozilla/pdf.js/releases/tag/v6.5.438) to fit one page to the preview pane at a time. It loads when a document opens and requests its worker and character maps from the same application. The build copies the character maps and their Adobe redistribution notice from the pinned dependency into `/pdfjs/cmaps/`. The [PDF.js Apache 2.0 licence](../frontend/public/licenses/pdfjs.txt) also ships with the export. The editor passes the current PDF bytes directly to the renderer and keeps those exact bytes available for download. The app renders page images without a PDF scripting viewer.

## Development glob-matching security patch

The frontend overrides transitive `minimatch` to 11.0.1 for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The pinned ESLint and TypeScript ESLint packages still request version 10; their named matcher APIs are checked with a fresh install, lint, type checks, unit tests and build before accepting this override. Remove it when those parent packages adopt a patched compatible dependency. CI audits development as well as production dependencies.

## Company logo rasterization

The backfill operation uses [resvg-py 0.5.0](https://pypi.org/project/resvg-py/0.5.0/) (MIT) to rasterize a bounded SVG subset. The MIT licence travels with the installed Python distribution. PyPI provides CPython 3.10+ stable ABI wheels, including the project's Python 3.11 minimum and CI's 3.13, for macOS Intel and Apple Silicon, mainstream manylinux and musllinux targets, and Windows x86, x64 and ARM64. SVG validation and rendering run server-side. The browser receives the normalized PNG.

## Review-status interaction

The review control ports the actual [React Bits Bell Toggle](https://reactbits.dev/c/micro/bell-toggle) from [revision 4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4](https://github.com/DavidHDev/react-bits/tree/4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4/src/ts-default/Micro/BellToggle). Its measured clip spring, ringing bell/waves and label transitions are retained. The upstream MIT + Commons Clause notice is included in `frontend/public/licenses/react-bits-bell-toggle.txt` and the packaged export.

Application adaptations use the existing Lucide Bell through the icon slot, site colour tokens, native form association, persisted Draft/Reviewed state and a busy guard. A visible wrapper ring handles keyboard focus around the clipped pill; reduced motion and animation cleanup remain explicit. The demo's simulated notification counts are not application data, so its badge is disabled. No new dependency or upstream installer was needed; the source's measurements, events, animation lifecycle and licence were inspected directly.

## Navigation

The navigation adapts [React Bits Dock](https://reactbits.dev/components/dock) from the smaller Motion-based source at [revision da6c709a5c46c172d0406ad626c5df31e509ee2e](https://github.com/DavidHDev/react-bits/blob/da6c709a5c46c172d0406ad626c5df31e509ee2e/src/ts-default/Components/Dock/Dock.tsx). This explicit snapshot keeps the relevant proximity/spring mechanism without importing the newer component's context menus, launch effects and configuration surface. The upstream MIT + Commons Clause licence is included in `frontend/public/licenses/react-bits.txt` and the packaged export. It permits use as part of this application; it does not make these third-party components unrestricted MIT code for standalone redistribution.

Documented adaptations: Next links replace generic button-role containers; visible labels replace hover-only tooltips; fixed hit targets replace animated container dimensions; viewport coordinates replace page coordinates; draft guards and `aria-current` integrate application navigation; reduced-motion and coarse-pointer modes remain static. No upstream install command or remote script was executed. The source's imports, event handlers, animation subscriptions and DOM access were inspected before adaptation.

The frontend pins Motion 14.9.0 (MIT) and Lucide React 1.65.0 (ISC/MIT notices as distributed). The app imports selected icons. Their notices and Motion's transitive animation packages' notices ship under `frontend/public/licenses/`.

## Build and runtime dependencies

[Python dependencies](../pyproject.toml) include pypdf, python-docx and ReportLab for documents. They also include Flask for the private hosted pilot, tzdata for timezone data, lxml and Protego for parsing and robots rules, truststore for system certificates, and Pillow and resvg-py for images. The `discovery` extra adds Playwright. The `apply` extra includes Playwright, keyring and Google's OAuth client library. These extras support optional local workflows. Setuptools builds the wheel and the installed distributions keep their upstream notices.

[The npm lockfile](../frontend/package-lock.json) pins the Next.js and React frontend. The static public demo uses `docx`, `pdf-lib` and `fflate` to prepare and download documents in the browser. Next.js, React, React DOM and Scheduler notices ship in the export. TypeScript and Playwright are Apache-2.0. Axe Playwright 4.14.0 runs accessibility checks during development. The installed Python app serves compiled assets, so Node is needed to build from source.

CI installs npm dependencies with lifecycle scripts disabled and runs `npm audit`, type checking, lint, unit tests, builds and browser workflows. The audit reports known advisories for that installation. [Current checks and scope](verification.md)

Sources: upstream package metadata and licences; Greenhouse Job Board API documentation at https://docs.greenhouse.io/job-board.html; Lever API documentation at https://github.com/lever/postings-api; OpenAI structured outputs at https://developers.openai.com/api/docs/guides/structured-outputs.
