# Unified Removed section

Agreed on 7 November 2026. See [ADR 0008](../../docs/adr/0008-unified-removed-section.md).

- Both role and application entry points use the same reversible removal. Removed includes roles without applications and exposes saved Documents, Activity and versions for roles with applications.
- Removed roles leave browsing and the normal Active and Submitted lists. Restore preserves existing bookmarks and application status. Current legacy rejections restore as drafts, with the earlier decision retained. Submitted snapshots and their files stay intact.
- Existing Removed and Rejected bookmarks open the shared section. Removal, Undo, optional reasons, retry, selection advance, focus and dirty-form protection use the established workflow.
- Verify existing and legacy records in isolated local and hosted fixtures, browser-local behavior in the public preview, and desktop/mobile navigation, restoration and document access. Complete local release checks before handing off.

The isolated release candidate passed 178 Python tests, 325 frontend tests, lint, type checking, both static builds and installed package checks. Desktop and mobile browser checks covered removal, Undo, reasons, retries and restoration with fictional data. The submitted PDF matched byte for byte after restoration. The old Rejected bookmark opened Removed and restored the application to Active as a draft.
