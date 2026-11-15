# Agency identity rollout verification

## Web and package

The normal Next.js export and the static public-preview build render the Industrial Precision **Agency.** wordmark. Chromium on the disposable Alex Morgan fixture decoded the selected SVG at 1280px and 320px in both themes. The brand link retains its Employment Agency accessible name and destination. The 320px public-preview check verifies that the full wordmark, Public demo label, and avatar/menu fit together in the header.

The appearance browser check passed for the dark default, explicit Light and Dark, live System changes, saved preference and reload, tab sync, denied storage, and first paint under the existing CSP. It followed the page metadata to the SVG and ICO favicons, Apple touch icon, Safari mask, and web manifest, then checked the image responses and decoded the three installed-site PNGs at their declared sizes.

| Check | Result |
| --- | --- |
| `npm --prefix frontend run typecheck` and `npm --prefix frontend run lint` | Passed |
| `npm --prefix frontend test` | 395 passed across 36 files |
| `.venv/bin/python -m unittest discover -s tests -q` | 423 passed |
| `npm --prefix frontend run build` | Passed and copied the normal export into the package |
| `.venv/bin/python tests/run_browser_checks.py` | All local and hosted production-export checks passed, including appearance, desktop/mobile navigation, highlights, immutable submitted documents and WebKit flows |
| `.venv/bin/python tests/check_wheel.py --browser output/agency-logo-rollout/wheel/employment_agency_local-0.7.0-py3-none-any.whl` | Passed outside the checkout, including installed asset bytes, document generation, exact submitted files and queue/history behavior |
| `npm --prefix frontend run build:preview` | Passed |
| `.venv/bin/python tests/run_public_preview_checks.py` | Both preview flows passed, including the 320px public header layout and mobile WebKit |

The preflight wheel is `employment_agency_local-0.7.0-py3-none-any.whl`, SHA-256 `17f643449b970eef3ccedc81ec26027de96fe62eb9d7c6c99558d3f8246c5f76`. The ten web branding files, including the new manifest, were compared byte for byte across the maintained source, both normal export destinations, the wheel, and the public-preview export. The SHA-256 inventory below covers the 28 copied kit assets. The web manifest adds app metadata around the kit's three icon descriptors.

Local evidence is under `output/playwright/agency-logo-rollout/`. Existing browser-managed shortcuts may retain the previous icon until the user updates or re-adds the shortcut.

## Native launcher icons

- **iOS.** Xcode 27.2 compiled the normal Debug shell for iOS Simulator. `assetutil --info` confirmed 1024px default, dark and tinted AppIcon renditions in the built catalog. An isolated XCTest harness with the same assets showed the default **A.** app icon under SpringBoard's mask on an iPhone 18 Pro simulator running iOS 27.0. Tapping it opened the fictional workspace. The screenshots are `ios-shell.png` and `ios-launcher.png` in the local evidence directory.
- **Android.** `assembleDebug` compiled and packaged the adaptive, monochrome and density-specific launcher assets. The built shell displayed the fictional board in an API 37 emulator. Its app drawer displayed both the letter and square of the **A.** icon inside the circular mask. The screenshots are `android-shell.png` and `android-launcher.png` in the local evidence directory.
- Physical-device acceptance remains open. No connected physical iOS or Android target was available. Tinted iOS and themed Android launchers were checked as compiled resources.

## Current README media

Recaptured desktop review, mobile review, and application documents against the six-role disposable fictional workspace. `scripts/capture-showcase.cjs`, `scripts/build-showcase.py` and `scripts/check-showcase.py` passed. Inspected the GIF action contact sheets and verified the wordmark on the rail and mobile header when visible. The checker verified decoded frames, supplied widths, infinite looping, source hashes and the static poster pixels. The three GIFs are about 4.57 MB, 6.98 MB and 2.11 MB. Dated evidence and earlier release media retained their original bytes. [Provenance](../../docs/media/showcase-provenance.json) · [Quality report](../../docs/media/quality-report.json)

## Kit asset provenance

The approved Industrial Precision kit is dated 16 November 2026 (version 1.0.0). Each source SHA-256 below matched the kit manifest and the maintained destination.

### Web

| Kit asset | Maintained asset | SHA-256 |
| --- | --- | --- |
| `web/agency-header-on-dark.svg` | `frontend/public/agency-header-on-dark.svg` | `b3244ddbb82e41f3d5f45f4b8044a2c1ac892ae577b0737d26ea67240eb6b34f` |
| `web/agency-header-on-light.svg` | `frontend/public/agency-header-on-light.svg` | `eec7d477f524bad3097bd5cdec23ebe84b3570ff64f123a71d6020d94b4861ae` |
| `web/apple-touch-icon-180.png` | `frontend/public/apple-touch-icon-180.png` | `ff558808c81f4b35877d2b69027f09e445acd56065fbdac88e5b3ae731e117e3` |
| `web/favicon.ico` | `frontend/public/favicon.ico` | `010f8024484a928dae283055818efac268b2dbc575bdf4b1dcc30e479c3c8fe6` |
| `web/favicon.svg` | `frontend/public/agency-favicon.svg` | `bb1cb6bb835a9f9e2cbd64d5c4091a97f55e8fc2160a2ea45be2f55c6813e3e5` |
| `web/pwa-192.png` | `frontend/public/pwa-192.png` | `159f967e264dd9c35ff46ecc15b20a6133b038da2ac74099b5ac60e89e68d28a` |
| `web/pwa-512.png` | `frontend/public/pwa-512.png` | `5b08d190747a583011e7b386f4d43c0c5a7a9d52f730380faad1c921411610c5` |
| `web/pwa-maskable-512.png` | `frontend/public/pwa-maskable-512.png` | `5b08d190747a583011e7b386f4d43c0c5a7a9d52f730380faad1c921411610c5` |
| `web/safari-pinned-tab.svg` | `frontend/public/safari-pinned-tab.svg` | `69de8ad0ac95043d60730cfd8709812bb71960f0266640e7557cb04c4e792450` |

