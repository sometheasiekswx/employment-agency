# Running locally

The application has two separate locations: a **software checkout** containing `pyproject.toml`, `frontend/` and `employment_agency/`, and a **career workspace** containing `state.json`, `workspace.json` and personal documents. Run installation commands in the software checkout. Select the career workspace using `--workspace` or Settings → Open Folder. Installing software does not import, migrate or upload personal documents.

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
.venv/bin/python -m employment_agency serve
```

On Windows use `py -3` and `.venv\Scripts\python` in place of `python3` and `.venv/bin/python`. Dependencies and the frontend are installed locally; no provider key is needed. The build creates `employment_agency/web/`. Keep this directory when running from the checkout. A built wheel already contains these assets.

The server prints `Employment Agency: http://127.0.0.1:8766`. Open that exact address; `localhost` is rejected by the strict local host check. Keep Terminal open. Ctrl+C stops the server. The terminal continuing to run after printing the address is expected.

The first run opens the remembered workspace, or a default new workspace when none is remembered. To select existing data explicitly, put the global option **before** `serve`:

```sh
.venv/bin/python -m employment_agency --workspace "/absolute/path/to/private-workspace" serve
```

Use the exact existing data path. A new or mistyped folder can produce a new empty workspace. If the queue is empty, inspect Settings → Workspace location before generating anything. Stop the app and reopen the correct location; do not delete either folder.

## Existing environments and upgrades

A virtual environment belongs to the Python interpreter that created it. Reusing an old `.venv` after changing Python installations can leave stale links or packages. Do not delete a working environment to troubleshoot. Create a separate one, keeping the old installation available:

```sh
python3 -m venv .venv-next
.venv-next/bin/python -m pip install .
```

Build the frontend first as above. Both `.venv` and `.venv-next` are ignored by this repository. Use the new environment's Python explicitly for the new version. Running from the checkout imports that checkout's Python code; a console command outside the checkout uses the installed package. Use the same build and interpreter consistently.

Before opening real data with a new release, stop the old app, export with the old installed version, restore to a **new** directory, and test that copy with the new version. For example, in the software folder:

```sh
.venv/bin/employment-agency --workspace "/absolute/path/to/private-workspace" export "/absolute/path/to/backup.zip"
.venv-next/bin/python -m employment_agency restore "/absolute/path/to/backup.zip" "/absolute/path/to/restored-copy"
.venv-next/bin/python -m employment_agency --workspace "/absolute/path/to/restored-copy" serve
```

Export refuses an existing archive path; restore refuses an existing destination. Backups contain private data; store them outside the public software checkout and keep an off-device copy. Permissions must be regranted after restore. A workspace's `workspace.lock.json` is a human-maintained installation record, not an automatic version manager. Update it only after deliberately accepting an upgrade. Versions 0.2 and 0.3 share workspace schema 2.

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
