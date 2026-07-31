# GearGuard Manager Frontend Implementation Plan

**Status:** Proposed execution plan  
**Date:** July 31, 2026  
**Scope:** Manager-facing frontend only  
**Related plans:** `FRONTEND_IMPROVEMENT_PLAN.md`, `PRODUCT_READINESS_REPORT.md`

## 1. Objective

Build a focused Manager workspace that helps maintenance managers triage incoming work, assign technicians, monitor schedules and workload, manage operational assets, and verify completed maintenance.

The Manager experience must not be treated as a renamed Admin dashboard. Administration concerns such as account provisioning, global role management, security settings, and system audit configuration belong to a separate Admin surface.

## 2. Manager persona

### Primary responsibilities

- Review and triage incoming maintenance requests.
- Set priority, schedule, maintenance team, and responsible technician.
- Monitor active, overdue, blocked, and unassigned work.
- Balance technician workload.
- Verify completed work before closure.
- Maintain equipment, work-center, and maintenance-team records where permitted.
- Review operational metrics and identify recurring issues.

### Manager is not automatically allowed to

- Create or promote system administrators.
- Change organization-wide security settings.
- Access another organization’s data.
- Delete immutable maintenance history.
- Reset other users’ passwords directly.
- Modify system-level permission definitions.

The backend must enforce these boundaries. Frontend permission checks are for navigation and usability only.

## 3. Manager outcomes

The first Manager release should answer five questions immediately:

1. What needs attention now?
2. Which requests are unassigned or overdue?
3. Who has capacity to take the work?
4. What is scheduled today and this week?
5. Which completed jobs require verification?

## 4. Proposed information architecture

```text
/app/manager
  /overview
  /requests
    /new
    /:requestId
    /:requestId/edit
  /schedule
  /team
    /workload
    /:teamId
  /equipment
    /new
    /:equipmentId
    /:equipmentId/edit
  /work-centers
    /new
    /:workCenterId
    /:workCenterId/edit
  /reports
  /settings
```

Initial MVP routes:

- `/app/manager/overview`
- `/app/manager/requests`
- `/app/manager/requests/:requestId`
- `/app/manager/schedule`
- `/app/manager/team/workload`
- `/app/manager/equipment`
- `/app/manager/work-centers`

Reports and manager settings should remain deferred until their data and requirements are approved.

## 5. Navigation model

Manager sidebar order:

1. Overview
2. Requests
3. Schedule
4. Team workload
5. Equipment
6. Work centers
7. Teams

Global shell actions:

- Organization identity.
- Current manager identity.
- Notifications when implemented.
- Help/support entry.
- Logout.

The current Manager-to-Admin redirect must be removed. Managers should land on `/app/manager/overview`; administrators should retain a separate route.

## 6. Manager overview

### Purpose

Provide an action-oriented operational summary rather than decorative analytics.

### Page layout

#### Attention queue

Display actionable counts with direct filtered links:

- Unassigned requests.
- Overdue requests.
- High/critical priority requests.
- Work currently on hold.
- Completed work awaiting verification.

#### Today’s schedule

- Scheduled jobs ordered by start time.
- Technician and equipment/work-center context.
- Conflict or unassigned indicators.
- Link to full schedule.

#### Team workload

- Technician.
- Active assigned jobs.
- Estimated scheduled hours.
- Overdue jobs.
- Availability/capacity status when supported.

#### Recent activity

- Request created.
- Assignment changed.
- Status changed.
- Completion submitted.
- Verification completed.

### Metric rules

Every card must have a documented definition. Do not calculate “utilization” from the percentage of requests assigned. Do not label equipment as critical merely because it has an open request.

### Overview acceptance criteria

- Counts reconcile with their linked filtered lists.
- Data is scoped to the manager’s organization.
- Each attention item leads to a concrete action.
- Loading, empty, partial-error, and permission states are supported.
- Overview does not download complete datasets merely to calculate totals.

## 7. Request management

This is the first and most important Manager vertical slice.

### 7.1 Request list

Columns:

- Request reference.
- Subject.
- Equipment or work center.
- Priority.
- Status.
- Team.
- Technician.
- Scheduled start.
- Age or SLA state.

