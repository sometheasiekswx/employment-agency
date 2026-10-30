---
name: Employment Agency
description: Calm document review with compact native controls.
colors:
  ink: "#202126"
  muted: "#62656d"
  line: "#dedfe4"
  paper: "#f5f5f7"
  surface: "#ffffff"
  accent: "#0063c7"
  accent-soft: "#eaf2ff"
  accent-hover: "#004f9f"
  error: "#b42332"
  warning: "#805000"
  secondary: "#f0f0f3"
  secondary-hover: "#e4e5eb"
  field-border: "#aeb1bb"
  focus: "#006bdb"
  status-neutral: "#eceef2"
  status-text: "#4c5059"
  submitted-bg: "#e6f3eb"
  submitted-text: "#1b6541"
  reviewed-text: "#0052a6"
  rejected-bg: "#fcecef"
  rejected-text: "#a32130"
  review-surface: "#fafafc"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  metadata:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  badge: "6px"
  field: "8px"
  button: "9px"
  navigation: "10px"
  surface: "14px"
  dialog: "16px"
spacing:
  compact: "0.5rem"
  control: "0.75rem"
  base: "1rem"
  group: "1.25rem"
  panel: "1.5rem"
  surface: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.6875rem 0.75rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "1.75rem"
  chip:
    backgroundColor: "{colors.status-neutral}"
    textColor: "{colors.status-text}"
    rounded: "{rounded.badge}"
    padding: "0.1875rem 0.5625rem"
  navigation:
    rounded: "{rounded.navigation}"
    padding: "0.375rem 0.625rem"
  filter-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.reviewed-text}"
    rounded: "{rounded.button}"
---
# Design System: Employment Agency

## Overview

**Creative North Star: "The Calm Document Workspace"**

A calm document workspace: cool near-white surroundings, graphite text and white work surfaces keep attention on evidence and the next review action. Native system typography and familiar grouped controls implement the confirmed Apple-inspired direction.

Density comes from compact navigation and coherent document groups, with a separate tinted decision area. Translucency belongs to functional navigation; restrained motion responds to pointer proximity without moving link targets.

**Key Characteristics:**

- Cool canvas and white document surfaces.
- One blue action accent with semantic status colors.
- Compact labelled navigation and persistent focus feedback.
- Responsive document groups with readable evidence.

## Colors

Cool neutrals support a single blue action accent; status colors carry explicit meaning.

### Primary

- **Action Blue** (`accent`): primary buttons, links, brand mark and field accents.
- **Selected Blue Wash** (`accent-soft`): active navigation and reviewed or selected states.
- **Deep Action Blue** (`accent-hover`): primary hover feedback.

### Secondary

- **Submitted Green** (`submitted-bg`, `submitted-text`): submitted status only.
- **Rejected Red** (`rejected-bg`, `rejected-text`): rejected status; `error` marks errors.
- **Warning Amber** (`warning`): caution text.

### Neutral

- **Graphite** (`ink`) and **Quiet Graphite** (`muted`): primary and supporting text.
- **Cool Paper** (`paper`), **Document White** (`surface`) and **Review Tint** (`review-surface`): canvas, content and decision areas.
- **Hairline** (`line`) and **Field Stroke** (`field-border`): dividers and editable boundaries.
- **Secondary Control** (`secondary`, `secondary-hover`): quieter actions.
- **Neutral Status** (`status-neutral`, `status-text`): default badges and compact metadata.

**The Action Blue Rule.** Use blue for actions, links and selected navigation; reserve green and red for explicit status or feedback.

## Typography

**Display and Body Font:** the platform system stack recorded in the frontmatter. This is a native task interface, with no separate decorative display face.

**Character:** compact, familiar and readable. Medium weights distinguish controls; slightly tightened headings organize work without promotional scale.

### Hierarchy

- **Headline:** page title; reduces to (1.75rem) below the compact breakpoint.
- **Title:** section heading; application titles use (1.375rem), while review headings use (0.875rem).
- **Body:** evidence and prose, with section paragraphs and fit summaries limited to (72ch); page descriptions use (65ch).
- **Label:** button labels and disclosure controls; field labels use weight (500).
- **Metadata:** supporting values and status badges. Navigation labels are (0.6875rem), reducing to (0.625rem) in the bottom dock.

**The Stable Target Rule.** Animate navigation icons while keeping their link targets and labels stable.

## Layout

