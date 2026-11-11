# Public demo listings and draft preparation

The public demo lets a visitor see the owner’s name and redacted résumé, browse employer postings and try the draft workflow with their own résumé. It runs as a static site without signing in. Preloaded application decisions are examples. [Architecture decision](../../docs/adr/0013-public-showcase-listings-and-tab-local-drafts.md)

## Listings and application queues

- Add five employer listings in Singapore and four in Melbourne. Add five each in New York, London and China. Preserve the exact city on each Chinese listing.
- Show a View listing link on employer cards and the employer’s careers link in details. Read current postings when opening the demo. Show a dated snapshot when a feed is unavailable. Keep saved or removed listings accessible when their feeds no longer return them.
- Add examples to Saved, Active, Submitted and Removed. Mark preloaded application decisions and documents as examples. Keep their review and document flows available.
- Use the documented public SmartRecruiters Posting API with configured employer boards. The careers board provides a way to see other openings when a vacancy closes. [Posting API endpoints](https://developers.smartrecruiters.com/docs/endpoints)

## Résumé and drafts

- Read a text-based PDF, DOCX or plain-text résumé in the browser. Provide a review step for extracted text and clear feedback for empty, unreadable or unsupported files.
- Use the reviewed text and the selected listing to prepare an editable CV and cover letter. Keep the visitor’s information separate from the sample profile and preserve factual claims from the supplied résumé. Show the new draft under Active and provide Word and PDF downloads.
- Use the owner’s rendered LaTeX résumé as the default résumé. Remove the direct contact block and sensitive personal information before packaging its PDF and text. Keep the original LaTeX out of Git and out of the public artifact.
- Use the same approved PDF and redacted text for every sample CV, including History and email attachments. Use the owner’s name and approved evidence in the sample cover letters and supporting files. Label example submission records and cover letters “Sample submission” and state that no application was sent.
- Keep the visitor’s résumé and drafts in the current tab. Reloading or closing clears both. Explain this before the file is selected. Downloads are saved by the visitor.
- Explain that the demo can prepare and review drafts. The local app supplies local workspace storage, custom templates and the complete application workflow. The demo does not send applications or make AI requests.

## Verification

Test location counts, real and fallback links, existing example decisions, and the résumé-to-Active workflow in the production static build. Use fictional résumé files and a controlled feed response. Verify that résumé and draft content never enters requests, local storage, the public fixture or the URL. Cover unavailable feeds, unparseable files and reload.
