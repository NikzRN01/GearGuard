# GearGuard Frontend Productization Plan

**Document status:** Proposed execution baseline  
**Assessment date:** July 31, 2026  
**Repository baseline:** `main` at `1f2fd7f`  
**Related document:** `PRODUCT_READINESS_REPORT.md`  
**Primary stack:** React 18, Vite 5, React Router 6, Axios

## 1. Purpose

This document defines a safe, staged plan for turning the current GearGuard frontend from a hackathon interface into a maintainable product frontend. It is designed to be implementation-ready: each phase includes scope, dependencies, deliverables, acceptance criteria, tests, and rollout controls.

The plan deliberately avoids a full visual rewrite. The current interface already expresses useful product concepts and can be evolved. The priority is to establish trustworthy authentication behavior, predictable data flow, reusable UI foundations, accessible interaction patterns, and automated verification before adding more feature breadth.

## 2. Executive assessment

### 2.1 What should be retained

- React and Vite as the application foundation.
- React Router for client-side navigation.
- Existing domain surfaces: requests, equipment, work centers, teams, calendar, technician dashboard, and administration.
- The broad visual direction and recognizable GearGuard identity.
- Existing API service concept, after it is hardened.
- Working production build pipeline as a starting point.

### 2.2 What must change

- Browser storage must stop being treated as a security authority.
- Protected routes must wait for verified server session state.
- Role and permission checks must be centralized.
- Server data must move from ad hoc page effects to a query/cache layer.
- Large pages must be decomposed by feature and responsibility.
- Forms need shared validation and accessible behavior.
- Statuses, dates, metrics, and errors need canonical models.
- The duplicated global stylesheet must become a controlled design system.
- Automated unit, component, accessibility, and end-to-end tests must become release gates.
- Generated build output must stop being committed.

### 2.3 Current frontend risk rating

| Concern | Current risk | Reason |
|---|---|---|
| Authentication UX | Critical | Editable `sessionStorage` object determines identity and navigation. |
| Authorization UX | Critical | Admin and role routes are not protected. |
| Data correctness | High | Technician filtering, statuses, calendar times, and metrics are inconsistent. |
| Maintainability | High | Large pages, duplicated CSS, inline styles, and mixed responsibilities. |
| Accessibility | High | Modal focus, keyboard behavior, chart semantics, and announcements are incomplete. |
| Reliability | High | No error boundary, standardized retry behavior, or stale-session recovery. |
| Testability | Critical | No frontend test suite or end-to-end coverage. |
| Performance | Medium | Bundle is acceptable today but data fetching and page architecture will scale poorly. |
| Observability | High | Frontend errors and failed user journeys are not captured. |

## 3. Frontend product principles

All frontend decisions should follow these principles:

1. **The server is the security authority.** The UI may improve usability by hiding unavailable actions, but it never grants permission.
2. **One source of truth per kind of state.** Server state, form state, URL state, and local UI state must not be duplicated casually.
3. **URLs represent navigable product state.** Filters, selected records, pagination, and tabs should use route or query parameters where appropriate.
4. **Accessibility is part of component correctness.** It is not a final styling pass.
5. **Domain vocabulary is centralized.** Statuses, roles, priorities, labels, and metrics must not be redefined in individual pages.
6. **Failure is designed.** Loading, empty, partial failure, offline, permission denied, validation error, and expired session are normal states.
7. **Migrate incrementally.** Keep deployable checkpoints and avoid a long-lived rewrite branch.
8. **Measure behavior.** Tests, performance budgets, accessibility checks, and production telemetry define readiness.

## 4. Target frontend architecture

### 4.1 Proposed directory structure

```text
client/src/
  app/
    App.tsx
    router.tsx
    providers.tsx
    queryClient.ts
    errorBoundary.tsx
  auth/
    api.ts
    hooks.ts
    permissions.ts
    ProtectedRoute.tsx
    PermissionGate.tsx
    SessionProvider.tsx
    types.ts
  components/
    ui/
      Alert/
      Badge/
      Button/
      DataTable/
      Dialog/
      EmptyState/
      FormField/
      Input/
      Select/
      Skeleton/
      Spinner/
      Toast/
    layout/
      AppShell/
      Sidebar/
      PageHeader/
  features/
    dashboard/
    equipment/
    maintenance/
    scheduling/
    teams/
    users/
    work-centers/
  lib/
    apiClient.ts
    errors.ts
    dates.ts
    env.ts
    formatters.ts
    validation.ts
  routes/
    landing/
    login/
    signup/
    reset-password/
    app/
    not-found/
  styles/
    tokens.css
    reset.css
    globals.css
    utilities.css
  test/
    setup.ts
    handlers.ts
    server.ts
```

