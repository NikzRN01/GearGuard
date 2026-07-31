# GearGuard Frontend Theme Revamp Plan

**Status:** Proposed implementation plan  
**Date:** July 31, 2026  
**Scope:** Frontend presentation and component system only  
**First migration target:** Manager workspace  
**Backend impact:** None

## 1. Objective

Transform GearGuard from a visually polished hackathon dashboard into a calm, trustworthy, data-first maintenance product that can be used for long operational sessions.

The revamp will establish a reusable design system and migrate one product surface at a time. It will not change API behavior, database structures, authentication semantics, maintenance workflows, or backend permissions.

## 2. Honest current-state assessment

The existing theme is approximately 5/10 for product use.

Strengths:

- Recognizable blue/green identity.
- Reasonably consistent rounded-card vocabulary.
- Dark presentation makes the demo visually memorable.
- Recent Manager screens have clearer information hierarchy than older pages.

Weaknesses:

- The authenticated product resembles an AI/crypto dashboard more than an operational maintenance console.
- Ambient orbs, glass effects, gradients, shadows, and motion compete with task information.
- Nearly every surface uses a similar dark-blue value, weakening hierarchy.
- Muted text and subtle borders can be difficult during long sessions.
- Global CSS exceeds 4,000 lines and contains duplicated component definitions.
- Many values are hard-coded or applied through inline styles.
- Buttons, forms, tables, alerts, badges, and dialogs lack stable variants.
- Responsive behavior is built from accumulated overrides instead of deliberate layouts.
- Status meaning is inconsistent and too dependent on color.
- Manager information density is uneven: decorative cards consume space while operational tables become cramped.

## 3. Visual direction: Industrial clarity

The design should communicate:

- Reliability.
- Operational control.
- Safety and urgency.
- Dense but readable information.
- Predictable interaction.
- Calm confidence.

It should not communicate:

- Futuristic spectacle.
- Excessive luxury/glass styling.
- Gamification.
- Consumer social-app behavior.
- Unsupported real-time or AI capabilities.

### Core visual characteristics

- Light theme as the default Manager experience.
- Optional dark theme designed deliberately, not obtained through color inversion.
- Neutral slate page and surface colors.
- GearGuard blue reserved for primary actions and selected navigation.
- Amber and red reserved for operational attention.
- Green reserved for success, completion, or healthy state.
- Minimal gradients and restrained shadows.
- Strong border and spacing hierarchy.
- Compact tables and filters.
- Clear, high-contrast typography.
- Tabular numerals for metrics, durations, and dates.
- Consistent iconography with text labels where meaning may be ambiguous.

## 4. Design principles

1. **Information before decoration.** A visual element must support comprehension, hierarchy, or interaction.
2. **One component, one contract.** Buttons, fields, dialogs, tables, badges, and alerts use stable variants.
3. **Semantic color.** Operational colors have consistent meaning across every screen.
4. **Density is configurable, not accidental.** Manager tables should be compact without becoming cramped.
5. **Accessible by default.** Contrast, focus, keyboard behavior, motion, and status semantics are component requirements.
6. **Responsive by composition.** Layouts adapt through clear component rules rather than appended patches.
7. **Themes use tokens.** Components do not contain raw theme colors.
8. **Migrate and delete.** Every migrated feature removes its superseded CSS in the same workstream.

## 5. Non-goals

- No backend modifications.
- No database changes.
- No API contract changes.
- No reimplementation of authentication or authorization.
- No redesign of the maintenance workflow in this theme project.
- No introduction of animations purely for visual novelty.
- No full-app rewrite in one branch.
- No component library package until the local primitives stabilize.
- No dark-mode toggle before both themes meet accessibility requirements.

## 6. Theme architecture

### 6.1 Proposed style structure

