# Workspace folder selection

## Requirements

Show the workspace location, without a workspace-name field, during setup and in Settings. Replace the separate open/create path forms with **Open Folder**, which opens the computer's folder chooser. Use **Save** for workspace settings. Retain existing labels in stored data for compatibility, but do not use a user-defined name in the interface.

Choosing an existing schema-2 workspace opens it and remembers its location. Choosing an empty folder creates a workspace. Cancel leaves the current workspace and selection unchanged. Nonempty folders without a workspace, locked workspaces, incompatible schemas and active runs must fail without replacing the current workspace. No documents are moved or uploaded.

The local server supplies the full path because browser file inputs do not supply a usable server-side directory path. Native adapters use AppleScript on macOS, Windows Forms via PowerShell on Windows, and Zenity or KDialog on Linux. Commands have fixed arguments, no shell interpolation, bounded execution and explicit cancellation. Hosted accounts keep their cloud workspace and do not expose a local picker.

## Plan

- [x] Add the native chooser and a protected local browse action. Reuse validated workspace opening/creation, token rotation and active-run checks. Keep state reads available while the picker is open; reject simultaneous pickers and stale requests.
- [x] Replace the setup/settings controls, keep existing settings and stored labels compatible, and use a generic sidebar caption/title. Cover loading, cancellation, errors and keyboard focus.
- [x] Verify adapter success/cancellation/failure contracts and workspace-switch preservation using temporary fixtures. Exercise setup, settings, Save, chooser cancellation/error, new/existing folders and responsive views in Chrome. All tests isolate machine configuration, including the earlier workspace-selection regression fix.
- [x] Review the full diff and run the repository checks. Preserve private data and the pinned local installation. A push is authorized; an explicit production deployment or local installed-build upgrade is outside this request.

Commit/push and remote CI status are reported with the delivered revision in chat.

## Verification and release

Verified on macOS, 30 October 2026:

- `python -m unittest discover -s tests -q`: 63 tests passed. The new checks cover native adapter contracts, cancellation/failure, authorization, active runs, locked/incompatible workspaces, invalid folders, token rotation, concurrent chooser rejection and state reads during selection. Real application configuration was hashed before and after the suite and was unchanged.
- Chrome: `folder-browser.cjs` passed setup, Save, cancellation and keyboard focus, chooser errors, nonempty-folder rejection, empty-folder creation, reopening, settings preservation and 320/768/1024/1440 widths. Long locations wrapped without horizontal overflow. Desktop/mobile screenshots were inspected.
- Existing local, hosted, document editor and workspace browser checks passed with fictional fixtures. Workspace acceptance now selects an active fixture instead of assuming the first application is active; its chooser result is simulated. The hosted browser check confirms no local folder button is exposed.
- JavaScript syntax and `git diff --check` passed. Review covered the actual change, input escaping, local-only authorization, bounded fixed subprocess commands without shell interpolation, cancellation, concurrency, compatibility and responsive controls. No unresolved blocking finding remained in that scope.
- Native chooser execution is mocked in automated tests; actual desktop dialog interaction is not claimed. Windows/Linux native dialogs require verification on those desktops. Linux needs Zenity or KDialog; unsupported/headless environments can use the explicit CLI workspace option.

No data schema or dependency change is required. Stored labels remain compatible. Recovery is to use the prior installed release and an explicit `--workspace` path; tests and previews do not upgrade the owner's pinned installation or alter private application documents.