Filters:

- Search.
- Status.
- Priority.
- Request type.
- Assigned/unassigned.
- Team.
- Technician.
- Equipment/work center.
- Scheduled date range.
- Overdue only.
- Awaiting verification.

List behavior:

- Server-side pagination.
- Server-side sorting.
- URL-backed filter state.
- Saved views deferred unless validated.
- Clear empty and no-result states.
- Row click navigates to a stable detail URL.

### 7.2 Request detail

Header:

- Request reference and subject.
- Canonical status badge.
- Priority.
- Primary allowed action.
- Secondary action menu.

Main information:

- Description/problem statement.
- Equipment or work center.
- Request type.
- Reporter.
- Created date.
- Schedule.
- Team and assignee.
- Estimated and actual duration.
- Attachments when supported.

Supporting panels:

- Assignment.
- Status timeline.
- Authored notes.
- Activity/audit history.
- Related maintenance history.

### 7.3 Triage workflow

Manager triage should support:

1. Review submitted request.
2. Confirm or change equipment/work center.
3. Set priority.
4. Select maintenance team.
5. Set schedule.
6. Assign technician or leave explicitly unassigned.
7. Add triage note.
8. Move to the approved next status.

Do not distribute this across several unrelated modals. Prefer a clear triage panel or guided form with one transactional submission where the backend supports it.

### 7.4 Assignment workflow

The assignment control should display:

- Eligible technicians only.
- Team membership.
- Current active workload.
- Schedule conflict warning.
- Relevant skill/certification later if modeled.

The API remains responsible for determining eligibility. The frontend must handle conflicts where another manager changed the assignment concurrently.

### 7.5 Verification workflow

When a technician submits completion, the Manager can:

- Review completion note.
- Review actual duration.
- Review attachments/evidence.
- Verify and close.
- Return for additional work with a required reason.

Every action must create history and identify the actor.

### Request acceptance criteria

- Manager can find an unassigned request through a URL-shareable filter.
- Manager can triage and assign it without re-entering existing data.
- Two managers cannot silently overwrite each other’s changes.
- Illegal status transitions are not presented and are rejected by the API.
- Mutation errors preserve safe user input.
- History displays assignment and status actors and timestamps.
- Keyboard-only users can complete triage and verification.

## 8. Schedule

### Views

- Week view.
- Month view.
- Accessible agenda/list view.

### Requirements

- Persist actual scheduled start/end timestamps.
- Fetch only the visible range.
- Display organization/user timezone.
- Calculate week number dynamically.
- Show unassigned scheduled work clearly.
- Show overlapping technician assignments.
- Filter by team, technician, status, priority, and equipment/work center.
- Open request detail from an event.

Drag-and-drop rescheduling should be deferred until keyboard-accessible behavior, conflict handling, and backend concurrency are designed. The first release can use an explicit reschedule dialog.

### Schedule acceptance criteria

- Events appear at persisted times without invented defaults.
- Navigation across month/year boundaries remains correct.
- Agenda view contains equivalent information and actions.
- Timezone is visible and tested.
- Conflicting updates produce a recoverable conflict message.

## 9. Team workload

### Purpose

Help Managers make assignment decisions without pretending request count equals capacity.

### Initial workload model

Display:

- Technician name.
- Active assigned count.
- Scheduled hours within selected range.
- Overdue count.
- Work on hold.
- Next scheduled job.

If capacity or shifts are not modeled, label the view “Assigned workload,” not “utilization.”

### Interactions

- Select date range.
- Filter by team.
- Open technician’s assigned request list.
- Begin assignment from an unassigned request.

### Workload acceptance criteria

- Totals reconcile with assigned request lists.
- Data is provided by approved aggregate/list APIs.
- Technicians outside the organization are never visible.
- The UI avoids unsupported availability or productivity claims.

## 10. Equipment and work centers

Manager access should include operational management but not destructive removal of maintenance history.

### Equipment

- Searchable, paginated list.
- Active/inactive and criticality filters.
- Detail with maintenance history.
- Create/edit form.
- Deactivate/archive behavior.
- Warranty and assignment information.

### Work centers

