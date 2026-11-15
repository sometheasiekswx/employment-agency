# Running locally

Build from the **software checkout**, which contains `pyproject.toml`, `frontend/` and `employment_agency/`. Keep the **career workspace** in a separate folder. New local workspaces keep live records in `workspace.sqlite3` and publish `state.json` and `state/` for private Git. Select the data folder using `--workspace` or **Settings → Workspace files → Open Folder**. Start with the [personal-workspace quick start](../README.md#run-locally), then follow [your first application](getting-started.md). Replace the example paths with your own.

## Find the software folder

`cd employment-agency` means “enter a child folder of the directory I am currently in.” It does not search your computer. If that fails, stop and locate the checkout in Finder. On macOS you can type `cd `, drag the software folder from Finder into Terminal, and press Return. Confirm the location:

```sh
pwd
ls pyproject.toml frontend/package.json
```

For repositories stored under `Documents/GitHub`, the command is:

```sh
cd "$HOME/Documents/GitHub/employment-agency"
```

Clone only when you do not already have a checkout. A failed clone (network, access or destination already exists) does not create a new usable checkout. Do not continue through errors or clone inside the private data folder.

## Install from source

Use Python 3.11+ and Node.js 24+ with npm. Run each step successfully before proceeding:

```sh
python3 --version
node --version
npm --version
python3 -m venv .venv
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
.venv/bin/python -m pip install .
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/my-career-workspace" init
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/my-career-workspace" serve
```

Use `init` for a new workspace. On Windows, follow the [PowerShell commands](../README.md#set-up-once). Dependencies and the frontend are installed locally. Routine use needs no provider key. The build creates `employment_agency/web/` for the checkout and for inclusion in a built wheel.

The server prints `Employment Agency: http://127.0.0.1:8766`. Open that exact address; `localhost` is rejected by the strict local host check. Keep Terminal open. Ctrl+C stops the server. The terminal continuing to run after printing the address is expected.

Without `--workspace`, the app opens the remembered workspace. With no remembered path, a checkout associated with the package, environment or working directory supplies the default `workspace/` folder. Otherwise the app uses `~/EmploymentAgency/workspace`. To select existing data explicitly, put the global option **before** `serve`:

```sh
.venv/bin/python -m employment_agency --workspace "/absolute/path/to/private-workspace" serve
```

Startup exits with an error if the explicit or remembered folder has no workspace state. Specify an existing workspace with `--workspace`, or run the following once for a new workspace outside the public checkout. The app's **Open Folder** can also initialize an empty folder or new Git repository. A Git clone containing only the published snapshot needs `restore-snapshot` first.

```sh
.venv/bin/python -m employment_agency --workspace "/absolute/path/to/new-workspace" init
```

## Install a release wheel

A built `.whl` includes the browser assets, so Python 3.11+ is enough for ordinary local use. Download the wheel from the desired [release](https://github.com/sometheasiekswx/employment-agency/releases), create an installation folder outside your career workspace, and run these commands there. Replace the example wheel path with the actual downloaded filename:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install /absolute/path/to/downloaded-release.whl
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/my-career-workspace" init
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/my-career-workspace" serve
```

For Windows, use `py -3` to create the environment and `.\.venv\Scripts\python.exe` for its Python. Keep the software checkout as well if you want its Codex gate setup scripts or development commands. When installing a newer build for an existing workspace, skip `init` and follow the backup/restore checks below first.

## Existing environments and upgrades

A virtual environment belongs to the Python interpreter that created it. Reusing an old `.venv` after changing Python installations can leave stale links or packages. Do not delete a working environment to troubleshoot. Create a separate one, keeping the old installation available:

```sh
python3 -m venv .venv-next
.venv-next/bin/python -m pip install .
```

Build the frontend before installing from source. Both `.venv` and `.venv-next` are ignored by this repository. `python -m employment_agency` from the checkout imports that checkout's code. To test an installed build, invoke its installed interpreter from outside source checkouts.

Before opening real data with a new release, stop the old app and export using its exact build and interpreter. Restore the archive to a **new** directory and test the candidate on that copy. If both builds are installed packages, run the following from a recovery folder outside either source checkout. If the old app ran from source, export from the original source revision with its original interpreter.

```sh
"/absolute/path/to/old-install/.venv/bin/python" -m employment_agency --workspace "/absolute/path/to/private-workspace" export "/absolute/path/to/backup.zip"
"/absolute/path/to/candidate-install/.venv-next/bin/python" -m employment_agency restore "/absolute/path/to/backup.zip" "/absolute/path/to/restored-copy"
EA_CONFIG_HOME="/absolute/path/to/test-config" "/absolute/path/to/candidate-install/.venv-next/bin/python" -m employment_agency --workspace "/absolute/path/to/restored-copy" serve --port 8767
```

The separate `EA_CONFIG_HOME` keeps the candidate test from changing the remembered folder or the machine-local permissions of the original installation. In PowerShell, set `$env:EA_CONFIG_HOME` before running the candidate and use its `Scripts\python.exe`. Check the restored workspace's state, application history and exact submitted documents before switching. Export covers the workspace's career data directories, settings, root Markdown files, configured master and verified recovery copies. Set `backup_paths` in `workspace.json` to include additional workspace-relative files or folders. Use new archive and restore paths outside the public checkout. A restored SQLite workspace receives a new workspace ID and requires fresh provider consent.

When a Git clone lacks recovery metadata, opening it can verify recorded documents against their application manifest hashes. History-only documents can use the manifest committed in Git. Keep a portable backup for original bytes or versions that Git did not preserve. A workspace's `workspace.lock.json` records the accepted installation. Update it after deliberately accepting an upgrade.

To use the accepted candidate, stop the old runtime and launch the workspace explicitly with the candidate interpreter, using your usual configuration location. Record the package version, source revision and wheel SHA-256 in the workspace lock after checking the live workspace. Local builds can differ even when their base release version is the same. Keep the previous interpreter, wheel and verified pre-upgrade backup for recovery.

## SQLite workspaces and backups

New local workspaces use SQLite. With the app closed, convert a legacy JSON workspace into a separate folder using the tested installed build. Run these examples outside the software checkout. The source folder stays available for recovery.

```sh
EA_WORKSPACE_PYTHON="/absolute/path/to/installation/.venv/bin/python"
"$EA_WORKSPACE_PYTHON" -m employment_agency migrate-sqlite /path/to/legacy-workspace /path/to/sqlite-workspace
"$EA_WORKSPACE_PYTHON" -m employment_agency --workspace /path/to/sqlite-workspace serve
```

If you already exported a legacy ZIP with the previous build, use `restore /path/to/backup.zip /path/to/sqlite-workspace --sqlite` with the same interpreter. For a SQLite ZIP omit `--sqlite`. To restore a complete private Git clone into a new live workspace, use `restore-snapshot /path/to/clone /path/to/sqlite-workspace`. These recovery paths assign a new workspace ID and reset local provider permissions.

Each save updates the corresponding readable records under `state/` and publishes a small `state.json` manifest. Git tracks those files alongside workspace documents. SQLite, its journal and machine permissions stay local. Check the snapshot status in **Settings → Workspace files**. With the app stopped, run `.venv/bin/python -m employment_agency --workspace /path/to/sqlite-workspace action snapshot-status` from the software folder. This read operation needs no input JSON. Pending publication retries on save or reopen. For a snapshot conflict, preserve the incoming snapshot in a separate folder and restore it there to review the two workspaces.

In **Settings → Company cooldown**, choose 1 to 24 calendar months. The default is three months from the second confirmed application to a distinct vacancy at the same employer. Changing the duration recalculates company rounds from the recorded submission dates.

The live SQLite database uses schema 7. Schema 5 added the indexed cooldown deadline. Schema 6 added the local agent queue, and schema 7 rebuilds the two queue indexes from existing bookmarks and agent marks. Portable SQLite ZIPs and Git snapshots use schema 3. For rollback, use the earlier build to restore its verified pre-upgrade backup into a separate folder. Restored agent records retain history. Reconcile any uncertain external outcome before granting fresh submission authority. [Connected application runtime and channel support](apply-for-me.md)

After using the new workspace, export its current state before recovering to a previous copy. Reconcile later decisions and any uncertain attempts with the original evidence. Record the tested installed build in the workspace lock only after verifying the intended upgrade.

## Find new jobs

First save a search profile with your role and location preferences. Then open **Search preferences → Find new jobs**. Choose configured feeds or enter one public HTTPS address per line. A careers index or sitemap can lead to related vacancies. The app saves structured postings and shows readable excerpts and links for other pages. Review the source status when coverage is partial.

Use **Live sources** to register Greenhouse, Lever, SmartRecruiters, Ashby or Workable by employer board identifier. We Work Remotely accepts `all`, `programming`, `full-stack` and `devops`. Remotive accepts `all`, `software-dev`, `devops`, `product`, `data` and `qa`. The original feed links retain attribution. [We Work Remotely RSS](https://weworkremotely.com/remote-job-rss-feed) · [Remotive API terms](https://remotive.com/remote-jobs/api)

For public pages that need JavaScript, use the optional browser dependency. From a built source checkout, install it with the Python interpreter that runs the app. Playwright may reuse a compatible installed Chrome when its matching Chromium is unavailable.

~~~sh
.venv/bin/python -m pip install '.[discovery]'
.venv/bin/python -m playwright install chromium
~~~

The app uses direct HTTP first and renders thin pages when possible. **Render supplied pages with the local browser** also tries pages whose first response has readable shell text. Access restrictions can still require native search or manual import. [Playwright browser installation](https://playwright.dev/python/docs/browsers)

Firecrawl is optional. Set up the Firecrawl CLI or supply `FIRECRAWL_API_KEY` in the local launcher environment. The environment key takes precedence. In **Page rendering options**, select **Allow Firecrawl for up to two public pages** for that run. The adapter can submit up to two permitted public page URLs without query strings after an eligible timeout, transient network failure or rendering failure. Local search remains available if Firecrawl is unavailable. [Firecrawl CLI](https://docs.firecrawl.dev/sdks/cli) · [Firecrawl billing](https://docs.firecrawl.dev/billing)

## Back up without upgrading

In Settings, **Export private workspace** downloads a portable ZIP. To use the CLI, stop the app first and run these commands from your software folder:

```sh
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/my-career-workspace" export "$HOME/Documents/career-backup.zip"
.venv/bin/python -m employment_agency restore "$HOME/Documents/career-backup.zip" "$HOME/Documents/career-restored"
.venv/bin/python -m employment_agency --workspace "$HOME/Documents/career-restored" serve
```

Choose a new archive filename and a new restore folder each time. On Windows, use `.\.venv\Scripts\python.exe` and paths under `$env:USERPROFILE`. The restored workspace does not inherit machine-local provider permissions or trusted Codex hooks; run the [gate setup](agents.md#enable-the-codex-job-research-gate) for its new path.

## Troubleshooting

| Symptom | Meaning and action |
| --- | --- |
| `cd: no such file or directory` | Wrong starting directory or clone did not succeed. Find the existing software folder and use its full path. |
| `python ... can't open file .../venv` | Use `python3 -m venv .venv`; `venv` is a Python module. |
| `.venv/bin/python: no such file` or bad interpreter | Create a separate environment using an installed Python. Preserve the previous one. |
| Node engine/build error | Check `node --version`; source builds require Node 24+. Run the dependency installation before building. |
| Missing frontend assets | Run `npm --prefix frontend ci --ignore-scripts`, then `npm --prefix frontend run build` in the software checkout. Reinstall if you need a new wheel. |
| React hydration warning after formatting generated files | Rebuild with `npm --prefix frontend run build`. Do not format/edit `employment_agency/web/` or `frontend/out/`; their HTML and scripts must match the Next export. |
| `No module named ...` | Install with the exact interpreter used to start the app: `.venv/bin/python -m pip install .`. |
| Address already in use | Stop the previous app with Ctrl+C, or use `serve --port 8767` and open `http://127.0.0.1:8767`. |
| Workspace already open | Stop the other process using that workspace. Deleting `.lock` is not a safe way to unlock an active process. |
| Browser cannot connect | Confirm the server printed its address and is still running; use the printed port. |
| HTTP 403 | Use `http://127.0.0.1:PORT` exactly. Reload after a workspace switch to refresh its token. |
| Empty queue or missing personal data | Check the selected folder. Source and installed-package defaults differ. Open the existing private workspace explicitly. |
| Older/unsupported schema | Use the documented explicit migration into a new folder or the compatible installed release. Preserve originals. |

For build/runtime boundaries, storage, recovery and verification, see [system design](system-design.md).
