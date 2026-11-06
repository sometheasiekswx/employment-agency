---
name: "Employment Agency"
description: "Concept A: a charcoal opportunity workspace with a contextual rail, lavender selection and review in place."
colors:
  ink: "#f0f0f3"
  muted: "#aaaab3"
  faint: "#96969f"
  line: "#393a40"
  paper: "#1e1f21"
  surface: "#26272a"
  rail: "#171819"
  accent: "#c994f3"
  accent-soft: "#302736"
  secondary: "#303136"
  secondary-hover: "#3a3b42"
  positive-bg: "#203b32"
  positive-ink: "#8dd6b5"
  negative-bg: "#41272c"
  negative-ink: "#ffadb9"
  link: "#d7aaf8"
  error: "#ffadb9"
  warning: "#efc181"
  field-border: "#71737d"
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

The user selected Concept A and its second revision: the Orax-inspired location board, with opportunity review in a docked inspector on desktop and an expandable sheet on phones. This replaces the former white and sky-blue visual direction. The application remains a private, evidence-led tool: the design does not change submission authority, document integrity or the local/hosted boundary.

The visual language is a near-black contextual sidebar, a charcoal workspace, subtly raised cards, restrained lavender selection and a pink-to-lavender primary action. The mark is a rounded employment briefcase containing a person; the visible wordmark is **Agency**, while metadata retains **Employment Agency**. Keep the supplied SVG proportions and colours. Do not restore the O mark or use decorative project-management metrics.

## Colour and type

The frontmatter and CSS variables are the shared values. Most of the interface uses neutral surfaces and off-white text. Lavender identifies selected navigation, tabs and cards. The gradient is confined to the employment mark and primary actions; primary-action text is dark for contrast. Green identifies confirmed evidence and reviewed badges; the interactive review toggle retains lavender for its selected state. Amber highlights requirements to check and red identifies rejection or errors. Recording a confirmed submission uses a green action with dark text, while its saved Submitted badge stays neutral and explicitly labelled. A numeric score or progress bar must represent real, explained data.

Inter is self-hosted at weights 400, 500, 600 and 700, with its SIL Open Font License included in `frontend/public/licenses/Inter-OFL.txt`. Body text is 14px, labels 13px and decision-relevant metadata at least 12px where space permits. Use regular or medium weight for role titles and compact controls; reserve 600 for page headings and important actions. Heading tracking stops at -0.035em. Counts and record metadata use tabular numerals.

## Composition and navigation

At desktop sizes the rail is 272px wide. It carries the brand, the selected profile's actual role/location/arrangement/seniority preferences, the real number of stored opportunities, five navigation destinations and workspace identity. All counts come from runtime state. Do not copy illustrative candidate names, salaries, employers or location counts from the design source into production.

The desktop workspace has 24px side padding and an 81px top bar with functional role search and one useful navigation action. The sidebar marks the current view, so the header does not repeat a breadcrumb. Discover groups opportunities by location in a compact grid: later cities fill space beneath shorter groups while each city's cards stay together. Measured row spans respond to content and width changes, preserving source priority and keyboard order without waiting for the tallest city to finish. Tracks have a 17rem readable minimum and location groups a 24rem maximum, so a single filtered location remains left aligned. With the desktop inspector open, the shortlist scrolls vertically and retains the same location order. The inspector grows smoothly from 350px to 430px only as space permits; its evidence scrolls independently of persistent actions. Existing application forms, versioned documents, editor and submission previews retain their behaviour.

Discover keeps one visible profile selector and one result count. Cards show the role, employer, decision status, distinct location or work model and disclosed pay. Missing salary, evidence, retrieval dates and eligibility checks belong in the opportunity inspector. Omit repeated city labels, generic ranking explanations, promotional sidebar copy and repeated instructions to open a role. Keep useful warnings and all review and submission controls intact.

Below 900px the rail becomes a compact header. A fixed bottom dock exposes Opportunities, Profile, History and Settings. The header menu includes all five destinations, including Search preferences and History. The dock and content observe the bottom safe area. Discover review uses a modal sheet with collapse/expand and close controls, preserved shortlist position and restored focus. Other pages retain readable stacked content. Long text and 200% text resizing must not create page-wide horizontal overflow.

