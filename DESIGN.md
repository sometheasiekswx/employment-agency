---
name: "Employment Agency"
description: "Agency's light and charcoal opportunity workspace with a contextual rail, lavender selection and review in place."
colors:
  ink: "#f1eff4"
  muted: "#b6b1bf"
  faint: "#a09ba9"
  line: "#3c3a44"
  paper: "#1e1f21"
  surface: "#26272b"
  rail: "#171819"
  accent: "#c994f3"
  accent-soft: "#342b3e"
  secondary: "#303137"
  secondary-hover: "#3a3a43"
  positive-bg: "#233b32"
  positive-ink: "#a0e0c2"
  negative-bg: "#422b31"
  negative-ink: "#ffc0c8"
  link: "#e1b9fa"
  error: "#ffc0c8"
  warning: "#f0c785"
  field-border: "#787381"
typography:
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  metadata:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  badge: "5px"
  field: "8px"
  button: "8px"
  navigation: "10px"
  surface: "14px"
  dialog: "16px"
spacing:
  compact: "0.5rem"
  control: "0.75rem"
  base: "1rem"
  group: "1.25rem"
  panel: "1.5rem"
---

# Design System: Employment Agency

## Approved direction

The user selected the second revision of Concept A, an Orax-inspired workspace with a docked inspector on desktop and an expandable sheet on phones. The app keeps role review and document history together, with the user controlling submission.

The visual language uses a contextual rail, raised cards, restrained lavender selection and a lilac primary action. Dark uses charcoal surfaces. Light uses a cool paper canvas with white working surfaces and deeper violet text and actions.

## Brand

**Employment Agency** is the product name. The Industrial Precision **Agency.** wordmark identifies the desktop rail, mobile header and README. The compact **A.** identifies browser tabs, pinned tabs, installed websites and the native apps. Both marks use the kit's outlined letterforms and square punctuation.

Use [the light-surface wordmark](frontend/public/agency-header-on-light.svg) on light surfaces and [the dark-surface wordmark](frontend/public/agency-header-on-dark.svg) on dark surfaces. The app uses the resolved theme and the README follows the viewer's color scheme. Keep the full wordmark at about 160 CSS px or wider, with the clear space, colors and proportions supplied in the SVG.

The [web manifest](frontend/public/agency.webmanifest) selects the installed-site icons. [Root layout metadata](frontend/src/app/layout.tsx) selects the favicon, Safari mask and iOS touch icon. The [native asset catalogs](mobile/README.md) own the iOS default, dark and tinted icons and the Android adaptive and monochrome launcher artwork. Platform renderers apply their own icon masks.

## Appearance

The desktop rail footer and the phone and tablet header each show a single theme button. Its moon, sun or monitor icon indicates the current preference. The button and its tooltip name the current and next theme. Activating it cycles through Dark, Light and System and briefly confirms the new preference. **Settings → Appearance** also shows the current preference. Dark is the default. System follows changes to the device setting while the app is open. The choice belongs to the browser, so each device can keep its own setting. The root applies the saved appearance before the app loads. Document pages keep their own paper surface.

## Colour and type

The frontmatter describes the default palette. The shared CSS variables define both palettes, including text, fields, borders, focus, selection and feedback. Lavender identifies selected navigation, tabs and cards. The gradient is confined to primary actions. Green identifies confirmed evidence and reviewed badges. Amber highlights requirements to check and red identifies rejection or errors. Recording a confirmed submission uses a green action, while its saved Submitted badge stays neutral and explicitly labelled. A numeric score or progress bar must represent real, explained data.

Inter is self-hosted at weights 400, 500, 600 and 700, with its SIL Open Font License included in `frontend/public/licenses/Inter-OFL.txt`. Body text is 14px, labels 13px and decision-relevant metadata at least 12px where space permits. Board card titles use weight 600, and role details use a larger heading at weight 500. Heading tracking stops at -0.035em. Counts and record metadata use tabular numerals.

## Composition and navigation

At desktop sizes the rail is 272px wide. It carries the brand, the selected profile's actual role/location/arrangement/seniority preferences, the real number of stored opportunities, five navigation destinations and workspace identity. All counts come from runtime state. Do not copy illustrative candidate names, salaries, employers or location counts from the design source into production.

The desktop workspace has 24px side padding, Add opportunities in the top bar and role search above the board. Discover groups by hiring company across locations. Company sections fill a measured grid with a 17rem target minimum and a 24rem maximum on desktop. The location filter applies across company sections. The docked Overview inspector is 350–430px wide where space permits, with scrollable evidence and persistent actions.

Apply later and Remove preserve surviving companies' columns and role order during the current review. Gaps close within the affected column, and Undo restores the role's place. A deliberate change to the view, profile, filters, refresh or column count can reset placement.

Company headers and opened role details show the verified mark at its natural proportions on the current surface. Missing marks use initials. Full cards start with the title and place Remove above Apply later when both actions are available. Location, work model and status wrap below the title. Cards keep disclosed pay, evidence notes and substantive blockers. The generic work-rights and sponsorship reminder appears in opened details. The profile chooser remains in Filters.