- Searchable status-aware list.
- Detail and maintenance history.
- Create/edit form.
- Alternative work-center management.
- Explicit units for capacity, cost, efficiency, and OEE target.

### Acceptance criteria

- Archived records remain visible in historical requests.
- Invalid numeric ranges and alternative relationships are rejected accessibly.
- Serial-number and code conflicts show actionable field errors.
- Concurrent edits cannot silently overwrite each other.

## 11. Manager permissions

Proposed frontend capability identifiers:

```text
manager:overview:view
request:list
request:view
request:create
request:triage
request:assign
request:schedule
request:verify
request:return
equipment:list
equipment:view
equipment:create
equipment:update
equipment:archive
work_center:list
work_center:view
work_center:create
work_center:update
work_center:archive
team:list
team:view
team:manage_members
workload:view
schedule:view
```

The frontend should call a centralized permission helper rather than comparing role strings throughout components.

## 12. Data contracts required from the backend

The Manager frontend depends on server contracts that do not fully exist yet.

### Session

```text
GET /api/auth/session
```

Must return authenticated user, organization, and safe permission information.

### Manager overview

```text
GET /api/manager/overview?from=&to=
```

Should return aggregate counts, today’s schedule, workload summary, and recent activity without downloading every entity.

### Request list

```text
GET /api/maintenance?page=&page_size=&search=&status=&priority=&team_id=&assigned_to=&from=&to=&overdue=
```

Must return results, pagination metadata, and applied sort.

### Request detail/capabilities

```text
GET /api/maintenance/:id
```

Should include current version and allowed actions/transitions for the authenticated user.

### Triage and assignment

Prefer transactional endpoints or version-aware mutations:

```text
PATCH /api/maintenance/:id/triage
PATCH /api/maintenance/:id/assignment
PATCH /api/maintenance/:id/schedule
PATCH /api/maintenance/:id/status
```

### Workload

```text
GET /api/manager/workload?team_id=&from=&to=
```

### Calendar

```text
GET /api/maintenance/calendar?start=&end=&team_id=&technician_id=
```

Frontend implementation can use MSW mocks while these contracts are developed, but production integration must not fake missing guarantees.

## 13. Component structure

```text
features/manager/
  overview/
    ManagerOverviewPage.tsx
    AttentionQueue.tsx
    TodaySchedule.tsx
    TeamWorkloadSummary.tsx
    RecentActivity.tsx
    api.ts
    queries.ts
    types.ts
  requests/
    ManagerRequestListPage.tsx
    ManagerRequestDetailPage.tsx
    RequestFilters.tsx
    RequestTable.tsx
    TriagePanel.tsx
    AssignmentControl.tsx
    VerificationPanel.tsx
  schedule/
    ManagerSchedulePage.tsx
    ScheduleFilters.tsx
    WeekView.tsx
    MonthView.tsx
    AgendaView.tsx
  workload/
    TeamWorkloadPage.tsx
    WorkloadTable.tsx
    WorkloadFilters.tsx
```

Shared domain components should remain in their feature domain rather than being placed under `manager` when technicians or administrators also use them.

## 14. State model

- Server data: TanStack Query.
- Filters, pagination, sort, date range: URL search parameters.
- Form state: form library/local state with Zod validation.
- Dialog visibility and transient selections: component state.
- Authentication/session: SessionProvider backed by server query.
- Permissions: centralized derived helper.

Do not store server records or permissions in browser storage.

## 15. Accessibility requirements

- WCAG 2.2 AA target for Manager critical journeys.
- Visible keyboard focus.
- Accessible sidebar and mobile navigation.
- Semantic headings and landmarks.
- Data tables with proper header relationships.
- Filter controls with labels and clear-reset action.
- Dialog focus trap, Escape behavior, and focus restoration.
- Live announcements for assignment/status success or failure.
- Chart equivalents in text/table form.
- Status not conveyed by color alone.
- Reflow and zoom support.
- Reduced-motion support.

## 16. Responsive behavior

### Desktop

- Persistent sidebar.
- Multi-column overview.
- Full request table.
- Detail layout with supporting side panel.

### Tablet

- Collapsible navigation.
- Reduced overview columns.
- Horizontally manageable tables or prioritized columns.

