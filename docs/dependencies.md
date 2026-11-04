# Dependency and licence review

Original implementation is MIT. No code or history from the private application pilot, career-ops or other job-search projects is included.

## Current interface typography

The current workspace self-hosts Inter at weights 400, 500, 600 and 700. The font copyright and SIL Open Font License are included in [Inter-OFL.txt](../frontend/public/licenses/Inter-OFL.txt) and the packaged export. The interface does not request fonts from an external service. Earlier Manrope assets and their licence remain in the bundle.

## Development glob-matching security patch

The frontend overrides transitive `minimatch` to 11.0.1 for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The pinned ESLint and TypeScript ESLint packages still request version 10; their named matcher APIs are checked with a fresh install, lint, type checks, unit tests and build before accepting this override. Remove it when those parent packages adopt a patched compatible dependency. CI audits development as well as production dependencies.

## Review-status interaction

The review control ports the actual [React Bits Bell Toggle](https://reactbits.dev/c/micro/bell-toggle) from [revision 4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4](https://github.com/DavidHDev/react-bits/tree/4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4/src/ts-default/Micro/BellToggle). Its measured clip spring, ringing bell/waves and label transitions are retained. The upstream MIT + Commons Clause notice is included in `frontend/public/licenses/react-bits-bell-toggle.txt` and the packaged export.

Application adaptations use the existing Lucide Bell through the icon slot, site colour tokens, native form association, persisted Draft/Reviewed state and a busy guard. A visible wrapper ring handles keyboard focus around the clipped pill; reduced motion and animation cleanup remain explicit. The demo's simulated notification counts are not application data, so its badge is disabled. No new dependency or upstream installer was needed; the source's measurements, events, animation lifecycle and licence were inspected directly.

## 0.4 interface additions

The navigation adapts [React Bits Dock](https://reactbits.dev/components/dock) from the smaller Motion-based source at [revision da6c709a5c46c172d0406ad626c5df31e509ee2e](https://github.com/DavidHDev/react-bits/blob/da6c709a5c46c172d0406ad626c5df31e509ee2e/src/ts-default/Components/Dock/Dock.tsx). This explicit snapshot keeps the relevant proximity/spring mechanism without importing the newer component's context menus, launch effects and configuration surface. The upstream MIT + Commons Clause licence is included in `frontend/public/licenses/react-bits.txt` and the packaged export. It permits use as part of this application; it does not make these third-party components unrestricted MIT code for standalone redistribution.

Documented adaptations: Next links replace generic button-role containers; visible labels replace hover-only tooltips; fixed hit targets replace animated container dimensions; viewport coordinates replace page coordinates; draft guards and `aria-current` integrate application navigation; reduced-motion and coarse-pointer modes remain static. No upstream install command or remote script was executed. The source's imports, event handlers, animation subscriptions and DOM access were inspected before adaptation.

Runtime additions are pinned Motion 14.9.0 (MIT) and Lucide React 1.65.0 (ISC/MIT notices as distributed). Only selected icons are imported. Their bundled notices, including Motion's transitive animation packages, are retained under `frontend/public/licenses/`. Axe Playwright 4.14.0 is a development-only accessibility test dependency; its licence remains in the installed package. npm installs use lifecycle scripts disabled. The resolved snapshot reported zero known npm audit findings; this is not an exhaustive security assessment.

Python runtime dependencies are pypdf (BSD-3-Clause), python-docx (MIT), ReportLab (BSD) and Flask (BSD-3-Clause). Their transitive packages retain their upstream notices. Setuptools builds the package. The React/Next.js frontend is pinned separately in `frontend/package-lock.json`. Next.js, React and React DOM are MIT; TypeScript and Playwright are Apache-2.0. Build/test tools are development dependencies; Node is not an installed-app runtime requirement. Manrope is bundled with its SIL Open Font License in `frontend/public/fonts/OFL.txt`, also included in the static export.

The bundled frontend retains the Next.js, React, React DOM and Scheduler notices under `frontend/public/licenses/`; the build includes these in the packaged export.

The 0.3 frontend uses fixed npm dependencies, installs with lifecycle scripts disabled, and is checked with `npm audit` plus type/lint/unit/build/browser checks. The export has no private data, server-side OAuth keys or executable Node service. An audit result describes the installed dependency snapshot and known advisories; it does not establish that dependencies are risk-free. Renew dependency review and regression checks when upgrading.

The implementation was tested with existing runtime versions pypdf 6.10.0, python-docx 1.2.0 and ReportLab 4.4.9. Metadata/dependency declarations and the application's filesystem, subprocess, network and credential boundaries were inspected before use. This is not an exhaustive audit of those libraries or a claim that dependency vulnerabilities are absent. No package installation scripts from a job-search repository were run. Future dependency updates need renewed review and regression checks.

Sources: upstream package metadata and licences; Greenhouse Job Board API documentation at https://docs.greenhouse.io/job-board.html; Lever API documentation at https://github.com/lever/postings-api; OpenAI structured outputs at https://developers.openai.com/api/docs/guides/structured-outputs.
