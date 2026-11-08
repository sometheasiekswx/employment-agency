# Saved roles and source previews

The owner confirmed the queue and link behavior on 8 November 2026. See the [glossary](../../GLOSSARY.md) and [source preview decision](../../docs/adr/0009-preview-opportunity-links-from-workspace-data.md).

- Save moves the role from All roles and Recommended into Saved. Saving keeps the current tab and any open details, even if its last card disappears. Unsave makes the role eligible for its previous browsing views and filters again. The existing application and removal rules still govern Applications and Removed.
- Save feedback follows the existing optimistic behavior and restores the previous list membership if the save fails. A disappearing card leaves keyboard focus on a usable control. Existing bookmark records and browser-local fictional bookmarks follow the new filtering rule.
- In opportunity details, a title with a usable listing URL and a company with a usable destination are links. The company destination prefers its recorded careers URL and falls back to the site of the stored listing URL. Names and titles without a usable destination appear as text. The existing View advert action opens the same listing preview.
- Normal activation opens an in-app preview of stored listing or company information. The preview identifies the destination and offers Open in new tab. Close and Escape return to the same details and restore focus to the link. The local browser fixture exercises fictional source destinations. Public showcase vacancies have plain titles because their snapshot carries no original listing URLs.
- The job form can record or clear an optional HTTPS careers URL. An import that omits it preserves a previously recorded value. Existing records need no migration. The app renders recorded text locally and performs external navigation when the user requests it.

Verify with the existing Python service tests, frontend tests, lint, TypeScript, static builds and browser suites. This task prepares the change for release.
