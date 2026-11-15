# Native mobile app

The iOS and Android shells load one Employment Agency origin at `/discover/`. Listing and company links open in Safari View Controller or Android Custom Tabs. Close the browser to return to the role. The server needs a web build with native browser handoff support. [ADR 0012](../docs/adr/0012-native-browser-for-mobile-source-links.md)

The compact **A.** launcher icon lives in the [iOS app icon catalog](ios/Sources/Assets.xcassets/AppIcon.appiconset) and the [Android resources](android/app/src/main/res). The system selects the iOS default, dark or tinted artwork and applies the Android adaptive shape and optional themed color.

Build with the HTTPS origin that serves the workspace. Use the origin alone, with no route, credentials, query or fragment. For a private Mac workspace, connect the phone through Tailscale using the allowed account and keep the Mac server running. Build again to change the server origin. [Private Tailscale setup](../docs/tailscale.md)

## iPhone

The project targets iOS 17.0 or later.

1. Open [EmploymentAgency.xcodeproj](ios/EmploymentAgency.xcodeproj) in Xcode.
2. Set the workspace origin in the ignored `ios/Config/Workspace.local.xcconfig` file. Use the following syntax so Xcode preserves both slashes.

   ```xcconfig
   EA_WORKSPACE_ORIGIN = https:/$()/workspace.example.ts.net
   ```

3. Select the EmploymentAgency target. Under Signing & Capabilities, choose your team and use automatic signing. Connect the iPhone, select it as the run destination, and choose Run. Approve Developer Mode on the phone if prompted. [Apple's personal device setup](https://developer.apple.com/help/account/basics/about-your-developer-account/).

A command-line build can supply `EA_WORKSPACE_ORIGIN=https://workspace.example.ts.net` as an Xcode build setting. The project was generated with [XcodeGen 2.46.0](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0) from `ios/project.yml`. Regenerate it with `xcodegen generate --spec mobile/ios/project.yml` from the repository root when changing targets or adding source files.

To run the public demo in the installed app, set `EA_WORKSPACE_ORIGIN=https://employment-agency-demo.vercel.app` at build time. Use **View listing** in Jobs, or open a role and follow its title or company link inside the details. Tap **Done** to return to the workspace.

## Android

Open `mobile/android` in Android Studio or build with the Gradle wrapper. The project compiles against Android SDK 37, requires Android 8.0/API 26 or later on the device and uses JDK 17 or newer for the build. From the repository root:

```sh
EA_WORKSPACE_ORIGIN=https://workspace.example.ts.net \
  ./mobile/android/gradlew -p mobile/android assembleDebug
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Use a connected Android test device with USB debugging enabled. The `eaWorkspaceOrigin` Gradle property takes precedence over `EA_WORKSPACE_ORIGIN`. The project uses Android views for the workspace shell and AndroidX Browser for Custom Tabs. It was started with the official [Android CLI Empty Activity template](https://developer.android.com/tools/agents/android-cli/commands/create).

When the phone has no browser available for Custom Tabs, the app asks before opening the website separately.

## Verify with fictional data

Use the [normal frontend build](../README.md#set-up-once) and start the disposable fixture from the repository root:

```sh
PYTHONPATH=. .venv/bin/python tests/serve_concept_fixture.py \
  --port 8876 --frontend-build frontend/out --native-browser-sources
```

Build the app in Debug with `EA_WORKSPACE_ORIGIN=http://127.0.0.1:8876`. For iOS, choose a simulator and run the EmploymentAgency scheme's UI test. For Android, use `adb reverse tcp:8876 tcp:8876` with the selected emulator before launching the installed debug build. Open the Cloud Software Engineer role, tap the title and company links inside its details, and close each Custom Tab. The app should return to the same role. These native checks open the real IANA and GitHub pages referenced by the fictional role and require internet access.

The desktop and ordinary mobile browser checks are in `tests/discover-browser.cjs` and `tests/source-links-browser.cjs`.
