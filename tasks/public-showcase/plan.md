# Public demo implementation plan

See the [specification](spec.md) and the [architecture decision](../../docs/adr/0013-public-showcase-listings-and-tab-local-drafts.md).

- [x] **Employer listings.** Verified nine employer feeds in Chrome and the requested counts across five destinations. The browser fixture covers an unavailable feed and a bookmarked posting that disappears from its board.
- [x] **Sample application queues.** Verified the seven sample packages and the Saved, Active, Submitted and Removed records. The local acceptance suite still uses the six-role fixture.
- [x] **Résumé and draft flow.** Chrome and mobile WebKit passed PDF, Word and plain-text imports, the editable CV and cover letter in Active, Word and PDF downloads, accessibility checks and tab isolation.
- [x] **Default résumé.** Reviewed the two-page rendered master. Verified the removal of the contact block, contact links and draft placeholders. The release input round-trip reproduced the PDF and text. The local preview served the exact reviewed PDF.
- [x] **Local release checks.** Passed 214 Python tests, 367 frontend tests, 110 release tests, type checking, lint, npm audit, both production builds, and the public, local and hosted browser checks. Verified the static security headers and both classes of PDF.
- [x] **Public profile and listing links.** The production browser checks verified the résumé owner on the landing page and Career profile, a visible link on employer cards, and the approved PDF as the default draft source.
- [x] **Public sample packages.** The production build and browser checks verified the approved PDF, redacted editable files and submission labels. The build output contains seven regenerated packages with matching History files and email attachments.
- [x] **Mobile employer links.** Use the existing new-tab links on the public demo. Chrome touch and mobile WebKit checks verified that the card link, job title, advert button and company link open the original page in a new tab and keep the demo tab on the same view.
- [ ] **Publish the public demo.** Set the approved résumé release inputs, push the release and verify the new revision at the live URL through the existing [deployment workflow](../../docs/public-demo-deployment.md).