### Mobile

- Drawer navigation.
- Attention queue and primary actions first.
- Request list cards with explicit field labels where table layout is unsuitable.
- Sticky primary action only when it does not obscure content.
- Agenda schedule as the default calendar representation.

## 17. Error and edge states

Every Manager feature must cover:

- Initial loading.
- Empty organization.
- No filtered results.
- Partial overview failure.
- Network unavailable.
- Session expired.
- Permission denied.
- Validation failure.
- Concurrent edit conflict.
- Rate limited.
- Server failure with request ID.
- Record archived or deleted while open.
- Technician removed after assignment.
- Equipment deactivated while request remains active.

## 18. Testing plan

### Unit tests

- Permission mapping.
- Status labels and allowed-action presentation.
- Filter serialization.
- Date/time formatting.
- Workload and metric formatting.
- Form schemas.
- Error normalization.

### Component tests

- Attention queue loading/empty/error states.
- Request filters and reset behavior.
- Assignment eligibility and conflict behavior.
- Triage validation.
- Verification return reason requirement.
- Dialog keyboard/focus behavior.
- Responsive navigation behavior.

### Manager end-to-end tests

1. Manager login lands on Manager overview, not Admin dashboard.
2. Anonymous visitor cannot access a Manager route.
3. Technician receives permission denial for Manager routes.
4. Manager opens unassigned requests from the attention queue.
5. Manager triages and assigns a request.
6. Manager reschedules a request.
7. Manager filters workload by team and date range.
8. Manager reviews technician completion and verifies it.
9. Manager returns incomplete work with a reason.
10. Concurrent request update produces a conflict rather than silent overwrite.
11. Session expiry removes protected data and redirects safely.
12. Core journey passes with keyboard-only interaction.

## 19. Implementation phases

### Phase M0: Manager definition and safety

**Duration:** 1–2 days

- Approve Manager responsibilities and permissions.
- Separate Manager and Admin destinations.
- Remove Manager/Admin selection from public signup and login as part of the security foundation.
- Approve canonical request statuses and priority definitions.
- Confirm MVP routes.

**Exit:** Product and engineering approve role and workflow boundaries.

### Phase M1: Manager shell and mocked contracts

**Duration:** 3–5 days

- Add Manager route tree.
- Add permission-aware navigation.
- Build Manager overview layout with MSW fixtures.
- Build loading, empty, partial-error, and permission states.
- Add responsive shell behavior.

**Exit:** Manager can navigate the full planned shell using stable mocked contracts.

### Phase M2: Request list and detail

**Duration:** 1–2 weeks

- Implement query layer and URL filters.
- Build paginated request table/list.
- Build stable detail route.
- Add canonical status and priority presentation.
- Add notes/history presentation.
- Add component and E2E tests.

**Exit:** Manager can reliably find and inspect work across refreshable URLs.

### Phase M3: Triage, assignment, and verification

**Duration:** 1–2 weeks

- Build triage panel/form.
- Build assignment control with workload context.
- Build schedule control.
- Build status actions from allowed server capabilities.
- Build completion verification/return workflow.
- Add conflict and unsaved-change handling.

**Exit:** A request can move from submission through assignment and verified completion using tested Manager actions.

### Phase M4: Schedule and workload

**Duration:** 1–2 weeks

- Build week, month, and agenda views.
- Add visible-range queries.
- Add schedule filters and rescheduling.
- Build assigned-workload view.
- Add timezone and conflict behavior.

**Exit:** Manager can plan work and make evidence-based assignments without fabricated utilization metrics.

### Phase M5: Equipment and work-center operations

**Duration:** 1–2 weeks

- Migrate equipment pages to typed query/form architecture.
- Add equipment detail and history.
- Migrate work-center pages.
- Add archive/deactivate behavior.
- Add concurrency and validation handling.

**Exit:** Manager can maintain operational reference data without breaking history.

### Phase M6: Hardening and beta gate

**Duration:** 3–5 days

- Accessibility review.
- Mobile/responsive review.
- Slow-network and error-state testing.
- Performance measurement.
- Monitoring instrumentation.
- Full Manager Playwright suite.

**Exit:** All Manager release criteria pass in staging.

