# Private access through Tailscale

Run the application on a Mac and open it from another device on the same Tailscale account. Tailscale Serve provides private HTTPS; the app and documents stay on the Mac. The Mac must remain powered, awake, online and signed in.

Install the [official Tailscale Mac client](https://tailscale.com/docs/install/mac), approve its network extension, and sign in. Install Tailscale on the iPhone and use the same account. Enable HTTPS when Tailscale Serve requests it.

## Start the app

This feature requires a source checkout or release containing the Tailscale options. Running an older pinned wheel does not add these options. Do not change a workspace's installed-build lock to describe source-only execution.

Find the Mac's exact DNS name and your login with `tailscale status --json`. Stop the existing application before opening the same workspace in another process. From the shared software checkout:

```sh
.venv/bin/python -m employment_agency --workspace /absolute/private/workspace serve \
  --port 8766 \
  --tailscale-origin https://your-mac.your-tailnet.ts.net \
  --tailscale-user your-tailscale-login@example.com
```

Use the actual HTTPS origin without a path or trailing slash and the exact Tailscale login. Keep machine-specific values outside source control. The default localhost address continues to work.

To rebuild the frontend and start the same service from source, run the following with your workspace path, port, origin, and login. The build assets are staged for this server process. Use an available port or stop the previous server when reusing its port.

```sh
.venv/bin/python scripts/rebuild-tailscale.py \
  --workspace "/absolute/path/to/workspace" --port 8766 \
  --tailscale-origin https://your-mac.your-tailnet.ts.net \
  --tailscale-user your-tailscale-login@example.com
```

In another terminal, use the Tailscale client's executable:

```sh
tailscale serve --bg http://127.0.0.1:8766
tailscale serve status
```

Open the resulting HTTPS URL in iPhone Safari while Tailscale is connected. Add it to the Home Screen for quick access. A local browser may also use the original localhost address.

If iPhone Safari cannot find the private hostname while Tailscale DNS is enabled, try Safari's Page Menu → **Show IP Address** for that site. This temporarily bypasses Private Relay for the website. The exception ends when leaving the website or closing its tab; do not assume it carries into new tabs or Home Screen launches. See [Apple's Safari guidance](https://support.apple.com/guide/iphone/browse-the-web-privately-iphb01fc3c85/27/ios/27).

## Access checks

The Python server continues listening only on `127.0.0.1`. Remote requests require the configured HTTPS host and owner login, with the forwarded headers supplied by Tailscale Serve. Requests from other users, missing identity, mismatched origins and Funnel traffic are rejected. Mutations still require the workspace token. No permissive CORS or public listener is added.

Tailscale injects identity headers and removes client-supplied copies. As with the existing loopback app, local processes on the Mac are trusted. Serve access policies also apply. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

## Keep access running

Tailscale's background Serve configuration persists independently of a terminal. The app must also keep running. A user LaunchAgent can start it when the Mac user logs in, with its `WorkingDirectory` set to the shared software checkout and explicit interpreter, workspace and Tailscale arguments. Keep its plist and logs in the user's Library, outside Git. Include the local LaTeX and optional integration tools in its PATH.

Use `ProcessType=Interactive` for this user-facing server. Background classification can severely throttle the filesystem checks needed to serve the workspace; the macOS `launchd.plist` manual documents the distinction. Reload the LaunchAgent after changing its plist; `kickstart` alone restarts the already-loaded configuration.

Wrapping the app command in `/usr/bin/caffeinate -s` prevents system sleep while connected to power and the app is running. It allows the display to sleep. It does not keep a shut-down, logged-out or closed-lid Mac available; follow the Mac's normal supported closed-display requirements if using it with the lid closed.

Native file pickers and browser/Telegram interactions still run on the Mac. Opening this URL on an iPhone does not move those interactions to the phone.

## Live code changes on the same private URL

For source development, install [Caddy](https://caddyserver.com/docs/install) alongside Node and the frontend dependencies. Stop the existing app, then run:

```sh
.venv/bin/python -m employment_agency --workspace /absolute/private/workspace dev \
  --port 8767 --frontend-port 3000 --gateway-port 8766 \
  --tailscale-origin https://your-mac.your-tailnet.ts.net \
  --tailscale-user your-tailscale-login@example.com
```

Keep Serve pointing at `http://127.0.0.1:8766`. The same local and private HTTPS addresses now use Next.js Fast Refresh. Saving React or CSS updates connected browsers automatically; the first visit to a route compiles it on demand. Full export builds are unnecessary while developing.

Saving shared application Python files restarts only the backend in a fresh interpreter. Reload waits for preparation, delivery and folder selection to finish, retains the currently selected workspace, and leaves Next running. A Python syntax error temporarily interrupts app requests; save the correction to retry. Changes to the launcher or gateway code itself require restarting the command. Dependency changes require their usual installation and restart. Private workspace/data changes do not trigger code reloads.

All three listeners bind to loopback. Caddy checks the Python owner gate before proxying pages, files, APIs or live-update WebSockets. It does not run as a system service, expose an admin port, enable Funnel or log request headers. Its generated configuration is temporary and outside Git. Ctrl+C stops all three children and releases the workspace. Keep machine arguments in the local LaunchAgent when using it for persistent development.

To return to the built app, stop `dev` and use the earlier `serve --port 8766` command with the same private settings. Do not run both against one workspace. The installed workspace build lock remains unchanged by source development.

## Stop remote access

Disable only the Serve handler created for this app:

```sh
tailscale serve --https=443 off
```

Stop the app's LaunchAgent if one was configured, then restart without the paired Tailscale options for localhost-only operation. Do not reset unrelated Tailscale handlers or change tailnet-wide policies to troubleshoot this app.
