# Dependency and licence review

Original implementation is MIT. No code or history from the private application pilot, career-ops or other job-search projects is included.

## 0.4 interface additions

The navigation adapts [React Bits Dock](https://reactbits.dev/components/dock) from the smaller Motion-based source at [revision da6c709a5c46c172d0406ad626c5df31e509ee2e](https://github.com/DavidHDev/react-bits/blob/da6c709a5c46c172d0406ad626c5df31e509ee2e/src/ts-default/Components/Dock/Dock.tsx). This explicit snapshot keeps the relevant proximity/spring mechanism without importing the newer component's context menus, launch effects and configuration surface. The upstream MIT + Commons Clause licence is included in `frontend/public/licenses/react-bits.txt` and the packaged export. It permits use as part of this application; it does not make these third-party components unrestricted MIT code for standalone redistribution.

Documented adaptations: Next links replace generic button-role containers; visible labels replace hover-only tooltips; fixed hit targets replace animated container dimensions; viewport coordinates replace page coordinates; draft guards and `aria-current` integrate application navigation; reduced-motion and coarse-pointer modes remain static. No upstream install command or remote script was executed. The source's imports, event handlers, animation subscriptions and DOM access were inspected before adaptation.

Runtime additions are pinned Motion 14.9.0 (MIT) and Lucide React 1.65.0 (ISC/MIT notices as distributed). Only selected icons are imported. Their bundled notices, including Motion's transitive animation packages, are retained under `frontend/public/licenses/`. Axe Playwright 4.14.0 is a development-only accessibility test dependency; its licence remains in the installed package. npm installs use lifecycle scripts disabled. The resolved snapshot reported zero known npm audit findings; this is not an exhaustive security assessment.

Python runtime dependencies are pypdf (BSD-3-Clause), python-docx (MIT), ReportLab (BSD) and Flask (BSD-3-Clause). Their transitive packages retain their upstream notices. Setuptools builds the package. The React/Next.js frontend is pinned separately in `frontend/package-lock.json`. Next.js, React and React DOM are MIT; TypeScript and Playwright are Apache-2.0. Build/test tools are development dependencies; Node is not an installed-app runtime requirement. Manrope is bundled with its SIL Open Font License in `frontend/public/fonts/OFL.txt`, also included in the static export.

The bundled frontend retains the Next.js, React, React DOM and Scheduler notices under `frontend/public/licenses/`; the build includes these in the packaged export.

The 0.3 frontend uses fixed npm dependencies, installs with lifecycle scripts disabled, and is checked with `npm audit` plus type/lint/unit/build/browser checks. The export has no private data, server-side OAuth keys or executable Node service. An audit result describes the installed dependency snapshot and known advisories; it does not establish that dependencies are risk-free. Renew dependency review and regression checks when upgrading.

The implementation was tested with existing runtime versions pypdf 6.10.0, python-docx 1.2.0 and ReportLab 4.4.9. Metadata/dependency declarations and the application's filesystem, subprocess, network and credential boundaries were inspected before use. This is not an exhaustive audit of those libraries or a claim that dependency vulnerabilities are absent. No package installation scripts from a job-search repository were run. Future dependency updates need renewed review and regression checks.

Sources: upstream package metadata and licences; Greenhouse Job Board API documentation at https://docs.greenhouse.io/job-board.html; Lever API documentation at https://github.com/lever/postings-api; OpenAI structured outputs at https://developers.openai.com/api/docs/guides/structured-outputs.
