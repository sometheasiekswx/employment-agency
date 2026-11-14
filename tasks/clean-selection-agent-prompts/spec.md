# Clean selection, agent prompts and sidebar

Status: four product decisions and the final shared understanding confirmed by the owner on 15 November 2026. Build, test, review and source delivery are authorized. The coordinator owns this specification and plan. GPT-6.1 Sol agents own build, test, independent review and delivery.

## Outcome

Make Jobs and To apply easier to scan and operate while preserving Agency's established charcoal/light surfaces, typography, lavender accents, company grouping and role inspector. Keep reusable software in this repository and private career data in its separate workspace.

## Confirmed design

1. The company allowance remains **two roles per hiring employer**, not two employers across the workspace. On Jobs, replace an unavailable Apply later action with a quiet **2 selected** status when two distinct pending roles occupy that employer's allowance. Other causes retain accurate wording.
2. To apply starts in browse mode. One **Select** action enters selection mode, revealing small circular selection controls and a selected-count toolbar. Browse-mode cards have no selection checkbox or Select label. Role details remain available.
3. Every **Copy agent instructions** entry uses the same shared control and editable panel, including consistent icon, text, dimensions, placement treatment and focus behavior. The panel offers **Copy** and **Reset**. Edits belong to the current generated prompt, with no saved template preference. Jobs generates research instructions; To apply generates application instructions for its exact current scope.
4. The sidebar uses a compact active-profile summary, expandable profile details, and one understated row of role/application counts. Preserve the Agency mark, workspace identity, navigation and all useful profile information.

## Existing behavior and baseline

