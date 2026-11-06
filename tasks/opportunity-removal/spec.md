# Quick opportunity removal

Confirmed through the documented interview on 7 November 2026. See [domain terms](../../GLOSSARY.md) and [ADR 0007](../../docs/adr/0007-reversible-opportunity-removal.md).

## Outcome

Quickly remove unwanted roles while continuing assessment. Removal is reversible and independent of application decisions. Preserve the approved charcoal/lavender design, typography, card proportions, native dialogs and mobile sheet gestures.

## Acceptance

- Dedicated accessible Remove controls on cards and in details immediately hide a role from Recommended, All roles and Saved across profiles. Existing applications remain in Applications and History; files and statuses never change. Rediscovery/reimport preserves removal decisions.
- A persistent Removed filter provides Restore and Add reason access without an expiring recovery deadline. Restoring preserves the existing bookmark.
- Removing the selected role advances to the next visible role at the current sheet size, falling back to the previous role at the end. Removing the last role closes details and leaves feedback accessible. Preserve shortlist position, keyboard focus, Back/Escape and actual document-draft guards.
- Feedback offers Undo and Add reason without stealing focus. It is reachable in the active native dialog on mobile. Rapid removals keep each operation bound to its exact job/removal event; recovery remains available in Removed.
- The optional reason editor uses explicit Save reason. Retain unfinished text while browsing and changing selections, without registering it with the global unsaved-document guard. Failed reason saves keep the text and offer Retry; they never reverse a successful removal. Saved reasons can be edited later.
- Failed removal/restore rolls back only that operation, keeps other successful operations intact and offers an actionable retry. A successful mutation followed by a failed state refresh is not reported as an undone mutation.
- The fictional static demo supports browser-local removal, restoration and reasons, with no server mutations or external API requests. Local and hosted workspaces persist their own decisions privately.
- No permanent deletion, bulk removal, swipe-to-remove, automatic matching/preference learning, external submissions, new dependencies or private workspace changes.

## Contract

Jobs optionally contain `removals: JobRemoval[]`. Each event has a client-generated 32-character hex `id`, `at`, `reason`, optional `reason_updated_at` and optional `restored_at`. The last event without `restored_at` is the active removal. Restoring marks the event rather than discarding its reason/history.

`remove-job {id, removal_id}`, `restore-job {id, removal_id}` and `job-removal-reason {id, removal_id, comment}` return `{id, removals}`. Mutations validate identifiers/text, support safe duplicate requests, prevent stale Undo from restoring a newer removal and preserve all application records. Reasons are optional plain text up to 4000 characters. Removal metadata does not invalidate ranking caches or trigger per-keystroke requests.

## Verification and boundary

Use disposable fictional local and public-preview fixtures, meaningful service/transport/UI tests, existing frontend lint/types/static builds, Playwright desktop/mobile/keyboard/error/reduced-motion checks and an independent review. No testing mutations target the private career workspace. Auto enables release readiness; this feature has no new commit/push/deployment instruction.
