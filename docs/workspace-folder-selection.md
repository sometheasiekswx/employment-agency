# Workspace folder selection

## Open or create a workspace

Check the folder shown during setup or in **Settings → Workspace files**. **Open Folder** opens the desktop chooser on the machine running the local app. Select an existing live workspace to open it, or choose an empty folder or new Git repository to initialize a SQLite workspace. **Save** stores changes to workspace settings. Existing workspace labels remain in stored data for compatibility.

The app remembers the selected path. It supports current SQLite workspaces and compatible legacy schema-2 JSON workspaces. A Git snapshot without its live database needs `restore-snapshot` first. Cancel keeps the current selection. A failed open also preserves it, including when the target is locked, too new or contains unrelated files. Finish the current preparation run, delivery or connected application before switching. The app closes an in-progress discovery run when switching to another workspace. [Recovery and migration commands](running-locally.md#sqlite-workspaces-and-backups)

The chooser uses AppleScript on macOS, Windows Forms through PowerShell on Windows, and Zenity or KDialog on Linux. On a headless machine use `--workspace` before `serve`. When accessing the app through Tailscale, the chooser appears on the server's desktop. Hosted accounts use their cloud workspaces. [Explicit workspace selection](running-locally.md#install-from-source)

## Implementation record — 30 October 2026

- [x] Add the native chooser and a protected local browse action. Reuse validated workspace opening/creation, token rotation and active-run checks. Keep state reads available while the picker is open; reject simultaneous pickers and stale requests.
- [x] Replace the setup/settings controls, keep existing settings and stored labels compatible, and use a generic sidebar caption/title. Cover loading, cancellation, errors and keyboard focus.
- [x] Verify adapter success/cancellation/failure contracts and workspace-switch preservation using temporary fixtures. Exercise setup, settings, Save, chooser cancellation/error, new/existing folders and responsive views in Chrome. All tests isolate machine configuration, including the earlier workspace-selection regression fix.
- [x] Review the full diff and run the repository checks. Preserve private data and the pinned local installation. A push is authorized; an explicit production deployment or local installed-build upgrade is outside this request.

This checklist records the original folder-selection change. It shipped in [`b1d5826`](https://github.com/sometheasiekswx/employment-agency/commit/b1d5826).

## Verification and release

Verified on macOS, 30 October 2026:

- `python -m unittest discover -s tests -q`: 63 tests passed. The new checks cover native adapter contracts, cancellation/failure, authorization, active runs, locked/incompatible workspaces, invalid folders, token rotation, concurrent chooser rejection and state reads during selection. Real application configuration was hashed before and after the suite and was unchanged.
- Chrome: `folder-browser.cjs` passed setup, Save, cancellation and keyboard focus, chooser errors, nonempty-folder rejection, empty-folder creation, reopening, settings preservation and 320/768/1024/1440 widths. Long locations wrapped without horizontal overflow. Desktop/mobile screenshots were inspected.
- Existing local, hosted, document editor and workspace browser checks passed with fictional fixtures. Workspace acceptance now selects an active fixture instead of assuming the first application is active; its chooser result is simulated. The hosted browser check confirms no local folder button is exposed.
- JavaScript syntax and `git diff --check` passed. Review covered the actual change, input escaping, local-only authorization, bounded fixed subprocess commands without shell interpolation, cancellation, concurrency, compatibility and responsive controls. No unresolved blocking finding remained in that scope.
- Native chooser execution is mocked in automated tests; actual desktop dialog interaction is not claimed. Windows/Linux native dialogs require verification on those desktops. Linux needs Zenity or KDialog; unsupported/headless environments can use the explicit CLI workspace option.

The original folder picker change used the existing workspace schema. Follow the current [backup and upgrade runbook](running-locally.md#existing-environments-and-upgrades) before changing an installed build.
