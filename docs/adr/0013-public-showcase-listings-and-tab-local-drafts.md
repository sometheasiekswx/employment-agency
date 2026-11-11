---
status: accepted
---
# Use public employer listings and tab-local drafts in the showcase

The public showcase reads published employer postings. Each employer card links to the original advert and the details link to the employer’s careers board. Listings can close, so the demo checks for current postings and dates any fallback snapshot. Example documents and application decisions are explicitly simulated.

The static site reads visitors’ résumés and prepares editable CV and cover-letter drafts with Word and PDF downloads. Uploaded résumé contents and draft state live in the current tab and clear on reload or close. This supports the draft workflow without account storage or a preparation service.

The owner chose to appear as the public demo’s workspace owner and make their master résumé visible to all visitors. Use the approved rendered PDF and its text for the profile, résumé link, and default draft source. Derive profile evidence only from the redacted text. Keep the source LaTeX and other private workspace files outside the public build. Development fixtures can use a fictional candidate. Deployment still follows [ADR 0006](0006-automatic-public-demo-releases.md).