```text
client/src/styles/
  reset.css
  tokens.css
  themes.css
  globals.css
  utilities.css
  layouts.css

client/src/components/ui/
  Alert/
  Badge/
  Button/
  Card/
  Dialog/
  EmptyState/
  Field/
  IconButton/
  Input/
  PageHeader/
  Select/
  Skeleton/
  Table/
  Tabs/
  Toast/

client/src/components/layout/
  AppShell/
  Sidebar/
  Topbar/
  MobileNavigation/
```

Feature-specific styles should remain colocated with the feature or use clearly scoped classes. New unscoped append-only sections in `styles.css` are prohibited after the foundation phase.

### 6.2 Theme application

Apply theme identity at the document root:

```html
<html data-theme="light">
```

Supported values:

```text
light
dark
```

Theme preference precedence:

1. Explicit user preference.
2. Organization preference when supported later.
3. Operating-system preference.
4. Light fallback.

Theme storage is a presentation preference only and may safely use local storage. Authentication and permissions must never use the theme mechanism.

## 7. Design tokens

### 7.1 Color tokens

Tokens should express purpose rather than a literal color:

```css
:root,
[data-theme='light'] {
  --color-page: #f4f6f8;
  --color-surface: #ffffff;
  --color-surface-subtle: #eef2f5;
  --color-surface-raised: #ffffff;
  --color-border: #d8dee6;
  --color-border-strong: #b8c2cf;

  --color-text: #182230;
  --color-text-secondary: #526071;
  --color-text-muted: #748195;
  --color-text-inverse: #ffffff;

  --color-primary: #1769aa;
  --color-primary-hover: #12588f;
  --color-primary-active: #0e4774;
  --color-primary-soft: #e9f3fb;

  --color-success: #16845b;
  --color-success-soft: #e7f6ef;
  --color-warning: #a85f08;
  --color-warning-soft: #fff3df;
  --color-danger: #c73737;
  --color-danger-soft: #fdecec;
  --color-info: #2563a8;
  --color-info-soft: #eaf2fc;

  --color-focus: #2684ff;
  --color-overlay: rgba(16, 24, 40, 0.55);
}
```

Final values must be checked for WCAG contrast in normal, hover, active, selected, and disabled states.

### 7.2 Dark tokens

Dark mode requires individually selected values:

```css
[data-theme='dark'] {
  --color-page: #0d1420;
  --color-surface: #151f2e;
  --color-surface-subtle: #1b2738;
  --color-surface-raised: #202d3e;
  --color-border: #334155;
  --color-border-strong: #526174;

  --color-text: #edf3fa;
  --color-text-secondary: #bac5d3;
  --color-text-muted: #91a0b3;
  --color-text-inverse: #0d1420;

  --color-primary: #68adf0;
  --color-primary-hover: #8bc1f4;
  --color-primary-active: #a7d1f7;
  --color-primary-soft: #183654;
}
```

Do not use pure black backgrounds or pure white body text throughout the interface.

### 7.3 Typography tokens

```css
--font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
--font-mono: 'Roboto Mono', ui-monospace, monospace;

--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-md: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.375rem;
--text-2xl: 1.75rem;
--text-3xl: 2.25rem;

--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
```

Use tabular numerals for:

- KPI values.
- Durations.
- Scheduled times.
- Dates in aligned tables.
- Counts and percentages.

### 7.4 Spacing and sizing

Use a four-pixel base scale:

```css
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.25rem;
--space-6: 1.5rem;
--space-8: 2rem;
--space-10: 2.5rem;
--space-12: 3rem;
```

Interactive control targets should meet the approved accessibility size. Dense table rows may be visually compact while retaining sufficiently large interactive hit areas.

### 7.5 Shape, elevation, and motion

