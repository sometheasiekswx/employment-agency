# Selection, instructions and sidebar verification

The candidate was built from the recovered source and tested against disposable fictional workspaces on macOS. [Independent review](review.md) · [Cancellation regression](cancellation-verification.md)

## Automated checks

| Command | Result |
| --- | --- |
| `npm --prefix frontend ci --ignore-scripts` | Installed the locked dependencies |
| `npm --prefix frontend audit --audit-level=moderate` | No vulnerabilities reported |
| `npm --prefix frontend run typecheck` and `npm --prefix frontend run lint` | Passed |
| `npm --prefix frontend test` | 384 tests passed across 35 files |
| `npm --prefix frontend run build` | Produced the static export on the final source |
| `python -m unittest discover -s tests -q` | 388 tests passed |
| `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` | 108 checks passed |
| `python tests/run_browser_checks.py` | All local scripts passed. The hosted browser script timed out once waiting for a draft request. On the final export, a fresh hosted fixture passed that script, the hosted editor and hosted parity. Three fresh repeats of the hosted browser script also passed. The final SQLite application journey passed independently with the updated readiness disclosure. |
| `uv build --wheel` and `python tests/check_wheel.py --browser <wheel>` | Fresh wheel installation passed including the application journey, package assets, SQLite migration and restore, queue rendering and unchanged submitted document bytes |
| `python tests/check_hosted_install.py` and `python tests/check_development.py` | Hosted dependency bootstrap passed. Real Next.js development passed proxy, origin/token guards, application-site redirect, CSS Fast Refresh and process shutdown. |
| `npm --prefix frontend run build:preview` and `python tests/run_public_preview_checks.py` | The fictional static export and both browser scripts passed |
| `python tests/run_apply_checks.py` | Controlled app and adapter tests passed with mocked providers and a loopback form |

## Behavior

- Browse mode hides selection controls. Select reveals native checkboxes and a single count. Exact selected IDs survive filters and pagination. Clear returns focus to Done, and leaving selection mode restores the all-pending scope.
- The server's canonical vacancy allowance supplies the pending-only count. Equivalent listings share a slot. The card and inspector show the same capacity status, retain more specific blockers and switch back to Apply later when refreshed state exposes a free slot.
- The shared dialog copies exact edited text, resets to the generated version, rejects empty copy and keeps text editable after clipboard denial. A changed profile or role scope invalidates the prompt and ignores obsolete generation responses. Both read-only handoff requests completed without submission calls. Research uses the active profile ID. Application handoff remains scoped to the exact roles or the backend's pending snapshot.
- Opening a blocked role still reaches the inspector. The To apply toolbar collapses unavailable connected-agent information into a native disclosure. The disabled state retains the explanation and setup path. Available Start, retry and in-progress actions remain available under their existing conditions.
- The compact rail presents actual counts and wraps long profile labels and role families. Chromium checks covered 320, 390, 768, 900, 901, 1024 and 1440 CSS pixels in light and dark. At 1024 × 620 with 200% text, keyboard focus reached Settings in the expanded rail. The workflow produced no horizontal overflow or page errors. The independent review also checked WebKit and ran Axe on the prompt.
- The Impeccable scan of the changed UI source reported four pre-existing font findings for the project's approved, self-hosted Inter faces. The rendered layouts and browser accessibility checks supplied the complementary evidence.

Screenshots used fictional records. Physical devices, Windows and Linux were outside the local run. The cross-platform pipeline and actual public target are tracked under the delivery task.