The running private installation contains the reviewed application-controls/company-logos implementation on top of public main at b6c3347204669e39370f6180e6d64659f4146b40. Its frozen source manifest and installed wheel were verified against the editable worktree. Preserve that implementation in an isolated prerequisite source change before this refinement; do not regress to the older public UI. The current [shared workflow](../../docs/agents.md#application-journey-in-the-local-sqlite-workspace) and [company allowance decision](../../docs/adr/0018-count-to-apply-choices-in-company-allowance.md) describe the existing contract. Historical delivery records stay in their original worktree; their machine-specific installation details are not public source artifacts.

Currently, every To apply card renders a native checkbox with a repeated Select label. Agent instructions share part of a component but copy immediately and only reveal a readonly textarea after clipboard failure. The sidebar renders the entire profile definition and oversized counts at rest. Pending admission blockers disable the Apply later control but leave it visually present.

## Acceptance criteria

### Selection

- In browse mode, To apply cards contain no bulk-selection control. Select is discoverable in the toolbar, keyboard accessible and usable on touch screens.
- Selection mode exposes a visually restrained circular indicator with native checkbox semantics, a visible focus indicator, and an adequately sized hit target. Checked state is conveyed by shape/check and accessible state, not color alone.
- Show the selection count and a clear way to clear the selection or leave selection mode. Leaving the mode clears the temporary selection so a hidden selection cannot silently scope instructions. Explain the all-pending scope when nothing is selected.
- Preserve selection across filtering/pagination while the mode remains active; count the actual selected role IDs. Existing stale-role, busy connected-start and workspace-switch protections continue to work. Selection is separate from the Apply later choice and grants no submission authority.
- The existing selected-role or all-pending handoff behavior remains exact across pages and filters; no silently dropped or substituted roles. Opening role details and removing a pending choice remain possible without accidentally toggling bulk selection.
- Keep the selection toolbar compact after optional connected-agent availability finishes loading. When that agent is unavailable, show a short disclosure for the existing setup details and per-role reasons. Ready Start controls, progress, actionable errors and retry remain available. This is progressive disclosure of existing diagnostics, not a change to execution permissions.

### Company capacity

- For an unsaved role whose employer has two distinct pending choices and no more-specific blocker, show **2 selected** in place of the Apply later button on the card and the equivalent inspector action. Use a quiet non-button status with an accessible explanation of the company scope.
- Source this state from the existing authoritative employer/vacancy allowance. Do not infer employer equivalence from display text or count raw listings, since aliases and equivalent listings can duplicate a vacancy.
- Mixed submitted/pending/held capacity uses an accurate short status such as **No slots left**, while cooldown, overflow, uncertainty and unresolved employer identity keep their specific explanations and resolution paths. Never label two occupied slots as two selections unless that is true.
- Removing a pending choice makes an eligible Jobs action available after the shared state refresh. Keep backend enforcement, stale-UI conflict handling, permitted removals and historical records unchanged.

### Editable instructions

- A shared entry button opens an editable prompt panel instead of copying immediately. Both Jobs and To apply use the same visible button label and panel structure; contextual scope appears consistently as supporting text.
- Generate instructions through the existing handoff APIs. Preserve exact workspace identity, selected job IDs or the all-pending snapshot, the current research profile, backend blockers and capability gating. Application instructions retain their existing profile-neutral contract; this refinement does not add application profile authority. No employer-facing operation occurs by opening, editing, resetting or copying a prompt.
- Copy uses the textarea's current edited value exactly. Reset restores the generated prompt for this context. Clipboard failure leaves the edited text visible, selectable and recoverable, with durable feedback. Empty text cannot produce a misleading successful copy.
- Retain edits while the panel is open in the same context. When the workspace, profile, selected role set or relevant all-pending scope changes, invalidate the old prompt and stale asynchronous response. Make the refresh/close explicit rather than silently overwriting user text. Closing and reopening generates a fresh prompt.
- Loading, failed generation, blockers and retry remain usable. Do not show an editable application prompt when the backend refused its scope. Preserve existing stale-workspace checks and role-resolution actions.
- Use the current control/dialog primitives; keyboard navigation, Escape/close, focus restoration, long prompts and mobile layouts must work. Apply the shared treatment to every existing Copy agent instructions entry; unrelated downloadable handoff files retain their semantics.

### Sidebar

- The default rail has a small profile label/name, a clear details disclosure and compact real counts. Long profile names and role-family values wrap readably without creating a competing heading or wide right-aligned text column.
- Expanded details retain role family, locations, work arrangement and seniority with truthful empty values. Native disclosure semantics and keyboard use work; detail expansion must not obscure navigation or the workspace controls.
- Preserve the existing small-screen header/navigation behavior. Check dark and light themes, narrow and wide desktop rails, short-height screens, zoomed text, empty profiles and long values. Avoid horizontal overflow.

## Design evidence

- [Apple: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) recommends progressive disclosure to keep layouts cleaner. Apply this to sidebar profile details and contextual selection controls.
- [Apple: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) describes explicit edit mode for touch selection. Adapt that familiar pattern to the existing web cards while retaining native semantics.
- [Carbon: Data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) separates default and batch-action toolbars and makes selected-item count explicit. Borrow the interaction hierarchy without adopting Carbon's table styling or adding its library.

The design lead is Impeccable in Operate mode. This is a focused refinement of the accepted Agency identity, not a new visual system. Existing React 19 / Next 16, Lucide, Motion and CSS controls are sufficient; no generator or new component dependency is needed.

## Scope and delivery

No job research, application submission, new logo backfill, career-fact edits, company-policy changes, persistent prompt templates or schema migration is requested. The user authorized fixing in-scope issues and pushing shared source to main. That push triggers the established public-demo pipeline, which must be followed through to its actual result. The separate private installed app is pinned; do not upgrade or restart it without explicit upgrade authorization and the existing backup/restore checks.

Use fictional fixtures for tests, screenshots and public records. Preserve all existing worktree edits and private snapshots. Public delivery must include only intentional reusable source and appropriate documentation, with a public-data audit of the unpublished prerequisite.

See the [implementation plan](plan.md), [verification](verification.md), and [delivery record](delivery.md). Verification used browser emulation.