```css
--radius-sm: 0.375rem;
--radius-md: 0.625rem;
--radius-lg: 0.875rem;

--shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.08);
--shadow-md: 0 8px 20px rgba(16, 24, 40, 0.10);

--duration-fast: 120ms;
--duration-normal: 180ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Rules:

- Default surfaces use borders, not large shadows.
- Elevated shadows are reserved for dialogs, menus, and temporary overlays.
- Cards generally use `radius-md`, not oversized pill shapes.
- Motion communicates state change; it does not continuously decorate the interface.
- Reduced-motion preferences disable nonessential transitions.

## 8. Semantic status system

Create one status configuration used by badges, timelines, filters, tables, and charts.

Provisional mapping:

| Meaning | Tone | Visual treatment |
|---|---|---|
| New/submitted | Info | Blue badge and optional inbox icon |
| Needs triage | Warning | Amber badge |
| Assigned | Info | Blue-grey badge |
| In progress | Active | Strong blue or violet badge |
| On hold | Warning | Amber/neutral badge with pause icon |
| Overdue | Danger | Red text/badge plus explicit “Overdue” label |
| Completed | Success | Green badge |
| Verified/closed | Neutral success | Muted green or grey badge |
| Scrap/cancelled | Neutral/danger | Grey or restrained red badge |

Color is never the only indicator. Every state includes readable text.

## 9. Application shell redesign

### 9.1 Desktop shell

- Fixed-width, visually quiet sidebar.
- White or neutral surface against a subtle page background.
- GearGuard brand at top without ambient glow.
- Navigation grouped by work purpose.
- Clear selected state using primary-soft background and a left indicator.
- User/organization information near the bottom.
- Logout inside a user menu or clearly separated utility area.
- Optional topbar for page-level search and contextual actions.

### 9.2 Manager navigation

```text
Work
  Overview
  Requests
  Schedule
  Team workload

Operations
  Equipment
  Work centers
  Teams