## 20. Ticket-ready backlog

### Epic MG-1: Role and navigation

- MG-101: Define Manager permission constants and test matrix.
- MG-102: Add Manager route tree and default redirect.
- MG-103: Separate Manager and Admin navigation.
- MG-104: Build Manager sidebar and mobile navigation.
- MG-105: Add Manager route permission tests.

### Epic MG-2: Overview

- MG-201: Define Manager overview API contract and MSW fixture.
- MG-202: Build attention queue.
- MG-203: Build today’s schedule summary.
- MG-204: Build assigned-workload summary.
- MG-205: Build recent activity.
- MG-206: Add overview loading, empty, and partial-error behavior.
- MG-207: Add overview accessibility and responsive tests.

### Epic MG-3: Requests

- MG-301: Define request list query keys and typed filters.
- MG-302: Implement URL-backed request filters.
- MG-303: Build paginated Manager request table.
- MG-304: Build request detail route.
- MG-305: Build request information and status timeline.
- MG-306: Build authored notes and activity history.
- MG-307: Build triage form.
- MG-308: Build assignment control.
- MG-309: Build schedule control.
- MG-310: Build verification/return workflow.
- MG-311: Add concurrency conflict handling.
- MG-312: Add request Manager E2E suite.

### Epic MG-4: Schedule and workload

- MG-401: Define visible-range calendar query.
- MG-402: Build week view.
- MG-403: Build month view.
- MG-404: Build accessible agenda view.
- MG-405: Build explicit reschedule dialog.
- MG-406: Build workload date/team filters.
- MG-407: Build technician workload table.
- MG-408: Add schedule/workload E2E tests.

### Epic MG-5: Operational records

- MG-501: Rebuild Manager equipment list.
- MG-502: Build equipment detail/history.
- MG-503: Rebuild equipment create/edit form.
- MG-504: Rebuild work-center list and detail.
- MG-505: Rebuild work-center create/edit form.
- MG-506: Add archive/deactivate workflows.
- MG-507: Add operational-record integration tests.

### Epic MG-6: Release quality

- MG-601: Run Manager accessibility audit.
- MG-602: Complete mobile/responsive remediation.
- MG-603: Add Manager error-monitoring context.
- MG-604: Validate Manager performance budgets.
- MG-605: Add staging smoke test.
- MG-606: Complete Manager release checklist.

## 21. Manager MVP release criteria

The Manager frontend is ready for controlled beta only when:

- Manager and Admin are separate experiences.
- Manager identity comes from a verified server session.
- Manager routes and actions are permission-aware.
- Backend authorization protects every Manager action.
- Overview counts reconcile with filtered operational lists.
- Request filters are URL-backed and paginated.
- Triage, assignment, scheduling, verification, and return workflows are complete.
- Concurrent edits cannot be silently lost.
- Schedule uses persisted timestamps and exposes timezone.
- Workload labels reflect available data honestly.
- Loading, empty, error, denied, conflict, and expired-session states are tested.
- Manager critical journeys pass on desktop and mobile viewports.
- Keyboard and automated accessibility checks pass.
- Staging uses the real authenticated API and durable database.
- Error monitoring identifies failed Manager journeys without leaking sensitive data.

## 22. Recommended first implementation slice

Build this vertical slice first:

> A verified Manager signs in, lands on a dedicated Manager overview, opens the unassigned-request queue, views one request, triages it, assigns an eligible technician, and sees the overview and request list update correctly.

This slice requires the Manager route, permission boundary, overview contract, request list/detail, triage, assignment, query invalidation, error handling, and tests. It proves the architecture needed for the rest of the Manager experience without attempting to build every screen at once.

## 23. Recommended execution order

1. Approve Manager permissions and canonical workflow.
2. Complete session/protected-route frontend foundation.
3. Create Manager routes and navigation.
4. Implement the first Manager vertical slice.
5. Add completion verification.
6. Add schedule and workload.
7. Migrate equipment and work centers.
8. Harden accessibility, responsiveness, performance, and monitoring.

Do not begin with dashboard polish. The highest-value starting point is the tested request triage and assignment workflow; the overview should summarize and link into that real workflow.