At 900px and below the rail becomes a compact header. A left-aligned text navigation row sits beneath the Agency wordmark on phones and joins the wordmark and utilities in a single row on wider tablets. All five destinations stay visible, with shorter Profile and Search labels where space is tight. An inset lavender capsule in dark mode and violet capsule in light mode highlight the current destination. Links wrap at larger text sizes. Add opportunities appears beside the Opportunities title across viewports and in Workspace options on other compact screens. Workspace options also opens the active profile details. The header observes the top and side safe areas and scrolls with the page in short viewports. Discover review uses a modal sheet with collapse, expand and close controls, preserved shortlist position and restored focus. Other pages retain readable stacked content. Long text and 200% text resizing must not create page-wide horizontal overflow.

Opportunity review changes to the existing modal sheet at 1000px, before the rail collapses, because narrower desktop windows cannot fit a readable shortlist beside a detail panel. Between 901px and 1000px the sheet is bounded to 36rem at the right edge; phones retain the full-width sheet.

## Unified Opportunities workspace

Jobs, To apply and Applications share the company board and role workspace in Opportunities. Jobs shows available roles, reviewed company highlights and known mismatches. In the local app, a company section also flags when the selected profile needs a first or refreshed highlight review. Apply later moves a role to To apply, where it stays through preparation until submission. Applications exposes Active, Submitted and Removed independently of matching, profiles or listing availability. Legacy discovery, saved and agent-queue links preserve selected roles and versions when opening the corresponding view. [Company highlight workflow](docs/agents.md#research-five-companies)

Entering a role search searches all four sources, including earlier application queues and stored roles from paused employers. Source filters show matching counts. Explicit source labels distinguish each result; a role in both To apply and Applications has both labels on one card. Search reuses the company board and inspector without changing application decisions. Clearing the query restores the browsing view.

Overview preserves in-place evidence assessment. Documents and Activity expand into a workbench beside the board on desktop and a full-screen native dialog on mobile. Switching panels retains comment drafts. Documents identifies every preserved version with its status and date, with access to original versions and History. Saving an edit selects the returned new draft without losing role, view, filters or document context. Native confirmation, cancellation, submission safeguards, immutable submitted snapshots and unsaved-edit protection remain authoritative.

## Components and states

Cards use 12–16px corners and restrained elevation. Dividers separate related information; avoid adding a bordered card around every text group. Fields use dark opaque fills and visible boundaries. Neutral controls use quiet outlines or charcoal fills; a page's main useful action receives the gradient. All essential actions have visible labels or accessible names, usable pointer targets and a lavender keyboard-focus outline.

Preserve existing setup, loading, empty, permission, local/hosted, fictional-demo, success and error states. Unknown career evidence and work eligibility remain explicit. Save, review and draft actions never imply employer submission. The real source advert and exact document versions remain findable.

The document editor remains a native modal dialog with contained scrolling, correct cancellation and restored focus. Its PDF pages retain a light document background inside the dark chrome. Application sending continues through its separate approval process.

## Motion and accessibility

Workspace navigation and the three Opportunity views use the Classic motion from React Bits GooeyNav. Liquid leaves the previous selection in particles and gathers behind the destination. Each link or button keeps a fixed hit area. Reduced motion, forced colors and browsers without WebGL2 use a static selected pill. Opportunity review adds an expressive arrival from the shortlist: a spring-driven desktop inspector and mobile sheet, quicker dismissal, and a short content transition when pointer users select another opportunity. Mobile expansion uses a bounded content-continuity cue while the native sheet reaches its final height immediately, keeping persistent actions reachable. Repeated keyboard navigation remains immediate.

Bookmark icons acknowledge confirmed changes without changing button geometry. Existing success and error live regions remain in place and announce immediately; save feedback has a short upward reveal and errors use opacity without a shake. Replaced feedback cancels previous motion. Reduced-motion preferences are observed live in JavaScript and CSS, with static final states. Entry, exit and expansion motion must cancel on reversal, preference changes, keyboard input or unmount. No delayed animation may close a newly selected opportunity.

Verify text contrast on actual surfaces, visible focus, keyboard navigation, modal/sheet behaviour, responsive layouts and long real content. The global dark colour scheme covers native inputs, selection, scrollbars and loading/error screens. Increased-contrast preferences strengthen supporting text and boundaries. Do not infer accessibility conformance from a screenshot alone.

## Source authority

The approved [Concept A revision](https://www.figma.com/design/4Y26Y8OlPdYFi0ooL7ORjl?node-id=11-2) and its authored source define the workspace layout. The Industrial Precision logo kit approved on 16 November 2026 defines the current identity. [Asset provenance and rollout verification](tasks/agency-logo-rollout/verification.md)

## Behaviour beyond the concept

Discover uses read-only matching for the selected search profile. Search filters loaded opportunities, and Add opportunities opens the search and import tools. Previous and Next follow the current filtered board order across companies. To apply preserves one workspace choice per role. In the local app, Jobs can copy research instructions, and To apply can copy the pending queue handoff. Connected submission is available for supported roles and runtimes. [Application handoff](docs/apply-for-me.md)

On phones the default sheet leaves the shortlist visible, with an explicit expansion control for fuller assessment. Escape and Close restore focus to the current opportunity; desktop review stays nonmodal. Errors must remain visible inside an open modal. Existing application packages link to their actual review or submitted records; a historical submission flag alone never proves which document bytes were sent. Preparing a draft is an explicit user action and retains existing eligibility checks.