```

Avoid hiding frequently used destinations inside a generic dropdown on desktop unless space requires it.

### 9.3 Mobile shell

- Compact topbar.
- Accessible menu button.
- Drawer navigation with focus management.
- Current page title remains visible.
- No horizontally compressed desktop sidebar.
- Primary workflow actions remain reachable without obscuring content.

### 9.4 Shell acceptance criteria

- Current route is visually and programmatically identifiable.
- Navigation works with keyboard and screen reader.
- Focus moves predictably when the mobile drawer opens and closes.
- No content is hidden under navigation at supported widths.
- Manager routes remain understandable without icons.
- Light and dark themes have equivalent hierarchy.

## 10. Component system

### 10.1 Button

Variants:

- Primary.
- Secondary.
- Tertiary/ghost.
- Danger.
- Icon-only.

Sizes:

- Small.
- Medium/default.
- Large only for exceptional primary CTAs.

States:

- Default.
- Hover.
- Active.
- Focus-visible.
- Disabled.
- Pending with stable width.

Ban new feature-specific classes such as `btn-new`, `tech-view-btn`, or page-scoped duplicates once the primitive exists.

### 10.2 Form controls

Components:

- Field wrapper.
- Text input.
- Textarea.
- Select.
- Checkbox.
- Radio group.
- Date input.
- Search input.

Every field supports:

- Visible label.
- Optional hint.
- Required indication.
- Error message association.
- Disabled and read-only state.
- Consistent focus treatment.

### 10.3 Badge

Variants derive from semantic tones, not feature-specific colors.

Badge content must remain readable at 200% zoom and must not rely on a colored dot alone.

### 10.4 Card and panel

Use panels for grouped operational information. Avoid wrapping every metric or paragraph in a separate elevated card.

Variants:

- Standard surface.
- Subtle surface.
- Interactive surface.
- Attention surface.

### 10.5 Table

The table system includes:

- Toolbar/filter area.
- Header and sort state.
- Density option where justified.
- Loading rows/skeleton.
- Empty state.
- Error state.
- Row selection/active state.
- Pagination.
- Mobile alternative with explicit field labels.

### 10.6 Dialog

- Accessible title and description.
- Focus trap.
- Escape handling.
- Focus restoration.
- Background interaction blocked.
- Specific destructive confirmation copy.
- Responsive width and safe viewport height.

### 10.7 Alert and toast

Alerts communicate persistent contextual information. Toasts communicate transient operation results.

Do not use browser `alert()` in migrated features.

## 11. Manager-first migration scope

The Manager workspace establishes the reference theme.

### 11.1 Manager overview

Revamp:

- Application shell.
- Page header.
- Attention summary.
- Unassigned queue.
- Today’s schedule.
- Assigned workload.
- Loading, empty, and error states.

Design changes:

- Replace four large dark KPI cards with compact attention cards.
- Prioritize unassigned and overdue items visually.
- Reduce surface nesting.
- Align counts using tabular numerals.
- Use a quiet page background and white panels in light mode.
- Keep operational limitations visible but visually restrained.

### 11.2 Manager request queue

Revamp:

- Compact filter toolbar.
- Request list/table.
- Selected row state.
- Detail panel.
- Assignment control.
- Schedule control.
- Notes/history.

Design changes:

- Use consistent field components.
- Establish clear primary versus secondary actions.
- Make unassigned and overdue states explicit.
- Preserve filters visibly.
- Improve responsive detail navigation.

### 11.3 Assigned workload

Revamp:

- Use a readable data table on desktop.
- Use labeled workload cards on narrow screens.
- Keep the “assigned requests, not utilization” explanation.
- Avoid decorative charts until real capacity data exists.

### 11.4 Schedule

Revamp after persisted scheduling limitations are understood:

- Clear date navigation.
- Agenda-first mobile experience.
- Strong selected/current-date states.
- Status and assignee visible without relying only on event color.

## 12. CSS migration strategy

The existing stylesheet must not be rewritten blindly.

### Step 1: Inventory

- Identify duplicate selectors.
- Identify inline styles in Manager components.
- Identify component-like class families.
- Identify unused selectors using build/static analysis plus manual verification.
- Capture current screenshots at agreed viewport sizes before deletion.

### Step 2: Add foundations

- Introduce token and theme files.
- Add reset/global typography.
- Build components with new scoped class names or CSS modules.
- Keep old CSS intact temporarily for unmigrated screens.

### Step 3: Migrate Manager shell

- Apply new shell only to Manager routes initially.
- Avoid changing public, Admin, or Technician routes unintentionally.
- Use a route/shell scope such as `.gg-manager-shell` during migration if necessary.

### Step 4: Migrate Manager pages

- Overview.
- Requests.
- Workload.
- Schedule.
- Equipment/work centers later.

### Step 5: Delete superseded CSS

For every migrated component:

- Remove old selectors.
- Remove inline styling.
- Verify no unmigrated screen imports or relies on those selectors.
- Re-run visual regression and responsive checks.

### Step 6: Promote global system

Once Manager pages stabilize, use the same primitives for Technician and Admin migrations.

## 13. Responsive specification

### Wide desktop: 1280px and above

- Persistent sidebar.
- Multi-column overview.
- Request list and detail displayed together.
- Workload as a table.

### Standard desktop/tablet landscape: 900–1279px

- Persistent or compact sidebar depending on content.
- Two-column overview when space permits.
- Request list/detail may remain split with adjusted proportions.

### Tablet/large mobile: 600–899px

- Drawer navigation.
- Single-column overview panels.
- Request detail becomes a separate view or stacked section.
- Filters collapse into a controlled panel.

### Small mobile: below 600px

- Compact topbar and drawer.
- Single-column attention cards.
- Request list uses labeled rows/cards.
- Detail actions are full width.
- Agenda schedule is primary.
- No essential action depends on hover.

## 14. Accessibility plan

Target WCAG 2.2 AA for Manager critical journeys.

Required checks:

- Text and non-text contrast.
- Visible focus indicators.
- Keyboard navigation.
- Skip link.
- Landmark structure.
- Dialog focus management.
- Error association and summaries.
- Live announcements for mutations.
- Status meaning without color.
- Reflow at 320 CSS pixels.
- Zoom at 200% and 400% where applicable.
- Reduced motion.
- Touch target sizing.
- Screen-reader review of overview, filters, assignment, and scheduling.

## 15. Iconography

Choose one icon system with:

- Consistent stroke or fill style.
- Accessible labeling rules.
- Tree-shakeable React components or optimized SVGs.
- No emoji as production navigation icons.

Rules:

- Decorative icons use `aria-hidden`.
- Icon-only buttons require accessible names and tooltips where helpful.
- Status icons accompany, not replace, text.
- Avoid mixing custom SVG styles on the same surface.

## 16. Theme behavior

### Initial release

- Ship the Manager light theme first.
- Retain the legacy dark theme for unmigrated surfaces.
- Use Manager route scoping to prevent unintended cross-page changes.

### Second release

- Add Manager dark theme using the completed token system.
- Add a user theme control.
- Respect operating-system preference on first visit.
- Prevent a flash of the incorrect theme during startup.

### Later release

- Migrate Technician and Admin experiences.
- Remove legacy theme CSS when no routes depend on it.

## 17. Visual QA strategy

Capture reference screenshots for:

- Manager overview: normal, empty, error.
- Request queue: default, filtered, no results.
- Request detail: unassigned, assigned, completed.
- Assignment pending/success/error.
- Workload: data and empty states.
- Mobile navigation open/closed.
- Dialog default/error/pending.
- Light and dark theme when both exist.

Viewports:

- 1440 × 900.
- 1024 × 768.
- 768 × 1024.
- 390 × 844.
- 320 × 800.

Visual regression tests should tolerate only intentional reviewed differences.

## 18. Performance budgets

The theme revamp should not justify uncontrolled bundle growth.

Targets:

- Avoid loading an entire icon library.
- CSS should shrink as duplicate legacy rules are removed.
- Fonts should use a controlled subset and reliable fallback.
- Theme switching must not reload the page.
- Animations must remain compositor-friendly where used.
- Manager initial-route CSS and JavaScript should be measured after each phase.

Track:

- CSS size before and after each migration.
- JavaScript added by component/icon dependencies.
- Largest Contentful Paint.
- Interaction to Next Paint.
- Cumulative Layout Shift.

## 19. Implementation phases

### Phase T0: Direction and baseline

**Duration:** 2–3 days

- Approve “industrial clarity” direction.
- Capture current screenshots.
- Inventory duplicate CSS and inline Manager styling.
- Approve light palette, typography, density, and icon direction.
- Confirm supported browsers and viewports.

**Exit criteria:** A small set of approved reference screens and tokens exists before broad implementation.

### Phase T1: Token and theme foundation

**Duration:** 2–4 days

- Add reset, token, theme, global, and utility files.
- Implement light theme.
- Add dark-token placeholder only if values are verified.
- Add typography and focus foundations.
- Add reduced-motion handling.

**Exit criteria:** A token demonstration page/component proves color, type, spacing, shape, focus, and semantic states.

### Phase T2: Core primitives

**Duration:** 1 week

- Button and IconButton.
- Field, Input, Select, and Textarea.
- Badge.
- Alert and Toast.
- Card/Panel.
- Dialog.
- EmptyState and Skeleton.
- PageHeader.
- Table foundation.

**Exit criteria:** Primitives pass keyboard, contrast, responsive, and automated accessibility tests.

### Phase T3: Manager shell

**Duration:** 3–5 days

- Build new desktop shell.
- Build mobile navigation drawer.
- Group Manager navigation.
- Add user/organization utility area.
- Remove decorative backdrop from Manager authenticated routes.
- Add route-level theme scope.

**Exit criteria:** Manager navigation is clear, accessible, responsive, and isolated from legacy screens.

### Phase T4: Manager overview

**Duration:** 3–5 days

- Migrate page header and actions.
- Migrate attention cards.
- Migrate unassigned queue and schedule panels.
- Migrate workload summary.
- Implement all empty/error/loading states.
- Remove superseded Manager overview styles.

**Exit criteria:** Overview passes approved reference screenshots and accessibility checks at all target viewports.

### Phase T5: Manager requests and workload

**Duration:** 1–2 weeks

- Migrate filters.
- Migrate request queue and detail.
- Migrate assignment and schedule controls.
- Migrate notes/history.
- Migrate workload table/cards.
- Replace page-specific buttons, fields, alerts, and badges.
- Remove superseded styles.

**Exit criteria:** The Manager assignment vertical slice uses only the new design-system primitives and passes visual/interaction tests.

### Phase T6: Schedule and operational screens

**Duration:** 1–2 weeks

- Migrate schedule navigation and agenda.
- Migrate equipment.
- Migrate work centers.
- Migrate teams.
- Verify dense tables and mobile alternatives.

**Exit criteria:** All Manager destinations share the new theme without relying on legacy component styles.

### Phase T7: Dark mode and hardening

**Duration:** 3–5 days

- Complete verified dark tokens.
- Add theme control and preference persistence.
- Prevent incorrect-theme flash.
- Run cross-browser visual QA.
- Measure performance and bundle effects.
- Complete accessibility audit.

**Exit criteria:** Both themes meet visual, accessibility, responsive, and performance gates.

### Phase T8: Legacy migration

**Duration:** Separate follow-up

- Technician experience.
- Admin experience.
- Public/authentication pages.
- Delete remaining legacy CSS.

## 20. Ticket-ready backlog

### Epic TH-1: Visual foundation

- TH-101: Capture baseline screenshots for Manager routes and states.
- TH-102: Audit duplicate selectors and inline styles.
- TH-103: Create color and semantic token definitions.
- TH-104: Create typography, spacing, radius, shadow, and motion tokens.
- TH-105: Add light-theme root behavior.
- TH-106: Add focus and reduced-motion foundations.
- TH-107: Add token contrast tests/documentation.

### Epic TH-2: UI primitives

- TH-201: Build Button and IconButton.
- TH-202: Build Field, Input, Select, Textarea, and validation states.
- TH-203: Build semantic Badge.
- TH-204: Build Alert and Toast.
- TH-205: Build Card and Panel.
- TH-206: Build accessible Dialog.
- TH-207: Build EmptyState and Skeleton.
- TH-208: Build PageHeader.
- TH-209: Build Table and responsive row/card pattern.
- TH-210: Add primitive accessibility and visual tests.

### Epic TH-3: Manager shell

- TH-301: Build Manager desktop shell.
- TH-302: Build Manager grouped navigation.
- TH-303: Build mobile navigation drawer.
- TH-304: Add user/organization utility area.
- TH-305: Isolate Manager theme from legacy routes.
- TH-306: Remove Manager decorative backdrop dependency.
- TH-307: Add shell visual and keyboard tests.

### Epic TH-4: Manager overview

- TH-401: Revamp Manager page header.
- TH-402: Revamp attention summary cards.
- TH-403: Revamp unassigned-request queue.
- TH-404: Revamp today schedule panel.
- TH-405: Revamp workload summary.
- TH-406: Add overview loading/empty/error references.
- TH-407: Remove superseded overview CSS.

### Epic TH-5: Manager requests

- TH-501: Revamp request filter toolbar.
- TH-502: Revamp request list and selected state.
- TH-503: Revamp request detail information.
- TH-504: Revamp assignment control.
- TH-505: Revamp schedule control.
- TH-506: Revamp notes/history.
- TH-507: Add mobile request list/detail behavior.
- TH-508: Replace feature-specific buttons, fields, badges, and alerts.
- TH-509: Remove superseded request CSS.

### Epic TH-6: Remaining Manager screens

- TH-601: Revamp assigned-workload table/cards.
- TH-602: Revamp Manager schedule and agenda.
- TH-603: Revamp equipment screens.
- TH-604: Revamp work-center screens.
- TH-605: Revamp team screens.
- TH-606: Complete Manager legacy CSS removal.

### Epic TH-7: Theme hardening

- TH-701: Complete dark-theme tokens.
- TH-702: Add theme preference control.
- TH-703: Prevent theme flash.
- TH-704: Add visual regression suite.
- TH-705: Run accessibility audit and remediation.
- TH-706: Run responsive/cross-browser QA.
- TH-707: Measure and enforce CSS/bundle budgets.
- TH-708: Complete theme release checklist.

## 21. Pull-request rules

Every theme PR must satisfy applicable rules:

- Uses semantic tokens instead of raw theme colors.
- Adds no new unscoped global component selector.
- Adds no unnecessary inline style.
- Uses existing primitives where available.
- Covers hover, active, focus, disabled, loading, and error states.
- Works in approved themes.
- Works at target viewports.
- Does not rely on color alone.
- Supports keyboard interaction.
- Includes visual references/tests where appropriate.
- Removes superseded CSS for migrated components.
- Does not modify backend files.

## 22. Theme definition of done

A migrated screen is complete only when:

- It uses the new application shell and tokens.
- It uses approved UI primitives.
- It contains no legacy decorative backdrop dependency.
- It contains no arbitrary page-specific button/form variants.
- Its loading, empty, error, and success states are themed.
- Its keyboard and focus behavior is correct.
- It meets contrast and reflow requirements.
- It matches approved visual references at target viewports.
- It introduces no unexplained performance regression.
- Superseded CSS and inline styles are removed.

## 23. Manager theme release gate

The Manager theme can become the default only when:

- Manager overview, requests, workload, schedule, equipment, work centers, and teams are migrated.
- No Manager screen depends on legacy component styling.
- Light theme passes accessibility review.
- Dark theme is either complete and verified or intentionally withheld.
- Desktop, tablet, and mobile reference states pass review.
- Critical Manager workflows remain functionally unchanged.
- Visual regression, frontend build, and interaction tests pass.
- CSS size is measured and duplicate legacy rules are reduced.
- Backend files remain untouched.

## 24. Recommended first implementation slice

Build the first slice in this order:

1. Light-theme tokens.
2. Typography and focus foundations.
3. Button, Field, Badge, Panel, Alert, and EmptyState primitives.
4. Manager desktop/mobile shell.
5. Manager overview attention cards and unassigned queue.
6. Baseline and final screenshots at 1440px, 768px, and 390px widths.
7. Keyboard and contrast review.
8. Delete replaced Manager overview CSS.

This slice should establish the visual language before the request detail and operational screens are migrated.

## 25. Estimated delivery

For one frontend engineer with timely visual reviews:

| Workstream | Estimate |
|---|---:|
| Direction, audit, and tokens | 3–5 days |
| Core primitives | 5–8 days |
| Manager shell and overview | 5–8 days |
| Manager requests and workload | 7–10 days |
| Schedule and operational screens | 7–10 days |
| Dark mode, QA, and cleanup | 4–6 days |
| **Manager theme total** | **Approximately 5–7 weeks** |

A narrow first slice covering the Manager shell and overview can be completed in approximately 1.5–2.5 weeks, depending on design review cycles and test infrastructure.

## 26. Final recommendation

Do not begin by selecting prettier gradients or globally changing colors. Begin by creating the token system and core primitives, then apply them to the Manager shell and overview.

The success measure is not whether the application looks newer. It is whether Manager users can scan urgency faster, distinguish actions reliably, work for long periods with less visual fatigue, and use the interface accessibly across supported screen sizes.
