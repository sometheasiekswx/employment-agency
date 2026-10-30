---
name: Employment Agency
description: Calm document review with Sky Blue identity and compact native controls.
colors:
  ink: "#102d3b"
  muted: "#4c6571"
  line: "#cbe3ec"
  paper: "#fcffff"
  surface: "#fcffff"
  accent: "#0593c6"
  on-brand: "#071018"
  pink: "#d83995"
  link: "#076385"
  accent-soft: "#e5f6fc"
  accent-hover: "#35a7d0"
  pink-hover: "#e763b0"
  error: "#b42332"
  warning: "#805000"
  secondary: "#f0f0f3"
  secondary-hover: "#e4e5eb"
  field-border: "#aeb1bb"
  focus: "#9f216a"
  status-neutral: "#eceef2"
  status-text: "#4c5059"
  submitted-bg: "#e6f3eb"
  submitted-text: "#1b6541"
  reviewed-text: "#076385"
  rejected-bg: "#fcecef"
  rejected-text: "#a32130"
  review-surface: "#f1faff"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
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
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-document:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
  button-document-hover:
    backgroundColor: "{colors.pink-hover}"
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

A calm document workspace: a solid Sky Blue header gives the application a clear identity, while White work surfaces and dark blue ink keep attention on evidence and the next review action. Native system typography and familiar grouped controls preserve the confirmed Apple-inspired direction.

Density comes from compact labelled navigation and coherent document groups, with a pale blue decision area. Hot Pink marks active icons, selected sections and the first downloadable document action. Restrained motion responds to pointer proximity without moving link targets.

**Key Characteristics:**

- White canvas and bordered document surfaces.
- Sky Blue identity, selective Hot Pink accents and explicit semantic status colors.
- Compact labelled navigation and persistent focus feedback.
- Responsive document groups with readable evidence.

## Colors

The confirmed Sky Blue, White and Hot Pink identity is paired with darker text variants; status colors carry explicit meaning.

### Primary

- **Sky Blue** (`accent`): the solid header, primary buttons and field accents.
- **Deep Sky Text** (`link`, `reviewed-text`): readable links, reviewed status and selected destination text.
- **Brand Label Ink** (`on-brand`): dark text on Sky Blue and Hot Pink fills.
- **Selected Sky Wash** (`accent-soft`): mobile selected navigation and reviewed or destination states.
- **Light Sky Hover** (`accent-hover`): primary hover feedback.
- **Hot Pink** (`pink`, `pink-hover`): active navigation icon, selected-section bottom border and first downloadable document action.
- **Deep Pink Focus** (`focus`): visible keyboard outline.

### Secondary

- **Submitted Green** (`submitted-bg`, `submitted-text`): submitted status only.
- **Rejected Red** (`rejected-bg`, `rejected-text`): rejected status; `error` marks errors.
- **Warning Amber** (`warning`): caution text.

### Neutral

- **Blue Ink** (`ink`) and **Quiet Blue Ink** (`muted`): primary and supporting text.
- **White** (`paper`, `surface`) and **Review Sky Tint** (`review-surface`): canvas, content and decision areas.
- **Hairline** (`line`) and **Field Stroke** (`field-border`): dividers and editable boundaries.
- **Secondary Control** (`secondary`, `secondary-hover`): quieter actions.
- **Neutral Status** (`status-neutral`, `status-text`): default badges and compact metadata.

**The Brand Pairing Rule.** Keep Sky Blue and Hot Pink visible in their established roles; use dark labels on their filled surfaces and darker tonal variants for text on White. Reserve green and red for explicit status or feedback.

## Typography

**Display and Body Font:** the platform system stack recorded in the frontmatter. This is a native task interface, with no separate decorative display face.

**Character:** compact, familiar and readable. Medium weights distinguish controls; slightly tightened headings organize work without promotional scale.

### Hierarchy

- **Headline:** page title at the same compact size on desktop and mobile; general standalone h1 elements retain (2rem).
- **Title:** section heading; application titles use (1.375rem), while review headings use (0.875rem).
- **Body:** evidence and prose, with section paragraphs and fit summaries limited to (72ch); page descriptions use (65ch).
- **Label:** button labels and disclosure controls; field labels use weight (500).
- **Metadata:** supporting values and status badges. Navigation labels are (0.6875rem), including the bottom dock. Counts and metadata use tabular numerals.

**The Stable Target Rule.** Animate navigation icons while keeping their link targets and labels stable.

## Layout

The centered work area has a maximum width of (82rem) and desktop side padding of (2.5rem). Panel spacing uses the frontmatter rhythm; repeated surfaces are separated by (1.25rem). The sticky top bar groups brand, five labelled links and workspace mode. Page headings have (1.75rem) top and (1rem) bottom spacing. They use a noun title without repeated subtitles or footer slogans.