The centered work area has a maximum width of (82rem) and desktop side padding of (2.5rem). Panel spacing uses the frontmatter rhythm; repeated surfaces are separated by (1.25rem). The sticky top bar groups brand, five labelled links and workspace mode. Page headings have (2.5rem) top and (1.25rem) bottom spacing.

Application records pair a flexible document column with a decision column of at least (16rem), at a ratio of (1fr / 0.48fr). Metadata uses an auto-fitting grid with a (9rem) minimum. At (1000px), two-column grids and application records stack, and side padding becomes (1.5rem). At (1200px), supporting shell labels disappear. At (700px), navigation becomes a fixed bottom dock, side padding becomes (1rem), and bottom content padding becomes (6.5rem), including room for the dock. The dock observes the bottom safe-area inset. Destination chips become a labelled select; segmented buttons retain a minimum height of (2.75rem).

The editor uses a (96vw) maximum width and (92dvh) height, with sticky actions and two content columns. Below (760px), its columns stack and the PDF preview uses (55vh).

## Elevation & Depth

Document surfaces are flat white with fine borders. The header uses a translucent light material with blur (18px) and saturation (140%). Depth identifies functional layering rather than raising every card. Reduced-transparency and increased-contrast settings replace translucent navigation with an opaque surface; increased contrast strengthens muted text and dividers.

### Shadow Vocabulary

- **Header edge:** (`0 1px 0 rgb(30 37 55 / 9%)`), a subtle structural divider.
- **Selected segment:** (`0 2px 5px rgb(30 37 55 / 12%)`), the raised selected control.
- **Mobile dock:** (`0 4px 24px rgb(20 25 40 / 18%)`), separation from scrolling content.
- **Editor:** (`0 24px 80px rgb(16 21 32 / 25%)`), modal elevation above a dimmed backdrop.

**The Functional Depth Rule.** Keep document surfaces flat; use depth for selected controls, navigation and the document editor.

## Shapes

Soft rectangular geometry uses small badge corners, medium control corners and broader surface corners from the frontmatter. Borders are generally (1px). Application cards clip their internal header and tinted decision pane to the surface outline. Status badges are compact rounded rectangles rather than capsules.

## Components

### Buttons

Compact and deliberate. Primary actions use Action Blue and white text, with a minimum height of (2.75rem). Secondary actions use the neutral control fill. Hover darkens blue or strengthens the neutral fill; press scales to (0.98). Disabled actions use opacity (0.55). Review rejection uses a restrained red tint; review and comment actions use quieter neutral fills. Keyboard focus uses a (3px) blue outline with (3px) offset.

### Chips

Neutral badges gain semantic submitted, reviewed or rejected colors. Destination filters are outlined buttons; selection uses a blue wash, darker blue text and a pale blue border. Status is expressed in text alongside color.

### Cards / Containers

White bordered surfaces use the shared surface radius and padding. Application headers span the card, followed by evidence and a tinted decision pane; the decision border moves from the left edge to the top edge when stacked. These cards carry no ambient shadow.

### Inputs / Fields

White editable fields use a visible stroke and the shared field radius, with minimum height (2.75rem). Placeholder text remains opaque. Textareas resize vertically and start at (6rem), or (7rem) in the review area. Labels sit above controls; checkboxes align beside their labels. The global focus ring remains visible.

### Navigation

Five Lucide icon-and-label links use neutral text by default, a neutral hover fill and blue selected state. Desktop links have minimum height (3.5rem), while mobile links use (3.125rem). The fixed mobile dock has its own rounded translucent surface. Keyboard navigation uses the same focus ring as controls.

### Proximity Dock

The React Bits adaptation scales only its icon from (1) to (1.12) across a pointer distance of (-100px) to (100px), using a spring with mass (0.8), stiffness (300) and damping (32). Link rectangles stay fixed. Coarse pointers and reduced-motion mode suppress icon transforms; reduced motion also removes control press transforms and transitions. Color transitions otherwise use (160ms ease-out).

## Do's and Don'ts

### Do:

- **Do** use the shared ink, muted text, canvas, surface and blue action colors.
- **Do** keep labels visible on navigation, using the shorter labels on compact screens.
- **Do** preserve the visible keyboard focus ring and static reduced-motion and coarse-pointer navigation.
- **Do** group document content and decisions with clear borders and tonal separation.

### Don't:

- **Don't** add decorative backgrounds or marketing-scale headings to this task workspace.
- **Don't** rely on hover to reveal essential evidence or navigation labels.
- **Don't** scale navigation hit targets with the animated icons.
