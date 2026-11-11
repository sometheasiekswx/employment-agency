---
status: accepted
---
# Use an in-app source viewer on mobile

The owner wants fast access to job and company websites on iPhone and Android while keeping the selected role open. A normal link activation in a touch-first browser opens a full-screen source preview, with the website loaded on demand in the existing read-only sandbox. The same view provides saved details, Done, and Open in new tab. Other browsers follow the original URL in a separate tab.

External sites control whether they can appear in a frame. The viewer opens on saved details while trying the live site in the background. Show website reveals the embedded page and Saved details returns to the recorded information. Opening a separate tab remains the user's choice. The viewer keeps up to two recently opened frames alive on the current workspace page, so reopening a retained preview can reuse the document. This delivers the in-app interaction with the existing web app and avoids a proxy for third-party pages. [Browser embedding rules](https://www.w3.org/TR/CSP3/#directive-frame-ancestors)

This supersedes the link behavior in [ADR 0009](0009-preview-opportunity-links-from-workspace-data.md) and [ADR 0010](0010-try-live-job-listing-previews.md). The exact-host isolation and fictional public showcase constraints continue to apply.

The public demo opens employer websites directly in the same tab on mobile. Its listing and careers providers block framing. Back returns to the selected role or results. In the installed app, [the system browser opens over the workspace](0012-native-browser-for-mobile-source-links.md).