### iOS

| Kit asset | Maintained asset | SHA-256 |
| --- | --- | --- |
| `app/ios/AppIcon.appiconset/Contents.json` | `mobile/ios/Sources/Assets.xcassets/AppIcon.appiconset/Contents.json` | `5a729920ec0f4d10732ef42bcf3b7ceefdba1dedd307a53ceef57fc2815b442b` |
| `app/ios/AppIcon.appiconset/agency-dark.png` | `mobile/ios/Sources/Assets.xcassets/AppIcon.appiconset/agency-dark.png` | `d7dec26250790e119f9c8bfe1721f3df6fda5f9a19a05a8101cb74efa04a99ce` |
| `app/ios/AppIcon.appiconset/agency-default.png` | `mobile/ios/Sources/Assets.xcassets/AppIcon.appiconset/agency-default.png` | `2b3c5235d9aa2fea3681a7fcbc2bda2891f403e067d8088d89fc052c5377eb27` |
| `app/ios/AppIcon.appiconset/agency-tinted.png` | `mobile/ios/Sources/Assets.xcassets/AppIcon.appiconset/agency-tinted.png` | `cdd3248e48528abd2216ca54732613811874990eb97e37f1e990bbe639805fad` |

### Android

| Kit asset | Maintained asset | SHA-256 |
| --- | --- | --- |
| `app/android/res/drawable/ic_launcher_background.xml` | `mobile/android/app/src/main/res/drawable/ic_launcher_background.xml` | `6ae7534bfba39e41758a389b0b4229867f861b98cc9f8e1898295981264034df` |
| `app/android/res/drawable/ic_launcher_foreground.xml` | `mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml` | `ad7e20f31671028bae91617ab87ac604cade17b21419cd84db6b83d05fbdef17` |
| `app/android/res/drawable/ic_launcher_monochrome.xml` | `mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml` | `12e5f367224755313e5652f7d23ffb08d50e46ca98c3c9193b1c95ab18d58fe3` |
| `app/android/res/mipmap-anydpi-v26/ic_launcher.xml` | `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | `79dd813dc63827efb19fbf7f0a8886bc6ccb0c4ce92e38a838e486fce5e96fde` |
| `app/android/res/mipmap-anydpi-v26/ic_launcher_round.xml` | `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | `79dd813dc63827efb19fbf7f0a8886bc6ccb0c4ce92e38a838e486fce5e96fde` |
| `app/android/res/mipmap-hdpi/ic_launcher.png` | `mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | `ab47d5ed610214b04bd36fa6ccc1ecbdd28c2ffce1cd4d68357130eba534bce9` |
| `app/android/res/mipmap-hdpi/ic_launcher_round.png` | `mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | `e8c65cfb3932d38f972232b3d952931c5436d240730ce666a5f3595e360af9b6` |
| `app/android/res/mipmap-mdpi/ic_launcher.png` | `mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | `5b0e84083e79d00636cad359e985162fb20914da3bc41f609e075dd208848466` |
| `app/android/res/mipmap-mdpi/ic_launcher_round.png` | `mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | `8e132d083e3ff9f1e93a3fccbda6ce903acb02af4b5317643ef3478e0245a9bb` |
| `app/android/res/mipmap-xhdpi/ic_launcher.png` | `mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | `ccadae2bacffd701a9bfbd27982208f8553a82437012aab28d4352e0ceff2d19` |
| `app/android/res/mipmap-xhdpi/ic_launcher_round.png` | `mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | `de0778566fbac92c021dbc141fe4a2bc181bf7c463845610a9395df21bc2aadc` |
| `app/android/res/mipmap-xxhdpi/ic_launcher.png` | `mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | `800b1cff5ecb2b0888526c243f718f49b860a7c044f99708ca212dd300c83ed8` |
| `app/android/res/mipmap-xxhdpi/ic_launcher_round.png` | `mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | `6ef31e1aa8db02b93c2f97c31be10613f74367eea86ecde712e07f6a22b3b946` |
| `app/android/res/mipmap-xxxhdpi/ic_launcher.png` | `mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `159f967e264dd9c35ff46ecc15b20a6133b038da2ac74099b5ac60e89e68d28a` |
| `app/android/res/mipmap-xxxhdpi/ic_launcher_round.png` | `mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | `a5b7ab7fcdf55b64b05cebfc24adfc16106b0576cb2bec497971f716bea748fa` |

## Review and release readiness

The independent review found no blocking issues in the final source, launcher catalogs, generated exports or current media. It rechecked source and kit hashes, the normal and preview export asset bytes, Next's generated icon and manifest links, the installed wheel contents, and the current posters and sampled GIF frames. It found no active references to the retired briefcase SVGs. `git diff --check` passed. An isolated private preflight restored a backup with the candidate wheel and confirmed compatible state, application documents and company highlights. That evidence stays in the private recovery record.

The [Checks workflow](https://github.com/sometheasiekswx/employment-agency/actions/workflows/check.yml) gates the automatic public release. Compare its push SHA with the [live release marker](https://employment-agency-demo.vercel.app/release.json), then follow the [release runbook](../../docs/public-demo-deployment.md#verify-and-recover) to verify routes and security headers. Public browser smoke evidence is saved under the ignored `output/agency-logo-rollout/live-public/` directory after promotion.
