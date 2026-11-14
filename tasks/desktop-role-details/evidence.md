# Desktop role details verification

Baseline `584e012` was built from unchanged product sources before editing. All browser captures use the production Next.js export, a disposable Concept A workspace and two fictional saved roles with long titles and company labels.

| Unscrolled viewport | Pane top, before → after | Reading area on open, before → after | Reading area with removal feedback, before → after |
| --- | ---: | ---: | ---: |
| 1440 × 900 | 250 → 80 px | 214 → 697 px | 44 → 697 px |
| 1024 × 640 | 250 → 80 px | 44 → 437 px | 44 → 437 px |

The original 44 px body consisted entirely of vertical padding. Prepare application wrapped onto two lines beside shorter controls, and Remove role occupied a second row at 1024 px. The fixed default-text actions are each 42 px high and share one row at both widths. The footer ends 17 px above the bottom at scroll position zero. Preparation guidance and long heading scroll with the details on desktop.

The original removal notice persisted at 8.4 seconds. The fixed notice expired in both engines after 8.4 seconds, with the viewport unscrolled in the matched images and the reading area preserving its height. The browser test edited the saved reason in Removed after the notice expired and verified Restore was available. The removal browser suite exercises the actual restore and retry paths.

## Artifacts and reproduction

The ignored directory `output/playwright/desktop-role-details/` contains `before-chromium-*` and `after-{chromium,webkit}-*` captures, browser logs and geometry JSON. Each run captures the initial selected role, a new removal notice and the view after 8.4 seconds. Representative screenshots are `before-chromium-1024x640-removed.png`, `after-chromium-1024x640-removed.png` and `after-chromium-1024x640-after-eight-seconds.png`.

Run the production build first on the revision under test.

```sh
npm --prefix frontend run build
PYTHONPATH=.:tests .venv/bin/python -c 'from run_browser_checks import fixture, browser
with fixture("serve_concept_fixture.py") as url:
    browser("desktop-role-details-browser.cjs", url)'
```

Set `BROWSER_ENGINE=webkit` for the Playwright WebKit run. To repeat the baseline, run the capture script against the built export at `584e012` with `REPRODUCE_BASELINE=1`. The same wrapper runs the other browser scripts. Use `serve_sqlite_fixture.py` for `application-journey-browser.cjs`.

## Checks

- Frontend typecheck, ESLint, all 369 frontend tests and production export passed. Fake timers cover remaining time after interaction or editing, receipt timing, pending and failed restoration, retry, newer feedback and unmount. The interaction test exercises pointer entry/exit and keyboard focus moving within and away from the notice.
- Python unittest discovery ran 330 tests. Seven optional application form tests skipped because the Python Playwright/Chrome bridge was unavailable in this environment: 404/missing confirmation, qualifying or negative heading, conflicting error, cross-endpoint CV and hidden answer, multistep receipt, exact-byte submission receipt and pre-existing receipt.
- The new desktop details regression passed in Chrome and WebKit. It also checks a filtered one-role view, a preceding workspace notice changing height, resizing to a 580 px-tall viewport, 200% pane text, and the wider CV panel.
- Playwright Chrome and WebKit Discover layout checks exercised 320, 390, 768, 900, 901, 930, 1000, 1001, 1024, 1150, 1151, 1280, 1440 and 1920 px with real layout, responsive dialog mode and keyboard focus.
- Chrome Opportunities, opportunity removal, motion, sheet scrolling and SQLite application journey passed. Tests preserve case-sensitive action names, draft guards, pending/error recovery, native-dialog focus, sheet gestures and application records.
- WebKit is Playwright's engine on macOS. Touch checks use browser emulation. Text enlargement sets computed pane text to 200%; it does not exercise Safari's own browser zoom or a physical mobile device.

The full Linux/macOS/Windows CI matrix, standalone hosted bootstrap and wheel gates, development proxy smoke test, full browser runner, public preview checks and application-provider browser gate were outside this focused local run. The new scenario is registered in the full browser runner.

## Local preview

The verification session leaves a fictional preview at [To apply](http://127.0.0.1:8792/discover/?view=to-apply). Open either fictional role at **Fictional Consortium for Interoperable Infrastructure and Distributed Computing Research** and remove one to see the other role stay open while the notice expires. This preview uses a temporary workspace and lasts only while its fixture process runs; it does not upgrade an installed career workspace.
