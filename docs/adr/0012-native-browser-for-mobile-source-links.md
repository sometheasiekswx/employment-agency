---
status: accepted
---
# Open mobile source links in the system's in-app browser

The installed mobile app opens listing and company sites as full web pages in Safari View Controller on iPhone and a Custom Tab on Android. This avoids the framing restrictions of the web app's source preview and lets users return to the same job when they close the browser. Each build has one configured workspace HTTPS origin. Initial distribution is through local device builds.

The wrapper keeps the workspace open in an origin-restricted web view and hands deliberate external navigations to the system browser. The workspace stays on the existing server and retains its access controls. The [source preview decision](0011-mobile-source-viewer-and-desktop-links.md) continues to govern visits through regular mobile and desktop browsers.
