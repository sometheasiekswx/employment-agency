# Running locally

The application has two separate locations: a **software checkout** containing `pyproject.toml`, `frontend/` and `employment_agency/`, and a **career workspace** containing `state.json`, `workspace.json` and personal documents. Run installation commands in the software checkout. Select the career workspace using `--workspace` or Settings → Open Folder. Installing software does not import, migrate or upload personal documents. Start with the [personal-workspace quick start](../README.md#run-locally), then follow [your first application](getting-started.md). The paths below are placeholders to replace with your own locations.

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

Use `init` only for a new workspace. Skip it when opening existing data. On Windows use `py -3` and `.venv\Scripts\python` in place of `python3` and `.venv/bin/python`. Dependencies and the frontend are installed locally; no provider key is needed. The build creates `employment_agency/web/`. Keep this directory when running from the checkout. A built wheel already contains these assets.

The server prints `Employment Agency: http://127.0.0.1:8766`. Open that exact address; `localhost` is rejected by the strict local host check. Keep Terminal open. Ctrl+C stops the server. The terminal continuing to run after printing the address is expected.

The first run opens the remembered workspace, or a default new workspace when none is remembered. To select existing data explicitly, put the global option **before** `serve`:

```sh
.venv/bin/python -m employment_agency --workspace "/absolute/path/to/private-workspace" serve
```

If an explicit or remembered workspace is missing, startup asks for an existing path. To create a workspace in a plain folder or Git repository, run the following once. Settings → Open Folder can also initialize an empty folder or new Git repository.

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

Build the frontend first as above. Both `.venv` and `.venv-next` are ignored by this repository. Use the new environment's Python explicitly for the new version. Running from the checkout imports that checkout's Python code; a console command outside the checkout uses the installed package. Use the same build and interpreter consistently.

Before opening real data with a new release, stop the old app, export with the old installed version, restore to a **new** directory, and test that copy with the new version. For example, in the software folder:

```sh
.venv/bin/python -m employment_agency --workspace "/absolute/path/to/private-workspace" export "/absolute/path/to/backup.zip"
.venv-next/bin/python -m employment_agency restore "/absolute/path/to/backup.zip" "/absolute/path/to/restored-copy"
.venv-next/bin/python -m employment_agency --workspace "/absolute/path/to/restored-copy" serve
```

Export covers the workspace's career data directories, settings, root Markdown files, configured master, and verified recovery copies. Set `backup_paths` in `workspace.json` to include additional workspace-relative files or folders. Machine settings and hidden project configuration stay outside the archive. Export requires a new archive path and restore requires a new destination. Store backups outside the public software checkout. Restoring a backup or upgrading a workspace with legacy provider grants requires fresh consent.

When a Git clone lacks recovery metadata, opening it can verify recorded documents against their application manifest hashes. History-only documents can use the manifest committed in Git. Keep a portable backup for original bytes or versions that Git did not preserve. A workspace's `workspace.lock.json` records the accepted installation. Update it after deliberately accepting an upgrade.

Rebuilding the checkout does not update a running process or an installed wheel. If an installed app still shows older behavior, stop it and install the tested candidate with the interpreter used to launch it. For the separate environment above, use `.venv-next/bin/python -m pip install --force-reinstall /absolute/path/to/candidate.whl`, then launch with `.venv-next/bin/python`. Record the package version, source revision and wheel SHA-256 in the workspace lock; local builds can differ even when their base release version is the same. Keep the previous environment and wheel until the restored copy and the real workspace have passed verification.

## SQLite workspaces and backups

New local workspaces use SQLite. Move a legacy workspace into a separate folder with the application closed on that workspace. The source folder stays available for recovery.

```sh
.venv-next/bin/python -m employment_agency migrate-sqlite /path/to/legacy-workspace /path/to/sqlite-workspace
.venv-next/bin/python -m employment_agency --workspace /path/to/sqlite-workspace serve
```

If you already exported a legacy ZIP with the previous build, use `restore /path/to/backup.zip /path/to/sqlite-workspace --sqlite`. A SQLite ZIP uses the normal `restore` command. To restore a complete private Git clone into a new live workspace, run `restore-snapshot /path/to/clone /path/to/sqlite-workspace`. These recovery paths reset local provider permissions.

Each save updates the corresponding readable records under `state/` and publishes a small `state.json` manifest. Git tracks those files alongside workspace documents. SQLite, its journal and machine permissions stay local. Check the snapshot status in **Settings → Workspace files**. With the app stopped, run `.venv/bin/python -m employment_agency --workspace /path/to/sqlite-workspace action snapshot-status` from the software folder. This read operation needs no input JSON. Pending publication retries on save or reopen. For a snapshot conflict, preserve the incoming snapshot in a separate folder and restore it there to review the two workspaces.

In **Settings → Company cooldown**, choose 1 to 24 calendar months. The default is three months from the second confirmed application to a distinct vacancy at the same employer. Changing the duration recalculates company rounds from the recorded submission dates.

SQLite schema 5 adds the indexed cooldown deadline used by the [agent research lookup](agents.md#companies-to-skip-before-research). The build recomputes company rounds from preserved history when it opens a schema-3 or schema-4 database. Portable ZIPs and Git snapshots use schema 3. To roll back the installation, restore a verified portable backup into a separate folder with the earlier build.

Version 0.7.0 added the local agent queue in schema 6. The Jobs and To apply change upgrades the local database to schema 7, rebuilding both queue indexes from existing bookmarks and agent marks. Existing applications, company limits and submitted documents remain preserved. Test a restored copy before switching the live workspace. Keep the earlier installation and its verified pre-upgrade backup: do not open the migrated database with an older build. Restored agent records retain history but cannot replay submission authority; any uncertain external outcome must be reconciled before starting again. See [connected applications](apply-for-me.md) for runtime and channel support.

After using the new workspace, export its current state before recovering to a previous copy. Reconcile later decisions and any uncertain attempts with the original evidence. Record the tested installed build in the workspace lock only after verifying the intended upgrade.

## Find new jobs

First save a search profile with your role and location preferences. Then open **Search preferences → Find new jobs**. Choose configured feeds or enter one public HTTPS address per line. A careers index or sitemap can lead to related vacancies. The app saves structured postings and shows readable excerpts and links for other pages. Review the source status when coverage is partial.

Use **Live sources** to register Greenhouse, Lever, SmartRecruiters, Ashby or Workable by employer board identifier. We Work Remotely accepts `all`, `programming`, `full-stack` and `devops`. Remotive accepts `all`, `software-dev`, `devops`, `product`, `data` and `qa`. The original feed links retain attribution. [We Work Remotely RSS](https://weworkremotely.com/remote-job-rss-feed) · [Remotive API terms](https://remotive.com/remote-jobs/api)

For public pages that need JavaScript, use the optional browser dependency. Install it in the Python environment that runs the app. Playwright may reuse a compatible installed Chrome when its matching Chromium is unavailable.

~~~sh
.venv/bin/python -m pip install '.[discovery]'
.venv/bin/python -m playwright install chromium
~~~

The app uses direct HTTP first and renders thin pages when possible. **Render supplied pages with the local browser** also tries pages whose first response has readable shell text. Access restrictions can still require native search or manual import. [Playwright browser installation](https://playwright.dev/python/docs/browsers)

Firecrawl is optional. Sign in to the Firecrawl CLI with a free-plan account and enable the checkbox for an individual run. A `FIRECRAWL_API_KEY` in the local launcher environment takes precedence over the CLI sign-in. The adapter submits up to two permitted public page URLs without query strings. It can try an eligible timeout, transient network failure or page that needs rendering. An unavailable key or provider leaves local search available. [Firecrawl CLI](https://docs.firecrawl.dev/sdks/cli) · [Firecrawl billing](https://docs.firecrawl.dev/billing)

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
