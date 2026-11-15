# Private access through Tailscale

Run the application on a Mac and open it from another device on the same Tailscale account. Tailscale Serve provides private HTTPS; the app and documents stay on the Mac. The Mac must remain powered, awake, online and signed in.

Install the [official Tailscale Mac client](https://tailscale.com/docs/install/mac), approve its network extension, and sign in. Install Tailscale on the iPhone and use the same account. Enable HTTPS when Tailscale Serve requests it.

## Start the app

Use a build that lists `--tailscale-origin` and `--tailscale-user` in `employment-agency serve --help`. To change the installed build for an existing workspace, follow the [backup and upgrade runbook](running-locally.md#existing-environments-and-upgrades).

Find the Mac's exact DNS name and your login with `tailscale status --json`. Stop the existing application before opening the same workspace in another process. From the shared software checkout:

```sh
.venv/bin/python -m employment_agency --workspace /absolute/private/workspace serve \
  --port 8766 \
  --tailscale-origin https://your-mac.your-tailnet.ts.net \
  --tailscale-user your-tailscale-login@example.com
```

Use the exact `https://MACHINE.TAILNET.ts.net` origin and owner login. Enter the origin without a port, path or trailing slash. Keep machine-specific values outside source control. On the Mac, open `http://127.0.0.1:8766` for direct local access.

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

Open the resulting HTTPS URL in iPhone Safari while Tailscale is connected. Add it to the Home Screen for quick access.

If iPhone Safari cannot find the private hostname while Tailscale DNS is enabled, try Safari's Page Menu → **Show IP Address** for that site. This temporarily bypasses Private Relay for the website. The exception ends when leaving the website or closing its tab; do not assume it carries into new tabs or Home Screen launches. See [Apple's Safari guidance](https://support.apple.com/guide/iphone/browse-the-web-privately-iphb01fc3c85/27/ios/27).

## Access checks

The Python server listens on `127.0.0.1`. Private requests must carry the exact HTTPS host and configured owner login in Tailscale Serve's forwarded headers. The server rejects missing or wrong identity and Tailscale Funnel traffic. API writes also require the matching `Origin` and workspace token.

Tailscale injects identity headers and removes client-supplied copies. As with the existing loopback app, local processes on the Mac are trusted. Serve access policies also apply. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

## Keep access running

Tailscale's background Serve configuration persists independently of a terminal. The app must also keep running. A user LaunchAgent can start it when the Mac user logs in, with its `WorkingDirectory` set to the shared software checkout and explicit interpreter, workspace and Tailscale arguments. Keep its plist and logs in the user's Library, outside Git. Include the local LaTeX and optional integration tools in its PATH.

Use `ProcessType=Interactive` for this user-facing server. Background classification can severely throttle the filesystem checks needed to serve the workspace; the macOS `launchd.plist` manual documents the distinction. Reload the LaunchAgent after changing its plist; `kickstart` alone restarts the already-loaded configuration.

Wrapping the app command in `/usr/bin/caffeinate -s` prevents system sleep while connected to power and the app is running. It allows the display to sleep. It does not keep a shut-down, logged-out or closed-lid Mac available; follow the Mac's normal supported closed-display requirements if using it with the lid closed.

**Open Folder** shows the chooser on the Mac. Any configured local application automation runs there too. Links you open from iPhone Safari open on the phone. [Supported application channels](apply-for-me.md)

## Live code changes on the same private URL

For source development, install [Caddy](https://caddyserver.com/docs/install) alongside Node and the frontend dependencies. Stop the existing app, then run:

```sh
.venv/bin/python -m employment_agency --workspace /absolute/private/workspace dev \
  --port 8767 --frontend-port 3000 --gateway-port 8766 \
  --tailscale-origin https://your-mac.your-tailnet.ts.net \
  --tailscale-user your-tailscale-login@example.com
```

Keep Serve pointing at `http://127.0.0.1:8766`. The same local and private HTTPS addresses now use Next.js Fast Refresh. Saving React or CSS updates connected browsers automatically; the first visit to a route compiles it on demand. Full export builds are unnecessary while developing.

Saving shared application Python files restarts the backend in a fresh interpreter. Reload waits for active preparation, delivery, connected application, discovery and folder selection. It retains the selected workspace and leaves Next running. A Python syntax error temporarily interrupts app requests. Save the correction to retry. Restart the command after changes to the launcher, gateway or installed dependencies. The watcher monitors software source files.

All three listeners bind to loopback. Caddy checks the Python owner gate before proxying pages, files, APIs or live-update WebSockets. It does not run as a system service, expose an admin port, enable Funnel or log request headers. Its generated configuration is temporary and outside Git. Ctrl+C stops all three children and releases the workspace. Keep machine arguments in the local LaunchAgent when using it for persistent development.

To return to the built app, stop `dev` and use the earlier `serve --port 8766` command with the same private settings. Do not run both against one workspace. The installed workspace build lock remains unchanged by source development.

## Stop remote access

If you used the HTTPS port 443 handler for this app, remove that handler and any matching path you configured. For the default root path above, run:

```sh
tailscale serve --https=443 off
```

Stop the app's LaunchAgent if one was configured, then restart without the paired Tailscale options for localhost-only operation. Do not reset unrelated Tailscale handlers or change tailnet-wide policies to troubleshoot this app.
