# Dependency and licence review

Original implementation is MIT. No code or history from the private application pilot, career-ops or other job-search projects is included.

Python runtime dependencies are pypdf (BSD-3-Clause), python-docx (MIT), ReportLab (BSD) and Flask (BSD-3-Clause). Their transitive packages retain their upstream notices. Setuptools builds the package. The React/Next.js frontend is pinned separately in `frontend/package-lock.json`. Next.js, React and React DOM are MIT; TypeScript and Playwright are Apache-2.0. Build/test tools are development dependencies; Node is not an installed-app runtime requirement. Manrope is bundled with its SIL Open Font License in `frontend/public/fonts/OFL.txt`, also included in the static export.

The bundled frontend retains the Next.js, React, React DOM and Scheduler notices under `frontend/public/licenses/`; the build includes these in the packaged export.

The 0.3 frontend uses fixed npm dependencies, installs with lifecycle scripts disabled, and is checked with `npm audit` plus type/lint/unit/build/browser checks. The export has no private data, server-side OAuth keys or executable Node service. An audit result describes the installed dependency snapshot and known advisories; it does not establish that dependencies are risk-free. Renew dependency review and regression checks when upgrading.

The implementation was tested with existing runtime versions pypdf 6.10.0, python-docx 1.2.0 and ReportLab 4.4.9. Metadata/dependency declarations and the application's filesystem, subprocess, network and credential boundaries were inspected before use. This is not an exhaustive audit of those libraries or a claim that dependency vulnerabilities are absent. No package installation scripts from a job-search repository were run. Future dependency updates need renewed review and regression checks.

Sources: upstream package metadata and licences; Greenhouse Job Board API documentation at https://docs.greenhouse.io/job-board.html; Lever API documentation at https://github.com/lever/postings-api; OpenAI structured outputs at https://developers.openai.com/api/docs/guides/structured-outputs.
