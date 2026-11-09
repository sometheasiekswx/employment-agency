# Native mobile browsing

See [ADR 0012](../../docs/adr/0012-native-browser-for-mobile-source-links.md).

- An installed iPhone or Android build opens Opportunities on its configured workspace HTTPS origin. It uses the existing web interface, session and Tailscale access controls.
- Tapping a listing, company or advert link opens the original website inside the installed app with browser controls, including a way to continue in Safari or the Android browser. Sites that deny framing can render as full pages. The website still controls login, access and availability.
- Closing the browser returns to the selected job and preserves the workspace's current view. Reopening a link uses the system browser's normal loading and caching behavior.
- Desktop links keep opening a new tab. Regular mobile browsers continue to show the existing source preview.
- The workspace view accepts only its configured HTTPS origin for full-page navigation. A deliberate HTTPS link activation can open another origin in the browser view. Arbitrary redirects, untrusted schemes and certificate failures do not bypass the boundary. No native script bridge, proxy, or new backend credentials are required.
- An unreachable workspace has a clear retry path. The checked-in source contains no owner's Tailscale address or career data. The build host supplies the address locally.
- Deliver an Android test APK and an Xcode project for iPhone device testing. Signing and physical-device acceptance are distinct from simulator/emulator verification. Store distribution is out of scope.

Verify both native browser handoffs with fictional job data and a source that rejects framing. Check desktop and ordinary mobile browser behavior against the same frontend build.
