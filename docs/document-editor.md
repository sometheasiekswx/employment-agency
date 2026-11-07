# In-page document editing

Applications offer **View / edit CV** and **View / edit cover letter**. A same-page dialog places a PDF preview beside the editor, stacking the panels on smaller screens. Standard documents use editable text blocks. Local custom LaTeX documents use source editing to retain their layout. The PDF preview fits one page at a time and offers zoom, selectable text, and download of the original bytes. Download the PDF if the inline preview fails or an unembedded font is unavailable on your device.

**Update preview** validates and renders without saving. **Save as new draft** creates an organised application version with rebuilt PDF, Word, text, LaTeX and unsent email attachments. The other document is copied unchanged. Originals, submission decisions and confirmed career facts remain untouched. Manual edits are recorded in evidence and need review; they do not become confirmed career facts. Closing with unsaved edits asks before discarding.

Changed source files or stale manifests block editing until reconciled. Page limits and existing file integrity checks still apply. Hosted edits use standard rendering, never execute LaTeX, and obey existing account isolation, mutation locks and pilot quotas. Each saved draft counts as another package. Preview and editor reads do not consume save quotas.

Verification: Python regression tests cover immutable submitted originals, preview purity, exact rebuilt email attachments and rejected invalid/stale inputs. The browser fixture exercises editing, preview, durable save, mobile widths and unsaved-close handling against local and hosted routes. Real Google-authenticated production editing requires an authenticated user session; fixture tests do not establish that production outcome.
