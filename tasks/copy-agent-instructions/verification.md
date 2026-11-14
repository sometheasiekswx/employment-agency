# Copy agent instructions verification

Both boards use the shared instruction row. The user’s click reads the current prompt and begins the clipboard write. The browser receives the bytes only after the handoff passes the freshness and blocker checks. To apply reads the entire pending queue through `all_pending`, including roles outside the page and filters. Existing runs still expose their progress controls and individual roles retain their connected-agent actions. Clipboard denial opens the shared retry dialog with a read-only, selected prompt.

## Passed

| Check | Result |
| --- | --- |
| `npm --prefix frontend test` | 386 tests in 35 files. Added coverage includes no Select controls, complete queue from its second page, existing run Resume/Stop, zero submission mutations, blockers and opening a role, empty queue, denied clipboard and retry, and rejection of stale prompt bytes in the promise-backed clipboard path. |
| `npm --prefix frontend run lint` | Passed on final source. |
| `npm --prefix frontend run typecheck` | Passed on final source. |
| `npm --prefix frontend run build` | Final source compiled, type-checked, exported and packaged its static files. |
| `git diff --check` | Passed. |
| `jobs-capacity-browser.cjs` with the disposable SQLite browser fixture | Passed in Chromium (Chrome) with clipboard permissions and in WebKit with native paste. Both boards copied the exact server-generated text. To apply copied a role outside its active employer filter. No dialog, URL change or mutating request followed the successful click. The 1440 and 390 px rows matched in left alignment, padding/border, gap, scope font size and button height. |
| `application-journey-browser.cjs` and `sqlite-company-browser.cjs` with the disposable SQLite browser fixture | Passed in Chromium. Denied clipboard produced the fallback. Existing application preparation, submission confirmation, slot accounting and immutable documents checks passed. |

## Browser evidence

The four fictional screenshots are in the ignored directory `output/playwright/copy-agent-instructions/`: `jobs-1440.png`, `to-apply-1440.png`, `jobs-390.png` and `to-apply-390.png`.

The browser checks above used the production export immediately before an explicit guard for a missing clipboard API. The exercised native clipboard and mocked rejection paths are unchanged when their clipboard methods exist. The final full test suite and build include that guard.

## During implementation

The first type-checked build identified a leftover selection state reference and unsupported Testing Library selector options. Those were corrected. The first Chromium copy attempt timed out with read permission only. The Chromium fixture then granted both read and write permission and passed. WebKit passed without a permission override. The first stale-payload unit test decoded a jsdom Blob with Node's Response. Switching the assertion to the browser's FileReader corrected the fixture, and the final full run passed.

## Remaining for ship preparation

Full browser matrix, Python checks, wheel packaging and external-to-checkout wheel installation are tracked by the shipping stage. The implementation used fictional data and did not modify the installed app.
