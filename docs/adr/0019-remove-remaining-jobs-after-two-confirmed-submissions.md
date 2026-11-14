---
status: accepted
---
# Remove remaining Jobs after two confirmed submissions

On 15 November 2026, the owner chose to move remaining Jobs at a verified hiring employer into Removed after two distinct confirmed submissions in its current round, using the same rule for manual and agent-recorded submissions. This extends the round/cooldown policy in [ADR 0015](0015-use-active-cooldowns-for-company-research.md) without changing the protection of pending To apply choices in [ADR 0018](0018-count-to-apply-choices-in-company-allowance.md).

Removal keeps the listing, every attached draft/version and its activity, and protects submitted equivalents and active or uncertain work. It keeps older unchosen vacancies out of the browsing list in exchange for requiring explicit Restore even after the cooldown expires. Neither expiry nor a history correction silently repopulates Jobs. Two pending choices only change visual density; they do not trigger removal. Existing qualifying active rounds are handled by an explicit preview/apply operation during the authorized rollout, not a side effect of reading or restoring a workspace. The [follow-up specification](../../tasks/clean-selection-agent-prompts/jobs-capacity-follow-up.md) defines the threshold, scope and verification.

A genuine submission recorded after an automatic cleanup takes precedence in the displayed queue, so it remains visible under Submitted. The original cleanup event stays intact and becomes effective again if that confirmation is corrected. Manual removal precedence is unchanged.
