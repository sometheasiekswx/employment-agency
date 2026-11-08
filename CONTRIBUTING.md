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

Follow the [source setup](README.md#run-locally) and [local checks](README.md#test-locally) in the README.

## Browser checks

After setup, stop the dev server and run these from the software checkout:

```sh
npm --prefix frontend run build
npx --prefix frontend playwright install chrome
.venv/bin/python tests/run_browser_checks.py
```

Skip the install command if Chrome is already installed. On Linux, use `npx --prefix frontend playwright install --with-deps chrome` to install Chrome and its system dependencies. The suite uses temporary local and hosted services with fictional data. CI runs contract checks on Linux, macOS and Windows, and browser checks on Linux.

## Live frontend development

Use the [README startup command](README.md#start-the-app) on macOS or Linux. In Windows PowerShell, start the same isolated development workspace from the software checkout:

```powershell
$env:EA_CONFIG_HOME = '.dev-config'
.\.venv\Scripts\python.exe -m employment_agency --workspace workspace-dev dev
```

Open **http://127.0.0.1:3000**. Next.js runs on port 3000 and Python runs on port 8766. **Ctrl+C stops both and releases the workspace.** If a port is occupied, stop the other app or append `--port 8767 --frontend-port 3001` to the startup command and open **http://127.0.0.1:3001**.

To open a different folder, replace `workspace-dev` with its path. Keep `--workspace` before `dev`.

The launcher configures the exact frontend origin and API/file proxy automatically, preserving origin/token checks. For a manual two-terminal setup, `serve --frontend-origin http://127.0.0.1:3000` and `npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000` remain available. Test final behavior using the production export too.

The launcher lifecycle is covered by `python -m unittest discover -s tests -p test_development.py -v`. On macOS/Linux with Chrome installed, `python tests/check_development.py` checks the actual Next.js proxy, CSS Fast Refresh and shutdown/restart using a separate temporary source tree and fictional workspace. Local verification was performed on macOS; Windows console cleanup has not been verified locally.

For live changes through an existing private phone URL, use the [Tailscale development gateway](docs/tailscale.md#live-code-changes-on-the-same-private-url). It adds Caddy and Python source reloads while retaining the owner/origin/token checks. `python -m unittest discover -s tests -p 'test_live_*.py' -v` verifies private gateway access, WebSockets and reload lifecycle; `python tests/check_private_development.py` proves real Next Fast Refresh before and after a Python behavior change in an isolated fictional workspace. These checks require Caddy, and the browser check requires Chrome. Normal local `dev` remains a two-process option.

## Editing button colours

The **Apply For Me** and **Submission details** labels belong to the same button in `frontend/src/features/applications/application-card.tsx`. Its default fill/text colours currently come from `.review-pane button:not([name])` in `frontend/src/app/globals.css`. That rule also styles Save comment.

To style only the header button, add a more specific rule to `globals.css`:

```css
.review-pane .review-header > button.secondary {
  background: #0593c6;
  color: #171717;
}
```

`background` changes the fill and `color` changes the text. This is an example; it applies to both button labels without changing the decision or Save comment buttons.

## Adding or changing a feature

1. Put the page behavior in its feature folder and reusable controls in `components/`. Routes should remain small. Prefer component composition over global event listeners or post-render DOM editing.
2. Add Python operations and validation before exposing them. Update the TypeScript models and use the existing API client; do not replace global `fetch`, access local paths from a hosted component or duplicate server rules in JavaScript.
3. Keep editable drafts local to their form. Refreshing server state must not replace a draft. Components remount when the workspace changes; pending responses from a previous workspace are rejected.
4. Use semantic controls, explicit labels, visible focus and local error messages. Preserve cancellation, retries, keyboard operation and unsaved-edit warnings. Text from adverts and files must remain React text, never HTML.
5. Add behavior tests for success and relevant failure cases. Keep submitted document bytes immutable. Preserve meaningful assertions in the existing workflow tests; change selectors only for deliberate UI changes.
6. Update the parity contract and documentation when behavior changes. Run the whole relevant set of checks before publishing. A mock-provider test does not prove real Google OAuth, production storage or native desktop dialog behavior.

## Builds and hosted releases

The public fictional showcase deploys automatically after the full `Checks` matrix passes for a current `main` revision. CI publishes the tested static artifact to its dedicated Vercel project and verifies it before and after promotion. See [public deployment and recovery](docs/public-demo-deployment.md). Keep this separate from the private hosted pilot: root `vercel.json` and the local `.vercel` link belong to that Flask deployment, whose releases remain explicit.

Run `npm --prefix frontend run build` before `python -m pip wheel --no-deps .`. The build copies the static export into the Python package. Vercel remains configured as a Flask application; its build command installs and builds the frontend. Select Node.js 24+ for the build environment. Server-side Supabase keys stay in Python environment configuration, never a `NEXT_PUBLIC_` variable.

Run `python tests/check_wheel.py path/to/the-built.whl` to install the candidate outside the checkout and verify packaged routes, document generation and submitted snapshot export/restore. CI performs this check on all three operating systems.

With the frontend dependencies and Playwright Chrome installed, add `--browser` to verify the installed wheel's application queues in a real browser. Linux CI requires this check. It uses fictional versioned applications to check that submitted jobs appear once, older or later drafts stay out of Active, filters/counts agree, and History retains the documents. Testing the source frontend alone does not verify the files distributed in a wheel.

Vercel installs Python dependencies before running its configured frontend build. `[tool.uv] package = false` tells that dependency bootstrap to use the source checkout without building an incomplete wheel. Local distributors still build the frontend and use pip/setuptools to produce complete wheels. `python tests/check_hosted_install.py` (requires uv) reproduces the pre-frontend dependency phase in a disposable folder; Linux CI runs it. Do not remove the complete-wheel asset check to work around a deployment ordering error.

The browser runner checks all six routes at 320/768/1024/1440 with Axe WCAG A/AA checks, keyboard navigation, unsaved drafts, stable Dock targets, reduced motion, viewport-anchored mobile navigation and 200% text. The design system lives in `DESIGN.md`; development-only strategy is under `.impeccable/surfaces/`. React Bits attribution and local adaptations are recorded in `docs/dependencies.md`.

Both Python servers allow exact hashes of Next's generated inline bootstrap scripts in their CSP. Do not add `unsafe-inline` or `unsafe-eval` to make a build work. Test direct routes, client navigation, HEAD/prefetch, downloads and PDF previews through the Python server.

Do not format or hand-edit `frontend/out/` or `employment_agency/web/`. Whitespace changes in generated HTML can break React hydration even when the page still appears to load. The repository's `.prettierignore` excludes generated output. If it has been changed, rebuild with `npm --prefix frontend run build`; edit the TSX/CSS sources instead.

Workspace schema remains 2. Upgrades remain explicit: export, restore to a disposable copy, verify the candidate, then switch the installed build. A source push does not upgrade a private installed workspace. Keep the previous wheel and commit for recovery.