Feature folders should contain their own API functions, query keys, hooks, schemas, types, components, and tests. Shared components should be promoted to `components/ui` only after two or more features genuinely need the same abstraction.

### 4.2 Provider composition

The application root should compose providers explicitly:

```text
ErrorBoundary
  -> QueryClientProvider
    -> SessionProvider
      -> ToastProvider
        -> RouterProvider
```

Provider responsibilities must remain narrow:

- `SessionProvider`: current authenticated user, session loading, logout, and session refresh.
- `QueryClientProvider`: server cache and mutation behavior.
- `ToastProvider`: transient user feedback.
- Router: route selection and URL state.
- Error boundary: unexpected rendering failures and recovery action.

Do not put general business data into React context.

### 4.3 TypeScript strategy

Use an incremental migration rather than converting every file in one change.

Migration order:

1. Environment validation and API client.
2. Auth/session and permission modules.
3. Shared UI components.
4. Maintenance-request feature.
5. Equipment and work centers.
6. Teams and administration.
7. Calendar and dashboards.
8. Remaining layout and public routes.

Required compiler settings should include strict mode and protections comparable to:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`

Do not weaken compiler rules merely to finish migration. Use explicit boundary parsing for untrusted API data.

## 5. Authentication and permission UX

### 5.1 Session model

The frontend should consume a server-verified session using secure HTTP-only cookies. It should never store access authority in `localStorage` or `sessionStorage`.

Recommended session endpoints:

- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Frontend session states:

```text
checking -> authenticated
         -> anonymous
         -> unavailable/retryable error
