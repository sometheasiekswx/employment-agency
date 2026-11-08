# Private live development

The user wants saved code changes to appear on the existing iPhone URL without full frontend builds.

## Approach

Keep Next.js Fast Refresh and the existing Python API. For private development, a loopback-only Caddy gateway routes application operations/documents to Python and pages/assets/WebSocket upgrades to Next. Caddy performs a lightweight forward-auth check against the Python owner gate for every request, including upgrades. Production serve and existing local dev remain available.

Next receives only the exact configured tailnet hostname as an additional development origin. A small source supervisor restarts only the Python backend after saved package changes, retaining the Next process and live-update connection. It checks a development-only read-only readiness endpoint and defers reload while application work is active. Watch only shared Python source, never private workspace files. No package/workspace upgrade or backup is required.

The alternative of exposing Next directly loses the existing owner gate for frontend/HMR requests. A maintained proxy avoids implementing HTTP/WebSocket tunneling in the Python application.

## Ordered slices and checks

1. Gateway: exact owner/host/protocol checks remain authoritative in Python; reject wrong identity, missing identity, Funnel and spoofed localhost requests for pages, APIs and WebSocket upgrades. Verify against disposable HTTP fixtures and real Caddy.
2. Live launcher: validate flags/ports/dependencies before opening the workspace; supervise all children, restart only backend after Python saves, preserve selected workspace and delay during active work. Verify reload behavior, syntax-error recovery, shutdown and lock release in disposable workspaces.
3. Browser integration: prove actual Next CSS Fast Refresh through the gateway without document reload, a backend behavior update after Python edit, and unchanged token/origin rejection. Run existing relevant tests and inspect the final diff.

## Evidence

Keep machine URLs/login/configuration and private verification outside Git. Update the task list with completed checks and limitations. Preserve existing unrelated changes and the pinned installed-build lock.
