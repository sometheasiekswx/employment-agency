# Workspace portability

The shared app opens an explicitly selected career workspace in a Git repository or a plain folder. The workspace keeps its career records and document versions. Machine settings hold permissions and the last successful selection.

- [x] Keep the current workspace and its token on failed selection. Rotate the token when a selection succeeds. Bind provider grants to workspace identity and path. Require a fresh grant when the previous grant lacks an identity.
- [x] Make folder creation explicit for a named or remembered path. Support a new Git root through initialization and the folder chooser. Remember the selection after the server binds its port.
- [x] Limit new backups to workspace data and explicitly selected additions. Verify paths, size, and checksums before returning a usable archive. Preserve restore compatibility with older archives.
- [x] Rebuild missing recovery metadata using the application record's manifest hash or a committed manifest for a history-only version. Verify the document hashes before sealing originals. Exercise the standard and custom LaTeX draft workflows.
- [x] Rebuild and serve with explicit workspace and Tailscale settings. Verify both alternate folder types and a disposable copy of the existing workspace. Keep the existing live deployment available while preparing the release.

Verify the isolated failure cases in the Python suite, then exercise the folder flow in a browser and run a production frontend build. Use copies when testing existing career data and compare canonical document hashes before and after.

## Verification

- Passed 214 Python tests, 366 frontend tests, type checking, lint, production build, and the local and hosted browser suite.
- The rebuild helper served an unrelated Git clone on an alternate port. Chrome showed the correct data before and after switching to a plain folder. The installed wheel passed its workspace and document checks in a fresh virtual environment.
- A disposable workspace copy loaded all existing applications. Export and restore preserved the canonical application PDFs by SHA-256, and the configured LaTeX master compiled.