```

The UI must not render protected content while session verification is pending.

### 5.2 Protected routes

Routes should declare their access requirement:

| Route | Access rule |
|---|---|
| `/` | Public |
| `/login` | Public; redirect authenticated users to their default workspace |
| `/signup` | Public only if approved signup mode is enabled |
| `/reset-password` | Public token workflow |
| `/app` | Authenticated |
| `/app/technician` | Technician or broader approved permission |
| `/app/admin` | Explicit dashboard/administration permission |
| `/app/teams` | Authenticated; actions permission-gated |
| `/app/equipment/*` | Authenticated; actions permission-gated |
| `/app/requests/*` | Authenticated; records filtered and authorized by server |

Required states:

- Session loading screen.
- Authentication redirect preserving intended destination.
- 403 permission-denied page.
- 404 not-found page.
- Session-expired notification and login redirect.

### 5.3 Permission model

Avoid checks such as `user.role === 'admin'` throughout the component tree. Centralize permission evaluation:

```ts
can(user, 'equipment:create')
can(user, 'request:assign')
can(user, 'team:manage')
can(user, 'audit:view')
```

The session response should include stable permissions or enough trusted identity data for a centralized client mapping. The backend remains authoritative.

Use permission gates for usability:

- Hide actions the user cannot perform.
- Disable actions only when explaining why is helpful.
- Never fetch administrative datasets merely because a route can be typed manually.
- Handle 403 responses globally and locally where context is useful.

### 5.4 Authentication form behavior

- Remove the “Login As” selector; the account determines its role.
- Remove privileged roles from public signup.
- Use uniform login and recovery error messages.
- Support password-manager autocomplete attributes.
- Preserve the intended destination after login.
- Disable duplicate submissions while pending.
- Announce errors and success messages to assistive technology.
- Never reveal whether a reset email belongs to an account.
- Reset form must require a server-provided token, not an email query parameter.

## 6. Server-state and API layer

### 6.1 API client

Replace the current minimal Axios singleton with a typed client wrapper that provides:

- Required environment-based base URL.
- `withCredentials` for cookie sessions.
- Request IDs when supplied by the API.
- Normalized error objects.
- Safe handling of 401, 403, 409, 422, 429, and 5xx responses.
- Abort-signal support.
- No automatic retry for unsafe mutations.
- Redaction of sensitive data from logging.

Production builds must fail when required environment configuration is missing. They must never silently default to localhost.

### 6.2 Query and mutation conventions

Adopt TanStack Query or equivalent conventions:

- One query-key factory per feature.
- Query parameters included in the key.
- Mutations invalidate only affected data.
- Cancellation on route or parameter changes.
- Explicit stale times based on data volatility.
- Bounded retries for safe reads.
- No automatic retry for authorization and validation failures.
- Optimistic updates only when rollback behavior is tested.

Example key hierarchy:

```text
['maintenance']
['maintenance', 'list', filters]
['maintenance', 'detail', requestId]
['maintenance', 'calendar', range]
['equipment', 'list', filters]
['teams', 'detail', teamId]
```

### 6.3 URL state

Persist navigable list state in query parameters:

- Search.
- Filters.
- Sort.
- Page and page size.
- Selected date range.
- Active tab when it represents a shareable view.

Do not place modal forms, transient toast state, or unsaved form fields in the URL.

### 6.4 Error model

Map API errors into a stable frontend representation:

```ts
type AppError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
  retryable: boolean;
};
```

Required UI behavior:

- Validation errors appear next to fields and in a summary when appropriate.
- Conflicts explain that data changed and offer refresh/retry.
- Rate limits communicate when retry is possible.
- 401 triggers session recovery/login behavior.
- 403 shows permission denial without hiding the context.
- 5xx errors expose a request ID, not server internals.
- Network errors distinguish offline from server failure where possible.

## 7. Domain model normalization

### 7.1 Canonical enums

Create centrally typed values for:

- User role and permission.
- Maintenance status.
- Request type.
- Priority.
- Equipment status.
- Work-center status.
- Notification state.

Every display label, badge color, filter, transition button, and chart grouping must derive from the same configuration.

Example:

```ts
const maintenanceStatuses = {
  submitted: { label: 'Submitted', tone: 'info' },
  triaged: { label: 'Triaged', tone: 'warning' },
  assigned: { label: 'Assigned', tone: 'accent' },
  in_progress: { label: 'In progress', tone: 'warning' },
  on_hold: { label: 'On hold', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'success' },
  verified: { label: 'Verified', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' }
} as const;
```

The final values must follow the approved backend workflow rather than this illustrative example.

### 7.2 Dates and time zones

- API timestamps use ISO 8601 with offsets or UTC.
- Date-only values remain date-only and are not passed through unintended UTC conversions.
- Scheduled work stores actual start/end timestamps.
- Organization and user time zones are explicit.
- Formatting is centralized through `Intl.DateTimeFormat`.
- Calendar week numbers are calculated, never hard-coded.
- Invalid or missing dates render a defined fallback.

### 7.3 Metrics

Every dashboard metric requires:

- Business definition.
- Data source.
- Time window.
- Formula.
- Empty-data behavior.
- Permission scope.
- Unit test fixtures.

Do not label assignment percentage as utilization or any open request as critical equipment.

## 8. Shared UI system

### 8.1 Design tokens

Create CSS custom properties for:

- Color roles: background, surface, text, muted text, border, accent, danger, warning, success, and focus.
- Typography scale and weights.
- Spacing scale.
- Border radii.
- Shadows.
- Motion durations/easing.
- Breakpoints.
- Layer/z-index scale.

Components should use semantic token names rather than raw color values. Verify contrast in every interactive state.

### 8.2 Required primitives

Build and test these primitives before broad page migration:

- Button and icon button.
- Text input, textarea, select, checkbox, and date/time inputs.
- Form field with label, hint, required state, and error association.
- Alert and toast.
- Badge/status badge.
- Dialog/modal.
- Dropdown/menu.
- Tabs.
- Data table.
- Pagination.
- Skeleton/loading indicator.
- Empty state.
- Confirmation dialog.
- Page header and action group.
- Visually hidden text utility.

### 8.3 Dialog requirements

Every dialog must:

- Move focus to an appropriate element when opened.
- Trap focus while open.
- Close on Escape unless the operation makes that unsafe.
- Restore focus to the opener.
- Have a programmatic title and optional description.
- Prevent background interaction.
- Confirm destructive actions with specific entity language.
- Avoid nested dialogs where possible.

Prefer a tested accessible primitive library if it fits the project rather than maintaining custom focus-management code.

### 8.4 Tables

Data tables must support:

- Semantic headers and captions or accessible names.
- Loading, empty, error, and partial-data states.
- Server-driven pagination for large collections.
- Sort indicators with accessible state.
- Responsive treatment that preserves meaning.
- Row actions accessible by keyboard.
- Stable column definitions.
- Optional URL-backed filters.

Do not convert tables into unlabeled card layouts on mobile without preserving field names.

## 9. Feature-by-feature reconstruction

### 9.1 Application shell

Current problems:

- Navigation derives authority from browser storage.
- Sidebar behavior is embedded in the main application component.
- No route-level loading, denial, or not-found handling.

Target:

- Extract `AppShell`, `Sidebar`, `MobileNavigation`, and `UserMenu`.
- Generate navigation from the centralized permission model.
- Display authenticated organization and user context.
- Provide server-backed logout.
- Support responsive navigation and keyboard access.

Acceptance criteria:

- Anonymous users never see protected content during session checks.
- Navigation contains only permitted destinations.
- Typing a forbidden URL produces a 403 state.
- Logout invalidates the server session and clears query cache.

### 9.2 Landing page

Current problems:

- Marketing claims exceed implemented behavior.
- “Start Free” implies an approved commercial/self-service model.

Target:

- Align copy with the actual release stage.
- Use an appropriate CTA: demo, request access, join waitlist, or sign in.
- Add real product screenshots only when workflows are stable.
- Add privacy, terms, support, and status links before public launch.

Acceptance criteria:

- Every product claim is supportable by released functionality.
- CTA matches the approved provisioning model.
- Page meets performance and accessibility budgets.

### 9.3 Login, signup, and recovery

Target:

- Remove role selector from login.
- Restrict signup according to the approved provisioning model.
- Implement invitation acceptance if required.
- Use token-based recovery.
- Add accessible validation and uniform security-conscious responses.
- Redirect authenticated users safely.

Critical tests:

- Valid and invalid login.
- Expired session.
- Disabled account.
- Invitation expiry.
- Reset token expiry and reuse.
- Rate-limit response.
- Open-redirect prevention for return paths.

### 9.4 Maintenance requests

This is the highest-value feature and should become the reference implementation for the new architecture.

Decompose into:

- Request list route.
- Request filters.
- Request table.
- Request detail route or panel.
- Create/edit request form.
- Assignment control.
- Status transition control.
- Notes timeline.
- Attachments.
- Audit/history timeline.

Rules:

- Use route parameters for request identity.
- Fetch detail independently of list state.
- Derive available actions from server-returned permissions or transition capabilities.
- Require confirmation and reason where workflow demands it.
- Preserve form drafts or warn before losing changes.
- Use concurrency version/ETag for updates.

Acceptance criteria:

- Requester, technician, manager, and administrator each see only permitted data and actions.
- Illegal transitions cannot be triggered through the UI or API.
- Refreshing a detail URL preserves context.
- Failed mutations retain safe user input.
- Notes identify author and timestamp.
- History distinguishes assignments, edits, and status transitions.

### 9.5 Technician dashboard

Target:

- Query only server-authorized tasks assigned to the current technician.
- Separate overdue, due today, upcoming, on-hold, and completed work using approved definitions.
- Optimize primary actions for mobile and touch.
- Provide safe start, pause, resume, and complete actions.
- Show offline/network state if mobile field usage is expected.

Acceptance criteria:

- Tasks assigned to other technicians never appear.
- Counts use canonical statuses.
- All displayed totals reconcile with the visible filter rules.
- Completion captures required duration, note, attachment, or verification fields.

### 9.6 Equipment and machine tools

Target:

- Consolidate equipment concepts and clarify whether “Machine & Tools” is a filtered equipment view or a separate entity.
- Add detail routes with maintenance history.
- Use server pagination and search.
- Support archive/deactivate instead of destructive deletion where history exists.
- Display warranties and dates with explicit states.

Acceptance criteria:

- Equipment identity and serial-number uniqueness errors are handled clearly.
- Users cannot delete records needed by maintenance history.
- Detail history reconciles with maintenance requests.
- Edit conflicts are detected.

### 9.7 Work centers

Target:

- Separate list, detail, and edit responsibilities.
- Validate numeric ranges consistently with the backend.
- Prevent self-alternatives and invalid relationships.
- Explain cost, capacity, efficiency, and OEE fields with units.
- Do not imply calculated OEE if only a target is stored.

Acceptance criteria:

- Invalid numeric and alternative configurations are blocked accessibly.
- Inactive centers remain visible in history but unavailable for new scheduling where appropriate.
- All displayed units and formulas are documented.

### 9.8 Teams and users

Target:

- Replace per-team request waterfalls with suitable aggregate endpoints or controlled parallel queries.
- Add clear member management permissions.
- Prevent duplicate or invalid membership.
- Confirm removal consequences.
- Separate user identity from organization membership and role.

Acceptance criteria:

- Only authorized roles can manage teams.
- Membership actions update relevant cached views correctly.
- Users from another organization cannot be discovered or added.
- Removing a member does not silently orphan active assignments.

### 9.9 Calendar and scheduling

Target:

- Use real scheduled start/end timestamps.
- Query by visible date range.
- Calculate localized week/month labels.
- Provide timezone context.
- Offer an accessible agenda/list alternative.
- Handle overlaps, all-day work, and unscheduled requests.

Acceptance criteria:

- Events appear at persisted times without invented defaults.
- Week numbers and navigation are correct across year boundaries.
- Visible-range navigation triggers the correct query.
- Keyboard and screen-reader users can access equivalent event information.

### 9.10 Dashboards and analytics

Target:

- Fetch metrics from purpose-built aggregate endpoints when datasets grow.
- Display metric definitions and time ranges.
- Provide accessible text/table alternatives for charts.
- Avoid loading all users, equipment, teams, and requests merely to calculate totals in the browser.

Acceptance criteria:

- Every metric matches documented backend calculations.
- Charts handle zero, one, large, and partial datasets.
- Timezone boundaries are tested.
- Administrative metrics are unavailable to unauthorized users.

## 10. Accessibility plan

Target WCAG 2.2 AA for product-critical journeys.

### 10.1 Required baseline

- Logical heading hierarchy.
- Keyboard access to every action.
- Visible focus indicators.
- Skip link to main content.
- Correct landmarks.
- Labels and descriptions for form controls.
- Errors associated with affected inputs.
- Status announcements through appropriate live regions.
- Sufficient color contrast.
- Meaning not conveyed through color alone.
- Reflow at 320 CSS pixels without loss of critical functionality.
- Reduced-motion support.
- Accessible names and text equivalents for icons and charts.

### 10.2 Verification

- Automated `axe` checks in component and end-to-end tests.
- Keyboard-only review of every critical journey.
- Screen-reader smoke tests for authentication, request creation, assignment, status update, and calendar agenda.
- Contrast validation for every design token combination.
- Manual zoom and reflow testing.

Automated checks do not replace manual accessibility review.

## 11. Responsive and mobile strategy

Define supported breakpoints from content behavior rather than device brands.

Priority mobile workflows:

- Login and recovery.
- Technician task list.
- Request detail.
- Start/pause/complete work.
- Add notes and attachments.
- Search equipment.
- View schedule agenda.

Requirements:

- Touch targets of at least the approved accessible size.
- No hover-only actions.
- Sticky actions only when they do not obscure content.
- Tables transform predictably or allow meaningful horizontal navigation.
- Forms use appropriate input types and autocomplete.
- Mobile navigation preserves current route and session actions.

Offline functionality should be treated as a separate product decision. Do not add service-worker mutation queues without a conflict and data-protection design.

## 12. Performance plan

### 12.1 Initial budgets

Proposed production budgets on representative mid-tier mobile conditions:

| Metric | Initial target |
|---|---:|
| Initial JavaScript, gzip | Under 150 KB where practical |
| Initial CSS, gzip | Under 25 KB |
| Largest Contentful Paint | Under 2.5 seconds |
| Interaction to Next Paint | Under 200 ms |
| Cumulative Layout Shift | Under 0.1 |
| Route transition feedback | Under 100 ms |

Budgets should be measured on the deployed application, not inferred from build output alone.

### 12.2 Required improvements

- Route-level code splitting.
- Lazy-load admin analytics and heavy calendar code.
- Remove duplicated CSS.
- Avoid fetching entire collections for dashboard totals.
- Add server pagination.
- Memoize only measured expensive calculations.
- Prevent duplicate Strict Mode requests through query deduplication.
- Optimize images and fonts; define fallback behavior.
- Analyze bundle composition in CI or scheduled checks.

## 13. Frontend security requirements

- No secrets in Vite environment variables or bundles.
- No authentication tokens in browser storage when cookie sessions are used.
- Encode untrusted content by default; avoid raw HTML rendering.
- Validate return URLs as same-origin application paths.
- Use CSP and related response headers from hosting/API layers.
- Do not log passwords, reset tokens, session data, or sensitive record content.
- Clear sensitive query cache on logout and organization changes.
- Treat filenames and attachment metadata as untrusted.
- Prevent clickjacking through server headers.
- Protect cookie-session mutations against CSRF.

## 14. Testing strategy

### 14.1 Tooling

- Vitest for unit tests.
- React Testing Library for components and feature behavior.
- Mock Service Worker for deterministic API boundaries in frontend tests.
- Playwright for browser journeys.
- `axe-core` integration for automated accessibility checks.

Avoid snapshot-heavy testing. Prefer user-visible behavior and stable contracts.

### 14.2 Unit coverage

Test:

- Permission helpers.
- Status configuration and transition presentation.
- Date/time formatting.
- Metric formatting and empty states.
- Error normalization.
- Environment validation.
- Query-key factories.
- Form schemas.

### 14.3 Component coverage

Test every shared primitive for:

- Keyboard behavior.
- Disabled and pending states.
- Accessible names and relationships.
- Validation behavior.
- Focus handling.
- Error and empty states.

### 14.4 Feature integration coverage

Each feature should cover:

- Successful loading.
- Loading indication.
- Empty data.
- Retryable error.
- Validation failure.
- Permission denial.
- Mutation success and cache update.
- Mutation conflict.
- Session expiration.

### 14.5 End-to-end critical journeys

1. Anonymous visitor cannot access `/app`.
2. Authenticated user returns to intended route after login.
3. Requester creates and reviews a request.
4. Manager assigns a technician.
5. Technician sees only assigned work and completes it.
6. Manager verifies and closes the request.
7. Administrator manages team membership.
8. User resets password through a valid token.
9. Expired reset token is rejected safely.
10. Forbidden routes show permission denial.
11. Session expiry preserves no protected content.
12. Calendar navigation loads the correct range.

Run critical journeys against a real deployed preview with a disposable test database before production release.

## 15. Observability and product analytics

### 15.1 Error monitoring

Capture:

- Unhandled exceptions.
- Error-boundary failures.
- Failed API requests with status, endpoint template, and request ID.
- Route and release version.
- Browser/device context within privacy constraints.

Do not send passwords, tokens, notes, or sensitive operational values to monitoring services.

### 15.2 Product analytics

Instrument only approved, privacy-conscious events such as:

- Login completed or failed by non-sensitive reason category.
- Request creation completed.
- Assignment completed.
- Status transition completed.
- Calendar view used.
- Form abandoned at a coarse workflow stage.

Define event names and properties centrally. Do not use analytics as an audit log.

## 16. CI and release gates

Every frontend pull request must pass:

1. Locked dependency install.
2. Formatting check.
3. ESLint.
4. TypeScript check.
5. Unit and component tests.
6. Accessibility checks on changed critical components.
7. Production build.
8. Bundle-budget check.
9. Dependency/security scan under an approved policy.

Protected-branch or release validation must additionally pass:

- Playwright critical journeys.
- Preview-environment API integration.
- Responsive viewport tests.
- Production environment-variable validation.
- Post-deployment frontend/API smoke test.
- Error-monitoring release registration.

## 17. Phased migration plan

### Phase F0: Containment and baseline

**Duration:** 2–3 days  
**Dependencies:** Backend security work coordinated in parallel

#### Work

- Remove Admin and Manager from public signup immediately.
- Remove role selector from login.
- Mark current public deployment as demo-only.
- Document supported browsers and Node/npm versions.
- Stop tracking generated `client/dist` output.
- Establish the frontend issue board and ownership.

#### Exit criteria

- Public UI no longer offers privileged registration.
- Generated build changes do not pollute source-control reviews.
- Product and engineering agree that the current client is not a security boundary.

### Phase F1: Tooling and application skeleton

**Duration:** 3–5 days

#### Work

- Add TypeScript alongside existing JSX.
- Add ESLint and Prettier.
- Add Vitest, React Testing Library, MSW, Playwright, and `axe` integration.
- Add CI jobs.
- Introduce provider composition and an error boundary.
- Add environment parsing and production configuration validation.
- Add 404 and generic application-error routes.

#### Exit criteria

- CI runs from a clean checkout.
- A failing lint, type, test, accessibility, or build check blocks merge.
- Application-level unexpected errors produce a recoverable fallback.

### Phase F2: Session and route security UX

**Duration:** 1–2 weeks  
**Dependency:** Backend session endpoints

#### Work

- Implement `SessionProvider` and session query.
- Implement protected and permission-aware routes.
- Replace browser-storage identity.
- Implement server-backed logout.
- Normalize authentication errors and redirects.
- Rebuild password recovery around reset tokens.
- Clear protected caches on logout/session expiration.

#### Exit criteria

- No protected screen flashes before authentication completes.
- Browser-state forgery does not alter effective access.
- Expired sessions redirect predictably and clear sensitive cached data.
- Auth browser journeys pass.

### Phase F3: API/query foundation

**Duration:** 1 week  
**Can overlap:** Late F2

#### Work

- Add hardened API client.
- Add TanStack Query and feature query-key factories.
- Add normalized application errors.
- Establish URL-backed list state conventions.
- Create global toast and contextual error patterns.
- Add MSW handlers for current API contracts.

#### Exit criteria

- Pages no longer implement duplicate ad hoc loading/error fetch logic.
- Safe reads retry predictably; unsafe mutations do not retry automatically.
- Session, permission, validation, conflict, and server errors have defined behavior.

### Phase F4: Design system and accessibility primitives

**Duration:** 1–2 weeks  
**Can overlap:** F3

#### Work

- Extract design tokens.
- Implement core UI primitives.
- Adopt an accessible dialog/menu foundation.
- Add focus, keyboard, live-region, and reduced-motion behavior.
- Begin removing duplicated CSS and inline styles.
- Add Storybook only if the team will actively maintain it; it is optional.

#### Exit criteria

- New feature work uses approved primitives.
- Dialogs and forms pass keyboard and automated accessibility tests.
- No new raw color/spacing values are introduced without design-system review.

### Phase F5: Maintenance request reference feature

**Duration:** 2–3 weeks  
**Dependencies:** Stable authenticated maintenance APIs

#### Work

- Split list and detail routes.
- Add typed schemas and query hooks.
- Rebuild create/edit form.
- Implement assignment and status transition controls.
- Add authored notes, history, attachments as supported.
- Add pagination, filters, URL state, and conflict handling.
- Write comprehensive feature and E2E tests.

#### Exit criteria

- The request feature meets all role, accessibility, responsive, error, and test requirements.
- It becomes the template for subsequent feature migrations.

### Phase F6: Operational feature migration

**Duration:** 3–5 weeks

Migrate in this order:

1. Technician dashboard.
2. Equipment and machine tools.
3. Work centers.
4. Teams and users.
5. Calendar.
6. Admin and general dashboards.

For every feature:

- Define permissions and data contract.
- Migrate types and query hooks.
- Replace bespoke controls with UI primitives.
- Add loading, empty, error, conflict, and permission states.
- Add component and E2E coverage.
- Delete superseded code and CSS in the same change.

#### Exit criteria

- No feature relies on `sessionStorage` identity.
- No migrated page performs raw API fetching in page-level effects.
- Canonical domain values are used everywhere.
- Critical journeys pass on desktop and mobile viewports.

### Phase F7: Performance, polish, and beta hardening

**Duration:** 1–2 weeks

#### Work

- Add route-level code splitting.
- Optimize dashboard aggregation and calendar loading.
- Complete CSS deduplication.
- Verify Core Web Vitals in deployed staging.
- Conduct keyboard, screen-reader, zoom, and reflow reviews.
- Add frontend monitoring and approved analytics.
- Run cross-browser and slow-network testing.
- Complete release and rollback documentation.

#### Exit criteria

- Performance budgets pass in deployed staging.
- No critical/high accessibility findings remain.
- Monitoring identifies release version and failed API journeys.
- Product, QA, security, and operations approve beta release.

## 18. Ticket-ready work breakdown

### Epic FE-1: Frontend foundation

- FE-101: Add TypeScript configuration and strict compiler settings.
- FE-102: Add ESLint and Prettier with CI enforcement.
- FE-103: Add Vitest and React Testing Library setup.
- FE-104: Add MSW test server and shared API fixtures.
- FE-105: Add Playwright configuration and preview test environment.
- FE-106: Add root error boundary and recovery screen.
- FE-107: Add environment schema validation.
- FE-108: Remove committed distribution artifacts.

### Epic FE-2: Authentication and routes

- FE-201: Implement session types and session query.
- FE-202: Implement `SessionProvider`.
- FE-203: Implement authenticated route guard.
- FE-204: Implement permission route guard and 403 page.
- FE-205: Remove login role selector.
- FE-206: Restrict signup UI to approved provisioning path.
- FE-207: Implement server-backed logout and cache clearing.
- FE-208: Rebuild password-reset token flow.
- FE-209: Add authentication E2E suite.

### Epic FE-3: API and state

- FE-301: Harden API client and credential behavior.
- FE-302: Normalize API errors.
- FE-303: Configure query client defaults.
- FE-304: Define feature query-key convention.
- FE-305: Add global session-expiry handling.
- FE-306: Add toast and mutation feedback patterns.
- FE-307: Add URL filter/pagination utilities.

### Epic FE-4: Design system

- FE-401: Extract visual design tokens.
- FE-402: Implement button and icon-button primitives.
- FE-403: Implement form controls and accessible form field.
- FE-404: Implement dialog and confirmation patterns.
- FE-405: Implement alerts and toasts.
- FE-406: Implement badges and canonical status badge.
- FE-407: Implement data table and pagination.
- FE-408: Implement loading, skeleton, empty, and error states.
- FE-409: Add accessibility tests for all primitives.

### Epic FE-5: Maintenance requests

- FE-501: Define request schemas, types, and status configuration.
- FE-502: Build request list query and URL filters.
- FE-503: Build request detail route and query.
- FE-504: Rebuild request form with validation.
- FE-505: Build assignment control.
- FE-506: Build transition control from server capabilities.
- FE-507: Build notes and history timeline.
- FE-508: Add conflict and unsaved-change handling.
- FE-509: Add request feature integration tests.
- FE-510: Add role-based request E2E journeys.

### Epic FE-6: Remaining features

- FE-601: Rebuild technician dashboard and task filters.
- FE-602: Rebuild equipment list/detail/forms.
- FE-603: Rebuild work-center list/detail/forms.
- FE-604: Rebuild team and membership management.
- FE-605: Rebuild calendar with real ranges and agenda view.
- FE-606: Rebuild admin dashboard using aggregate endpoints.
- FE-607: Rebuild general dashboard metrics.
- FE-608: Align landing-page claims and public navigation.

### Epic FE-7: Release quality

- FE-701: Add route-level lazy loading.
- FE-702: Establish and enforce bundle budgets.
- FE-703: Complete CSS deduplication and dead-style removal.
- FE-704: Add frontend error monitoring.
- FE-705: Add approved product analytics.
- FE-706: Run accessibility remediation audit.
- FE-707: Run responsive and cross-browser review.
- FE-708: Add production smoke tests and release checklist.

## 19. Pull-request completion checklist

Every frontend change should answer yes to applicable items:

- Does the change use canonical domain types and labels?
- Are security decisions still enforced by the backend?
- Are loading, empty, error, denied, and success states handled?
- Does the UI work with keyboard only?
- Is focus behavior correct?
- Are accessible names and error relationships present?
- Is responsive behavior verified?
- Are API requests cancellable and cache behavior correct?
- Are user inputs preserved safely after recoverable failure?
- Are unit/component tests included?
- Is a critical journey E2E test updated when appropriate?
- Does the production build pass?
- Did bundle size or performance change materially?
- Were superseded code and styles removed?
- Does documentation match actual behavior?

## 20. Frontend definition of done

A frontend feature is complete only when:

- Its approved user outcome and acceptance criteria are satisfied.
- Its API contract is typed and validated at the boundary.
- Its routes enforce authenticated and permission-aware UX.
- Server authorization has corresponding negative tests outside the frontend scope.
- Loading, empty, error, permission, conflict, and success states are designed.
- Keyboard, focus, reflow, contrast, and screen-reader behavior meet the agreed baseline.
- Responsive behavior is verified on supported viewport sizes.
- Unit/component tests cover important states.
- Critical workflows are covered by Playwright.
- Error monitoring can diagnose unexpected failures without leaking sensitive data.
- No obsolete code, styles, or feature flags remain unless explicitly tracked for removal.

## 21. Beta release gate

The frontend is ready for a controlled product beta only when:

- No identity or privilege decision depends on editable browser storage.
- Protected routes use a verified server session.
- Login has no role selector and public signup cannot create privileged accounts.
- Password recovery uses a secure server token workflow.
- Maintenance requests use the canonical tested workflow.
- Technician task filtering is correct.
- Scheduling uses persisted timestamps and calculated date labels.
- Dashboard metrics use approved definitions.
- Core UI components meet accessibility requirements.
- CI enforces linting, type checking, tests, accessibility checks, and production build.
- Critical Playwright journeys pass against staging.
- Deployed frontend connects to the deployed API without a localhost fallback.
- Frontend errors and releases are observable.
- Performance budgets pass in the deployed environment.
- Product, QA, security, and operations approve release.

## 22. Recommended first sprint

### Sprint objective

Create the frontend foundation for a server-authenticated vertical slice without attempting to migrate all existing screens.

### Sprint scope

1. Add TypeScript, linting, formatting, Vitest, React Testing Library, MSW, and CI.
2. Add environment validation and remove the production localhost fallback.
3. Add the application provider structure and error boundary.
4. Implement session loading and protected-route scaffolding against an agreed mock/API contract.
5. Remove role selection from login and privileged choices from signup.
6. Add 403 and 404 states.
7. Build accessible Button, FormField, Input, Alert, and Dialog primitives.
8. Add tests for session states, login, protected routing, and permission denial.

### Sprint acceptance criteria

- A clean checkout passes the frontend CI pipeline.
- Production configuration fails clearly when the API origin is absent.
- Protected routes render no protected content before session verification.
- Anonymous visitors are redirected with a safe return path.
- Forbidden users see a defined 403 page.
- Authentication controls contain no client-selected role escalation.
- The first shared primitives pass keyboard and automated accessibility tests.

## 23. Final recommendation

Use the maintenance-request workflow as the reference feature after completing the session, query, and UI foundations. Migrate remaining features only after that reference implementation passes role-based, accessibility, responsive, error-state, and end-to-end tests.

The frontend should not be judged product-ready because it looks polished or compiles successfully. It is product-ready when it renders only verified session state, handles failure predictably, expresses correct domain behavior, remains accessible across supported devices, and is protected by repeatable release gates.
