---
name: "Employment Agency"
description: "White document workspace, dark text, restrained Sky Blue accents and semantic decisions."
colors:
  ink: "#171717"
  muted: "#555555"
  line: "#dedee3"
  paper: "#ffffff"
  surface: "#ffffff"
  accent: "#0593c6"
  secondary: "#f2f2f4"
  secondary-hover: "#e7e7eb"
  positive-bg: "#e6f3eb"
  positive-ink: "#17613b"
  positive-hover: "#d8eddf"
  negative-bg: "#fcecef"
  negative-ink: "#a32130"
  negative-hover: "#f9dce0"
  link: "#076385"
  accent-soft: "#e5f6fc"
  error: "#b42332"
  warning: "#805000"
  field-border: "#aeb1bb"
  status-neutral: "#eceef2"
  status-text: "#4c5059"
  document-control: "#f0f0f3"
  document-control-hover: "#e4e5eb"
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
  button-neutral:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
    typography: "{typography.label}"
  button-neutral-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-document:
    backgroundColor: "{colors.document-control}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
    typography: "{typography.label}"
  button-document-hover:
    backgroundColor: "{colors.document-control-hover}"
  button-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-ink}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
    typography: "{typography.label}"
  button-positive-hover:
    backgroundColor: "{colors.positive-hover}"
  button-danger:
    backgroundColor: "{colors.negative-bg}"
    textColor: "{colors.negative-ink}"
    rounded: "{rounded.button}"
    padding: "0.625rem 1rem"
    typography: "{typography.label}"
  button-danger-hover:
    backgroundColor: "{colors.negative-hover}"
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
  chip-submitted:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.link}"
    rounded: "{rounded.badge}"
    padding: "0.1875rem 0.5625rem"
  chip-reviewed:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-ink}"
    rounded: "{rounded.badge}"
    padding: "0.1875rem 0.5625rem"
  chip-rejected:
    backgroundColor: "{colors.negative-bg}"
    textColor: "{colors.negative-ink}"
    rounded: "{rounded.badge}"
    padding: "0.1875rem 0.5625rem"
  navigation-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    padding: "0.375rem 0.625rem"
  filter-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0.5rem 0.75rem"
---
# Design System: Employment Agency

## Overview

**Creative North Star: "The Calm Document Workspace"**

A calm document workspace: white header, canvas and evidence surfaces let dark text and the next review action lead. Platform system typography and familiar grouped controls preserve the confirmed Apple-inspired direction. Apple Design takes precedence over supporting Impeccable guidance.

Density comes from compact labelled navigation and coherent document groups. Sky Blue appears in small selection details, field accents and status tags. Green communicates reviewed or confirmed decisions; red communicates rejection or destruction. Restrained pointer motion leaves navigation targets stable.

**Key Characteristics:**

- White chrome and flat bordered document surfaces.
- Dark text, neutral controls and small Sky Blue accents.
- Explicit semantic decision colors with visible text labels.
- Compact labelled navigation, visible focus and responsive evidence groups.

## Colors

White and neutral grays carry the interface; restrained Sky Blue and explicit semantic tints carry state. Frontmatter records the authoritative values.

### Primary

- **Sky Blue** (`accent`): selected-segment bottom edge and field caret/check accents.
- **Deep Sky Text** (`link`): readable links, selected navigation icons and the keyboard focus outline.
- **Sky Wash** (`accent-soft`): submitted status tags, paired with Deep Sky Text.

### Secondary

- **Confirmation Green** (`positive-bg`, `positive-ink`, `positive-hover`): reviewed tags, Reviewed decisions and confirmation actions.
- **Decision Red** (`negative-bg`, `negative-ink`, `negative-hover`): rejected tags, Reject decisions and destructive actions.
- **Error Red** (`error`) and **Warning Amber** (`warning`): explicit errors and factual cautions.

### Neutral

- **Ink** (`ink`) and **Quiet Ink** (`muted`): primary and supporting text.
- **White** (`paper`, `surface`): canvas, header, document cards, review pane and editor.
- **Hairline** (`line`) and **Field Stroke** (`field-border`): surface dividers and editable boundaries.
- **Neutral Control** (`secondary`, `secondary-hover`): default buttons, Submitted controls and selected navigation/destinations.
- **Document Control** (`document-control`, `document-control-hover`): secondary buttons and history file links.
- **Neutral Status** (`status-neutral`, `status-text`): default badges and compact metadata.

**The Restrained Accent Rule.** Use Sky Blue for small selection details, field accents and submitted tags; keep the header, canvas and decision surfaces white. Retire Hot Pink from interface accents.

**The Decision Meaning Rule.** Use green for reviewed or confirmation, red for rejection or destruction, and neutral controls for Submitted with a blue submitted status tag.

## Typography

**Display and Body Font:** the platform system stack in frontmatter. There is no separate decorative display face. This native task interface preserves the user's explicit system-font choice.

**Character:** compact and familiar; medium control weights and tightened headings organize evidence without promotional scale.

### Hierarchy

- **Headline:** desktop page title; phone page titles reduce to (1.75rem) at (700px).
- **Title:** section heading. Application titles use (1.375rem), review headings (0.875rem), and tertiary headings (1rem, weight 600).
- **Body:** evidence and prose; section paragraphs and fit summaries have a (72ch) reading limit.
- **Label:** buttons and disclosure controls; field labels use weight (500).
- **Metadata:** supporting values and badges. Navigation labels use (0.6875rem) on desktop and phones. Segments, result counts and application metadata use tabular numerals.

