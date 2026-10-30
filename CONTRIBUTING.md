# Contributing

The public repository owns the application. Career workspaces contain data only. Use fictional records during development; never copy a real workspace into source, fixtures, screenshots, browser traces or build output.

## Structure

| Location | Responsibility |
| --- | --- |
| `frontend/src/app/` | Next.js routes, root providers and shared CSS |
| `frontend/src/features/` | Career, search, applications/editor, history and settings components |
| `frontend/src/components/` | Shared forms, actions, navigation, draft guards and workspace state |
| `frontend/src/lib/` | API models, explicit local/hosted transport, authentication and formatting |
| `employment_agency/service.py` | Python application operations; rules and validation stay here |
| `employment_agency/store.py`, `packages.py` | Workspace transactions, canonical documents, integrity and recovery |
| `employment_agency/server.py`, `hosted.py` | Local/hosted HTTP boundaries and shared frontend assets |
| `frontend/out/`, `employment_agency/web/` | Generated static export and packaged copy, both ignored by Git |
| `tests/` | Python contracts and production-export browser workflows |

The frontend uses React and TypeScript with Next.js App Router. Production uses a static export served alongside the existing Python APIs. There is no second Node production server, frontend database, Server Action or duplicate document engine. All private data is fetched at runtime; builds never load a workspace. A built Python wheel includes the export and needs no Node runtime.

## Setup and checks

Follow the source setup in README.md. Node.js 24+ and Python 3.11+ are required for development. Dependencies are pinned in `frontend/package-lock.json`; use `npm --prefix frontend ci --ignore-scripts`.

Run TypeScript, lint, frontend unit tests, the production build, and Python tests using the README commands. `python tests/run_browser_checks.py` then runs the production UI against temporary local and hosted services. Install Chrome through Playwright first, or provide an existing compatible installation with `PLAYWRIGHT_PATH`. This runner never uses the remembered private workspace or real hosted credentials. CI runs contracts on Linux/macOS/Windows and browser acceptance on Linux.

## Live frontend development

Start a disposable backend in one terminal (macOS/Linux):

```sh
EA_CONFIG_HOME=.dev-config .venv/bin/python -m employment_agency --workspace workspace-dev serve --frontend-origin http://127.0.0.1:3000
```

Windows PowerShell:

```powershell
$env:EA_CONFIG_HOME = '.dev-config'
.venv\Scripts\python -m employment_agency --workspace workspace-dev serve --frontend-origin http://127.0.0.1:3000
```

In a second terminal:

```sh
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. Next provides Fast Refresh and proxies API/files to Python on port 8766. A different backend can be supplied with the loopback-only `EA_BACKEND_URL`. The explicit frontend-origin flag permits that exact development origin while retaining token checks; normal local serving does not allow it. The separate ignored config/workspace folders keep development from changing your real remembered workspace. Restart Python after backend changes. Test final behavior using the production export too.

## Adding or changing a feature

1. Put the page behavior in its feature folder and reusable controls in `components/`. Routes should remain small. Prefer component composition over global event listeners or post-render DOM editing.
2. Add Python operations and validation before exposing them. Update the TypeScript models and use the existing API client; do not replace global `fetch`, access local paths from a hosted component or duplicate server rules in JavaScript.
3. Keep editable drafts local to their form. Refreshing server state must not replace a draft. Components remount when the workspace changes; pending responses from a previous workspace are rejected.
4. Use semantic controls, explicit labels, visible focus and local error messages. Preserve cancellation, retries, keyboard operation and unsaved-edit warnings. Text from adverts and files must remain React text, never HTML.
5. Add behavior tests for success and relevant failure cases. Keep submitted document bytes immutable. Preserve meaningful assertions in the existing workflow tests; change selectors only for deliberate UI changes.
6. Update the parity contract and documentation when behavior changes. Run the whole relevant set of checks before publishing. A mock-provider test does not prove real Google OAuth, production storage or native desktop dialog behavior.

## Builds and hosted releases

Run `npm --prefix frontend run build` before `python -m pip wheel --no-deps .`. The build copies the static export into the Python package. Vercel remains configured as a Flask application; its build command installs and builds the frontend. Select Node.js 24+ for the build environment. Server-side Supabase keys stay in Python environment configuration, never a `NEXT_PUBLIC_` variable.

Run `python tests/check_wheel.py path/to/the-built.whl` to install the candidate outside the checkout and verify packaged routes, document generation and submitted snapshot export/restore. CI performs this check on all three operating systems.

Both Python servers allow exact hashes of Next's generated inline bootstrap scripts in their CSP. Do not add `unsafe-inline` or `unsafe-eval` to make a build work. Test direct routes, client navigation, HEAD/prefetch, downloads and PDF previews through the Python server.

Workspace schema remains 2. Upgrades remain explicit: export, restore to a disposable copy, verify the candidate, then switch the installed build. A source push does not upgrade a private installed workspace. Keep the previous wheel and commit for recovery.
