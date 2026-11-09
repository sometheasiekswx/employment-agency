# Native mobile browser implementation

[Spec](spec.md) · [Decision](../../docs/adr/0012-native-browser-for-mobile-source-links.md)

Use the platform browser UI for external pages. The workspace wrapper needs a trusted origin and standard navigation delegates. A browser-frame workaround cannot load sites that reject embedding. A general-purpose plugin bridge would add a broader interface than this feature needs.

- [x] Preserve normal browser behavior and let the installed app receive native link navigations. Check desktop, ordinary mobile and installed-app link paths.
- [x] Generate a small iOS project and implement trusted workspace navigation, Safari View Controller presentation and retry. Build for the Simulator and device SDK.
- [x] Generate the Android project and implement the same policy with Custom Tabs and Android back navigation. Build and verify a debug APK.
- [x] Exercise both native browser views and return-to-role behavior with fictional jobs. Check the trust boundary and the available device-build path.
- [x] Prepare local build instructions and the requested test artifacts. Verify the web bundle available on the authorized private server before testing the installed build against it.

## Verification

- Web export compiled, lint passed, and all 366 frontend tests passed. The desktop Discover browser check still opens source links in new tabs. The mobile browser checks still show saved details and offer the existing frame preview.
- The iPhone 18 Pro Simulator UI test opened both full websites and returned to the original role after each. The Android 37 emulator did the same through Chrome Custom Tabs. The Android retry view also recovered after the fixture connection returned. Both fixture sites sent `X-Frame-Options: DENY`.
- A visual retest on iOS 27.0 and Android 17 used fictional opportunities. Screenshot checks confirmed that both live pages rendered, that closing each browser returned to the same role, and that selecting the external browser action opened the listing in standalone Safari or Chrome. The local screenshots, Android recording, and test results are in `output/native-mobile-browser/evidence-2026-11-10.WAW1Np/visual-retest/`.
- Xcode built the arm64 iPhone device target without signing. The Android test APK built, passed lint, and verified with `apksigner`. Both artifacts contain the intended private HTTPS origin.
- A private server request was tying up the workspace while it repeatedly tokenized the same text. Reusing tokens preserved the results for 230 application assessments in a read-only comparison and shortened that comparison from 2.011 seconds to 0.170 seconds. All 39 targeted Python workflow, frontend contract and Tailscale tests passed.
- The restarted tailnet-only server serves the checked export. The workspace state endpoint responded in 0.737 seconds in the verification request. The prior web assets are retained with the local rollout receipt.
- Physical phone acceptance remains to be run. The iPhone requires a signing team in Xcode.
