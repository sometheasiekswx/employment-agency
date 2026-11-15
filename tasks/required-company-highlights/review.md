# Review: required company highlights

During the 15 November 2026 local candidate review, the coordinating agent reviewed the captured candidate change against `11e8ef18d61decb86297d51b2a3b5a5f09887cee`, the agreed [spec](spec.md), affected service/CLI/HTTP callers, Discover rendering, agent guidance and verification evidence. No remaining blocking findings were identified for that candidate. Later concurrent opportunity-board edits in the shared working tree are outside this review; see [delivery.md](delivery.md).

- One review calculation governs saved-pair validity, board review status and completion. It uses full current employer inventory and keeps the existing private comparison record and fresh-basis fingerprint. Missing or stale reviews cannot produce a successful completion response.
- Completion requires an explicit current workspace, profile and distinct checked job IDs. It checks all represented companies, including those outside the presentation cap, and cannot be bypassed by supplying only two known roles. Unrelated company reviews do not block. Uncertain employer links and checked listing availability produce explicit blockers.
- Posting identities are grouped transitively. Review during implementation found that a submitted posting could leave a downstream duplicate eligible; the final implementation excludes the connected vacancy, and its regression test passes.
- The board uses server-derived full-inventory status rather than counting filtered cards. It keeps current highlights, other roles, selected-profile behavior and the separate application views. New text is rendered as React text in the existing design.
- HTTP completion uses existing origin/token protection. The API returns actionable structured refusal data, and the CLI returns it with a nonzero status. Neither path writes application decisions, holds or documents.
- The public source contains generic documentation and fictional fixtures. Private backup/recovery checks ran outside the repositories. No schema change, new dependency, automatic ranking worker or host-wide stopping hook was added.

The completion operation governs the shared workflow; it cannot prevent an external agent from writing a claim without calling the app. Agents are explicitly instructed to require a successful completion result and to report incomplete coverage and blockers otherwise. The validator checks provenance and current inputs; the agent remains responsible for reasoning accurately from the cited facts.

See [verification.md](verification.md) for actual local checks and platform limits, and [delivery.md](delivery.md) for the candidate and release boundary.
