---
status: accepted
---
# Try live job listing previews in private workspaces

The owner chose to try showing the original listing inside the app when a job link is tapped. Keep recorded listing details available in the same preview and let the user open the original in a separate tab. This lets sites that support framing show their actual page and gives the user somewhere to read when a site blocks framing or needs active browser features.

Scope external framing to an isolated document and sandbox the listing. The destination receives a browser request after the user's click. The public showcase uses its fictional saved data. Company links follow [ADR 0009](0009-preview-opportunity-links-from-workspace-data.md).

[ADR 0011](0011-mobile-source-viewer-and-desktop-links.md) supersedes the link behavior for mobile and desktop.