Application records pair a flexible document column with a decision column of at least (16rem), at a ratio of (1fr / 0.48fr). Metadata uses an auto-fitting grid with a (9rem) minimum. At (1000px), two-column grids and application records stack, and side padding becomes (1.5rem). At (1200px), supporting shell labels disappear. At (700px), navigation becomes a fixed bottom dock, side padding becomes (1rem), and bottom content padding becomes (6.5rem), including room for the dock. The dock observes the bottom safe-area inset; its Applications target receives a larger flex share for the longer label. A fictional-demo identity badge remains visible and occupies a full header row on phones. Destination chips become a labelled select; segmented buttons retain a minimum height of (2.75rem).

The editor uses a (96vw) maximum width and (92dvh) height, with sticky actions and two content columns. Below (760px), its columns stack and the PDF preview uses (55vh).

## Elevation & Depth

Document surfaces are flat White with fine borders. The header is solid Sky Blue and the mobile dock is opaque White, both without backdrop blur. Depth identifies functional layering rather than raising every card. Increased contrast strengthens muted text and dividers; reduced-transparency settings retain the opaque brand materials.

### Shadow Vocabulary

- **Header edge:** (`0 1px 0 rgb(30 37 55 / 9%)`), a subtle structural divider.
- **Mobile dock:** (`0 4px 24px rgb(20 25 40 / 18%)`), separation from scrolling content.
- **Editor:** (`0 24px 80px rgb(16 21 32 / 25%)`), modal elevation above a dimmed backdrop.

**The Functional Depth Rule.** Keep document surfaces and selected segments flat; use depth for navigation separation and the document editor.

## Shapes

Soft rectangular geometry uses small badge corners, medium control corners and broader surface corners from the frontmatter. Borders are generally (1px). Application cards clip their internal header and tinted decision pane to the surface outline. Status badges are compact rounded rectangles rather than capsules.

## Components

### Buttons

Compact and deliberate. Primary actions use Sky Blue and dark brand-label text, with a minimum height of (2.75rem). The first downloadable document link in each document action group uses Hot Pink and dark text; editor actions remain neutral. Secondary actions use the neutral control fill. Hover lightens brand fills or strengthens the neutral fill; press scales to (0.96). Disabled actions use opacity (0.55). Review rejection uses a restrained red tint; review and comment actions use quieter neutral fills. Keyboard focus uses a (3px) deep pink outline with (3px) offset.

### Chips

Neutral badges gain semantic submitted, reviewed or rejected colors. Destination filters are outlined buttons; selection uses a blue wash, darker blue text and a pale blue border. Status is expressed in text alongside color. The selected queue section uses a White fill and a (2px) Hot Pink bottom border, without a shadow.

### Cards / Containers

White bordered surfaces use the shared surface radius and padding. Application headers span the card, followed by evidence and a tinted decision pane; the decision border moves from the left edge to the top edge when stacked. These cards carry no ambient shadow.

### Inputs / Fields

White editable fields use a visible stroke and the shared field radius, with minimum height (2.75rem). Placeholder text remains opaque. Textareas resize vertically and start at (6rem), or (7rem) in the review area. Labels sit above controls; checkboxes align beside their labels. The global focus ring remains visible.

### Navigation

Five Lucide icon-and-label links use dark text over the Sky Blue header. Hover uses a light sky fill. Desktop selection uses White with a pink icon; mobile selection uses a sky wash with the same pink icon. Desktop links have minimum height (3.5rem), while mobile links use (3.125rem). The fixed mobile dock has its own rounded opaque White surface. Keyboard navigation uses the same focus ring as controls.

### Proximity Dock

The React Bits adaptation scales only its icon from (1) to (1.12) across a pointer distance of (-100px) to (100px), using a spring with mass (0.8), stiffness (300) and damping (32). Link rectangles stay fixed. Coarse pointers and reduced-motion mode suppress icon transforms; reduced motion also removes control press transforms and transitions. Color transitions otherwise use (160ms ease-out).

## Do's and Don'ts

### Do:

- **Do** use the confirmed Sky Blue, White and Hot Pink identity with the shared dark text pairings.
- **Do** keep labels visible on navigation, using the shorter labels on compact screens.
- **Do** preserve the visible keyboard focus ring and static reduced-motion and coarse-pointer navigation.
- **Do** group document content and decisions with clear borders and tonal separation.
- **Do** preserve factual warnings and visible fictional-demo identity while removing repeated page instructions.

### Don't:

- **Don't** add decorative backgrounds or marketing-scale headings to this task workspace.
- **Don't** rely on hover to reveal essential evidence or navigation labels.
- **Don't** scale navigation hit targets with the animated icons.
