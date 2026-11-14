---
status: accepted
---
# Count To apply choices in the company allowance

On 14 November 2026, the owner required To apply membership itself to fit the hiring employer's remaining application slots. They chose this over keeping unlimited pending alternatives and checking capacity only when applying. The same allowance governs application actions from Jobs, To apply and Applications.

Retain the two-distinct-vacancy round and configurable cooldown in [ADR 0015](0015-use-active-cooldowns-for-company-research.md). Pending choices, confirmed submissions in the current round and active or uncertain submission holds share capacity, with a vacancy counted once as it progresses between those states. A draft outside To apply does not by itself use a slot. Removing a pending choice cannot release a slot still occupied by a submission or an active or uncertain attempt.

This constrains the pending list in exchange for preventing an application queue that already exceeds the company's allowance. Saving a role still grants no authority to contact an employer, upload documents or submit. Pending choices do not start or extend the cooldown; actual confirmed submission history continues to determine it.

Preserve older overflow and overflow revealed by a corrected employer match. Keep the records visible and block applying at that company until the user narrows the pending choices. A new To apply choice requires a reliably confirmed hiring employer; show focused confirmation when necessary. Neither path may guess an identity or silently select the first two roles.

The current operations and interactions are documented in the [shared application workflow](../agents.md#application-journey-in-the-local-sqlite-workspace). This record accepts the domain decision; it does not claim that the current software implements it.