## Layout

The centered work area has a maximum width of (82rem), desktop side padding of (2.5rem) and repeated surface separation of (1.25rem). The sticky white header groups brand, five labelled links and workspace mode. Desktop page-heading padding is (2.5rem 0 1.25rem); phones use (1.75rem 0 1.25rem). Noun titles avoid repeated instructions.

Application records pair a flexible evidence column with a decision column of at least (16rem), at a ratio of (1fr / 0.48fr). Metadata uses an auto-fitting grid with a (9rem) minimum. At (1200px), supporting shell labels disappear. At (1000px), content grids and records stack, navigation uses shorter labels, and side padding becomes (1.5rem). At (700px), navigation becomes a fixed bottom dock, side padding becomes (1rem), and bottom content padding becomes (6.5rem). The dock observes the bottom safe-area inset; Applications gets a larger flex share for its longer label. Fictional-demo identity occupies a full header row on phones. Destination chips become a labelled select; mobile segmented buttons retain a (2.75rem) minimum height. Above this phone breakpoint, filter controls use a two-column arrangement.

The editor uses a (96vw) maximum width and (92dvh) height, with sticky actions and two content columns. At (760px), its columns stack and the PDF preview uses (55vh).

## Elevation & Depth

Document surfaces are flat white with fine borders. The header and mobile dock are opaque white without backdrop blur. Depth identifies functional layering. Increased contrast strengthens muted text and dividers; reduced-transparency preferences retain opaque surfaces.

### Shadow Vocabulary

- **Header edge:** (`0 1px 0 rgb(30 37 55 / 9%)`), a subtle structural divider.
- **Mobile dock:** (`0 4px 24px rgb(20 25 40 / 18%)`), separation from scrolling content.
- **Editor:** (`0 24px 80px rgb(16 21 32 / 25%)`), modal elevation above a (`rgb(20 24 35 / 45%)`) backdrop.

**The Functional Depth Rule.** Keep document surfaces and selected segments flat; use depth for navigation separation and the document editor.

## Shapes

Soft rectangles use the badge, field, button, navigation, surface and dialog radii in frontmatter. Borders are generally (1px). Application cards clip their white header and decision pane to the surface outline. Status badges are compact rounded rectangles rather than capsules.

## Components

### Buttons

Compact neutral controls use dark labels and minimum height (2.75rem). Download and editing actions follow the same restrained treatment. Reviewed decisions and confirmation actions use green tints; Reject, retire and account deletion use red tints. Submitted stays neutral. Explicit positive/danger actions strengthen their tint on hover; review-pane controls use brightness (0.94) on hover. Save comment has its own quiet neutral fill. Press scales to (0.96), and disabled actions use opacity (0.55). Global keyboard focus uses a (3px) Deep Sky Text outline with (3px) offset.

### Chips

Default status badges are neutral; reviewed is green, rejected is red, and submitted uses Sky Wash with Deep Sky Text. Text names the status. Destination filters are outlined controls; selection uses a neutral fill, dark text and a pale blue border (`#b9d4f4`). The selected queue segment uses white and a (2px) Sky Blue bottom border, with no shadow.

### Cards / Containers

White bordered surfaces use the shared surface radius and padding. Application headers span the card, followed by evidence and a white decision pane. The decision border moves from left to top when stacked. Cards carry no ambient shadow.

### Inputs / Fields

White editable fields use a visible stroke, shared field radius and minimum height (2.75rem). Placeholder text stays opaque. Textareas resize vertically and start at (6rem), or (7rem) in the review pane. Labels sit above controls; checkboxes align beside their labels. The global focus ring remains visible.

### Navigation

Five Lucide icon-and-label links use dark neutral text over white chrome. Hover adds a neutral fill. Selection uses the shared neutral control fill, dark labels and a small Deep Sky Text icon. Desktop targets have minimum height (3.5rem); phone targets use (3.125rem) inside a rounded opaque white dock. Keyboard navigation uses the global focus ring.

### Proximity Dock

The React Bits adaptation scales only the icon from (1) to (1.12) across pointer distances of (-100px) to (100px), using a spring with mass (0.8), stiffness (300) and damping (32). Link rectangles stay fixed. Only mouse pointer movement updates proximity; keyboard navigation stays static. Coarse pointers and reduced-motion mode suppress icon transforms; reduced motion also removes control press transforms and transitions. Other color transitions use (160ms ease-out).

**The Stable Target Rule.** Animate navigation icons while keeping their link targets and labels stable.

## Do's and Don'ts

### Do:

- **Do** keep the white canvas, dark text and restrained Sky Blue details.
- **Do** use green for reviewed or confirmation and red for rejection or destruction.
- **Do** keep Submitted controls neutral and submitted status tags blue.
- **Do** keep navigation labels visible and preserve keyboard focus and static reduced-motion and coarse-pointer navigation.
- **Do** preserve readable evidence, factual warnings and the visible fictional-demo identity.

### Don't:

- **Don't** restore Hot Pink, saturated header fills or decorative backgrounds.
- **Don't** rely on hover or color alone to reveal essential evidence, state or navigation.
- **Don't** scale navigation hit targets with the animated icons.
