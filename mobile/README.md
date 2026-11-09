# Native mobile app

The iPhone and Android apps load one Employment Agency workspace over HTTPS. Links to listings and companies open in Safari View Controller or Android Custom Tabs. Close the browser to return to the same role. An updated workspace web build is needed for the direct handoff. See [ADR 0012](../docs/adr/0012-native-browser-for-mobile-source-links.md).

Build with the HTTPS origin that serves the workspace, without an app route or credentials. For a private Mac workspace, connect the phone to the same Tailscale account and keep the Mac server running. A different workspace requires a different build.

## iPhone

1. Open [EmploymentAgency.xcodeproj](ios/EmploymentAgency.xcodeproj) in Xcode.
2. Set the workspace origin in the ignored `ios/Config/Workspace.local.xcconfig` file. Use the following syntax so Xcode preserves both slashes.

   ```xcconfig
   EA_WORKSPACE_ORIGIN = https:/$()/workspace.example.ts.net
   ```

3. Select the EmploymentAgency target. Under Signing & Capabilities, choose your team and use automatic signing. Connect the iPhone, select it as the run destination, and choose Run. Approve Developer Mode on the phone if prompted. [Apple's personal device setup](https://developer.apple.com/help/account/basics/about-your-developer-account/).

A command-line build can supply `EA_WORKSPACE_ORIGIN=https://workspace.example.ts.net` as an Xcode build setting. The project was generated with [XcodeGen 2.46.0](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0) from `ios/project.yml`. Regenerate it with `xcodegen generate --spec mobile/ios/project.yml` from the repository root when changing targets or adding source files.

## Android

Open `mobile/android` in Android Studio or build with the Android SDK and Gradle wrapper. This project uses the Android 37 SDK and JDK 17 or newer. From the repository root:

```sh
EA_WORKSPACE_ORIGIN=https://workspace.example.ts.net \
  ./mobile/android/gradlew -p mobile/android assembleDebug
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Use a connected Android test device with USB debugging enabled. In Android Studio the same build property can be supplied as `eaWorkspaceOrigin` in the user's Gradle properties. The project was started with the official [Android CLI Empty Activity template](https://developer.android.com/tools/agents/android-cli/commands/create). It uses Android views for the workspace shell and AndroidX Browser for Custom Tabs.

When the phone has no browser available for Custom Tabs, the app asks before opening the website separately.

## Verify with fictional data

Build the web export, then start the disposable fixture:

```sh
PYTHONPATH=. .venv/bin/python tests/serve_concept_fixture.py \
  --port 8876 --frontend-build frontend/out --native-browser-sources
```

Use `http://127.0.0.1:8876` only in debug fixture builds. On Android, use `adb reverse tcp:8876 tcp:8876` for the selected emulator. On iOS, run the EmploymentAgency scheme's UI test with the fixture build setting. On Android, open the Cloud Software Engineer role, tap the title and company links, and close each Custom Tab. Both fixture sites send a header denying framing. The workspace should return to the role each time.

The desktop and ordinary mobile browser checks remain in `tests/discover-browser.cjs` and `tests/source-viewer-browser.cjs`.