Opportunity review changes to the existing modal sheet at 1000px, before the rail collapses, because narrower desktop windows cannot fit a readable shortlist beside a detail panel. Between 901px and 1000px the sheet is bounded to 36rem at the right edge; phones retain the full-width sheet.

## Unified Opportunities workspace

The approved consolidation brings discovery and application management into one Opportunities destination. Recommended, All roles, Saved and Applications share the location board and selected role. Applications exposes Active, Submitted and Rejected queues from recorded applications independently of current matching, profiles or listing availability. Older application links redirect to their selected record in the shared workspace.

Overview preserves in-place evidence assessment. Documents and Activity expand into a workbench beside the board on desktop and a full-screen native dialog on mobile. Switching panels retains comment drafts. Documents identifies every preserved version with its status and date, with access to original versions and History. Saving an edit selects the returned new draft without losing role, view, filters or document context. Native confirmation, cancellation, submission safeguards, immutable submitted snapshots and unsaved-edit protection remain authoritative.

## Components and states

Cards use 12–16px corners and restrained elevation. Dividers separate related information; avoid adding a bordered card around every text group. Fields use dark opaque fills and visible boundaries. Neutral controls use quiet outlines or charcoal fills; a page's main useful action receives the gradient. All essential actions have visible labels or accessible names, usable pointer targets and a lavender keyboard-focus outline.

Preserve existing setup, loading, empty, permission, local/hosted, fictional-demo, success and error states. Unknown career evidence and work eligibility remain explicit. Save, review and draft actions never imply employer submission. The real source advert and exact document versions remain findable.

The document editor remains a native modal dialog with contained scrolling, correct cancellation and restored focus. Its PDF pages retain a light document background inside the dark chrome. Application sending continues through its separate approval process.

## Motion and accessibility

The existing React Bits Dock adaptation animates icons while keeping link rectangles and labels stable. Its motion is suppressed for reduced-motion and coarse-pointer users. Opportunity review adds an expressive arrival from the shortlist: a spring-driven desktop inspector and mobile sheet, quicker dismissal, and a short content transition when pointer users select another opportunity. Mobile expansion uses a bounded content-continuity cue while the native sheet reaches its final height immediately, keeping persistent actions reachable. Repeated keyboard navigation remains immediate.

Bookmark icons acknowledge confirmed changes without changing button geometry. Existing success and error live regions remain in place and announce immediately; save feedback has a short upward reveal and errors use opacity without a shake. Replaced feedback cancels previous motion. Reduced-motion preferences are observed live in JavaScript and CSS, with static final states. Entry, exit and expansion motion must cancel on reversal, preference changes, keyboard input or unmount. No delayed animation may close a newly selected opportunity.

Verify text contrast on actual surfaces, visible focus, keyboard navigation, modal/sheet behaviour, responsive layouts and long real content. The global dark colour scheme covers native inputs, selection, scrollbars and loading/error screens. Increased-contrast preferences strengthen supporting text and boundaries. Do not infer accessibility conformance from a screenshot alone.

## Source authority

The approved [Concept A revision](https://www.figma.com/design/4Y26Y8OlPdYFi0ooL7ORjl?node-id=11-2), its authored source, local PNGs and employment SVG supplied during design are the authority for this implementation. Figma context, screenshot, variables and library requests were quota-blocked when implementation began. Native component and Code Connect mappings could not be verified. That fallback does not authorize changes to the private installed workspace or replace browser verification of the implemented application.

## Behaviour beyond the concept

Discover uses the existing read-only, evidence-led matching operation for the selected search profile. Opening the page does not fetch employer sites, call a paid AI provider, prepare documents or submit an application. The header search filters imported opportunities; Add opportunities opens the existing search and import tools. Previous and Next follow the current filtered result order across locations. Saved is a persistent workspace bookmark, independent of application decisions.

On phones the default sheet leaves the shortlist visible, with an explicit expansion control for fuller assessment. Escape and Close restore focus to the current opportunity; desktop review stays nonmodal. Errors must remain visible inside an open modal. Existing application packages link to their actual review or submitted records; a historical submission flag alone never proves which document bytes were sent. Preparing a draft is an explicit user action and retains existing eligibility checks.
