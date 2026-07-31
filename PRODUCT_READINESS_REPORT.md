# GearGuard Product Readiness Report and Improvement Plan

**Document status:** Proposed productization baseline  
**Assessment date:** July 31, 2026  
**Repository baseline:** `main` at `1f2fd7f`  
**Audience:** Product owners, engineering, QA, security, operations, and project sponsors

## 1. Executive summary

GearGuard currently demonstrates a coherent maintenance-management concept with a functional React interface and an Express/SQLite CRUD API. It is suitable as a hackathon demonstration and useful as a UX prototype. It is not suitable for production data or real organizational use.

The principal blockers are not cosmetic. The API has no real authentication, authorization is implemented only through editable browser state, public signup permits privileged roles, password reset can be invoked without a secure token, and the advertised Vercel persistence model uses an ephemeral SQLite database. The repository also has no automated test suite or CI quality gates.

Productization should therefore be treated as a controlled reconstruction of the security, data, and operational foundations while selectively retaining the existing UI and domain concepts. Continuing to add screens before completing these foundations would increase rework and risk.

### Current readiness score

| Area | Current | MVP target | Production target |
|---|---:|---:|---:|
| Product definition | 3/10 | 7/10 | 9/10 |
| Security | 1/10 | 7/10 | 9/10 |
| Data durability | 1/10 | 8/10 | 9/10 |
| Backend architecture | 3/10 | 7/10 | 8/10 |
| Frontend architecture | 4/10 | 7/10 | 8/10 |
| Workflow correctness | 4/10 | 7/10 | 9/10 |
| Testing | 0/10 | 7/10 | 9/10 |
| Observability and operations | 1/10 | 7/10 | 9/10 |
| Documentation | 2/10 | 7/10 | 8/10 |
| Overall release readiness | 1/10 | 7/10 | 9/10 |

### Recommendation

Do not onboard real organizations or store real operational data until Phases 0 through 4 of this plan are complete. The current public deployment should be described explicitly as a disposable demo.

## 2. Assessment scope and evidence

The assessment covered:

- Frontend routes, pages, state handling, API integration, and production build.
- Authentication, password reset, equipment, team, maintenance, and work-center API routes.
- SQLite schema initialization, migration behavior, demo seeding, and Vercel runtime behavior.
- Repository scripts, dependency manifests, generated artifacts, documentation, and test/configuration inventory.
- The public frontend and advertised health endpoint.
- The supplied Software Requirements Specification.

Verified boundaries as of the assessment date:

- The frontend production build succeeds.
- The public frontend responds successfully.
- The advertised `/api/health` endpoint on the public frontend host returns 404.
- No automated tests, CI workflow, lint configuration, or type-checking step are present.
- Before the Node 22 dependency upgrade, backend installation failed because the locked legacy SQLite dependency lacked a compatible prebuilt binary. The repository now targets Node 22 and a current native dependency; durable PostgreSQL persistence is still required before production use.
- The updated backend dependency tree reports zero known npm audit findings. The frontend audit still reports one React Router advisory as two affected packages; the vulnerable behavior is specific to React Server Components action handling, which this BrowserRouter SPA does not use. This exception must be removed when an unaffected compatible router release is available.

## 3. Product definition gaps

The repository implements features before defining the operating model. The following decisions must be made before the production schema and permission system are finalized.

### 3.1 Required product decisions

1. **Deployment model:** single organization, dedicated deployment per customer, or multi-tenant SaaS.
2. **User provisioning:** open signup, invitation-only signup, SSO, administrator provisioning, or a combination.
3. **Roles:** precise responsibilities and permissions for requester, technician, manager, administrator, auditor, and external contractor.
4. **Record ownership:** which organization owns equipment, requests, attachments, schedules, and audit records.
5. **Retention:** which records can be archived, deleted, anonymized, or must remain immutable.
6. **Workflow:** authoritative statuses, transitions, approvals, reopening rules, and closure verification.
7. **Scheduling:** date-only planning versus start/end times, recurrence, shifts, capacity, conflicts, and time zones.
8. **Notifications:** events, channels, recipients, preferences, retries, and delivery audit.
9. **Operational metrics:** definitions for downtime, response time, repair time, utilization, criticality, SLA, MTTR, and MTBF.
10. **Commercial scope:** free/internal tool, paid SaaS, customer-specific deployment, or enterprise product.
11. **Compliance:** applicable privacy, security, safety, contractual, or industry obligations.
12. **Support model:** owners for incidents, deployments, backups, customer support, and security reports.

### 3.2 Required product artifacts

- Product requirements document with prioritized user outcomes.
- Role-permission matrix.
- Workflow state diagram.
- Domain glossary and metric definitions.
- Data-retention policy.
- Threat model.
- MVP scope and explicit non-goals.
- Testable acceptance criteria for every MVP capability.

The existing SRS should not be treated as an approval baseline. It stops after its introductory section while claiming nonexistent sections, diagrams, appendices, and references. Unsupported benefit claims such as a 30% downtime reduction must be removed unless backed by measured evidence.

## 4. Critical current-state findings

### 4.1 Authentication and authorization

**Severity: Release blocker**

- Login returns user data but no server-verifiable session or access token.
- The frontend trusts a user object stored in `sessionStorage`.
- Application routes are accessible without authentication.
- API routes do not authenticate the caller.
- API routes do not authorize actions by organization, role, ownership, or assignment.
- Public signup accepts `admin` and `manager` roles.
- The admin dashboard is a client-side view over publicly accessible endpoints.
- User names, emails, and roles can be returned without an authenticated administrative context.

**Impact:** An anonymous caller can read operational data and perform destructive mutations. A visitor can self-register as an administrator or forge the client-side role state.

**Required outcome:** Every protected request has an authenticated server-side identity, tenant context, and permission decision. The UI may hide unavailable actions, but the API must independently enforce every boundary.

### 4.2 Password and account recovery

**Severity: Release blocker**

- Password reset is based on email address rather than a random, expiring, one-time token.
- The reset URL is hard-coded to localhost.
- Login and recovery responses expose whether an account exists.
- No rate limiting or abuse protection is present.
- Existing sessions are not revoked after password reset.

**Impact:** An attacker who knows an account email can replace its password by calling the API directly.

**Required outcome:** Store only a hash of a cryptographically random reset token, enforce a short expiry and single use, return uniform public responses, rate-limit requests, and revoke relevant sessions after reset.

### 4.3 Data durability and deployment

**Severity: Release blocker**

- Production SQLite is placed in Vercel `/tmp` storage.
- `/tmp` is ephemeral and is not shared reliably between function instances.
- Database initialization and demo seeding occur during application startup.
- The public frontend host does not expose the advertised API health endpoint.
- The frontend defaults to a localhost API URL if deployment configuration is absent.

**Impact:** Data can disappear or differ between requests and instances. A successfully deployed frontend can still have no working backend.

**Required outcome:** Use a durable managed database, separate migration/deployment operations from application startup, and validate the complete production path after every release.

### 4.4 Data integrity and auditability

**Severity: High**

- Migrations are ad hoc and have no version ledger or rollback procedure.
- SQLite foreign-key enforcement is not explicitly enabled at connection startup.
- Operational entities can be hard-deleted without a durable audit record.
- Notes have no author.
- Assignment and status changes do not create immutable history records.
- Multi-step mutations are not consistently transactional.
- No optimistic concurrency mechanism protects simultaneous edits.

**Impact:** The system cannot reliably answer who changed an operational record, when it changed, or what its prior value was.

### 4.5 Workflow correctness

**Severity: High**

- Technician filtering includes requests assigned to other technicians.
- Technician statistics use status values that differ from backend values.
- Calendar week numbering is hard-coded.
- Date-only records are rendered as invented one-hour calendar appointments.
- Status concepts such as `completed`, `repaired`, `in progress`, `in_progress`, and `on_hold` are inconsistent.
- Dashboard terms such as critical equipment and technician utilization do not match their calculations.
- Work-center alternative validation is incomplete.

**Impact:** Users can make decisions based on incorrect task lists and misleading metrics.

### 4.6 Engineering quality

**Severity: High**

- No unit, integration, end-to-end, security, accessibility, or migration tests exist.
- No CI workflow enforces build or quality gates.
- No linting, formatting, or TypeScript checking exists.
- Route handlers combine HTTP concerns, business rules, and SQL.
- Several frontend pages are large and combine fetching, state, calculations, and presentation.
- The stylesheet exceeds 4,000 lines and contains duplicated sections.
- The abandoned `vanilla` implementation and committed `client/dist` output add repository noise.
- Dependency audits report multiple high-severity findings and one critical backend transitive finding.

## 5. Target product architecture

### 5.1 Recommended architecture

```text
React web application
        |
        | HTTPS + secure session cookie
        v
Express API
  - request ID and structured logging
  - authentication middleware
  - organization context
  - authorization policy
  - schema validation
  - controllers
        |
        v
Domain services
  - workflow rules
  - transactions
  - audit events
  - notifications
        |
        v
Repository/query layer
        |
        v
Managed PostgreSQL

Supporting services:
  - object storage for attachments
  - transactional email provider
  - error monitoring
  - uptime monitoring
  - centralized logs
```

### 5.2 Technology recommendations

| Concern | Recommendation | Notes |
|---|---|---|
| Frontend | React + Vite | Retain current foundation; migrate incrementally to TypeScript. |
| Server state | TanStack Query | Standardize caching, loading, invalidation, and retry behavior. |
| API | Express initially | Avoid a framework rewrite until domain and security foundations stabilize. |
| Validation | Zod | Use explicit schemas at API boundaries; share safe types where useful. |
| Database | Managed PostgreSQL | Durable, concurrent, backed up, and suitable for tenant isolation. |
| Query layer | Prisma, Drizzle, or Knex | Select through a short proof of concept; do not mix multiple layers. |
| Authentication | Secure cookie sessions or managed identity | Prefer HTTP-only, Secure, SameSite cookies for the web application. |
| Authorization | Policy/service layer | Enforce organization, role, ownership, and assignment rules server-side. |
| Migrations | Versioned migration tooling | Migrations run as a controlled release step, not on request startup. |
| Email | Transactional provider | Use verified domains, templates, retry tracking, and suppression handling. |
| Files | Managed object storage | Store metadata in PostgreSQL; use signed upload/download URLs. |
| Tests | Vitest, Supertest, Playwright | Unit, API integration, and critical journey coverage. |
| CI | GitHub Actions | Enforce all release gates on pull requests and main. |
| Monitoring | Sentry plus structured logs | Add uptime and synthetic API checks. |

### 5.3 Proposed core data model

#### Identity and tenancy

- `organizations`
- `users`
- `organization_memberships`
- `roles`
- `permissions`
- `role_permissions`
- `sessions`
- `password_reset_tokens`

#### Maintenance domain

- `equipment`
- `equipment_categories`
- `work_centers`
- `work_center_alternatives`
- `maintenance_teams`
- `maintenance_team_members`
- `maintenance_requests`
- `request_assignments`
- `request_status_history`
- `request_notes`
- `request_attachments`
- `maintenance_schedules`
- `notification_deliveries`
- `audit_events`

Every tenant-owned table must include an organization boundary, and every query must apply it through a reviewed repository or policy layer. Tenant isolation must have automated negative tests.

## 6. Security design requirements

### 6.1 Authentication

- Passwords hashed with a currently supported password-hashing configuration.
- Secure, HTTP-only, SameSite cookies.
- Session rotation after authentication and privilege changes.
- Server-side logout and session invalidation.
- Idle and absolute session expiration.
- Optional MFA-ready design for administrators.
- Invitation-only privileged account provisioning.

### 6.2 Authorization

Create an explicit permission matrix. A starting point is:

| Capability | Requester | Technician | Manager | Administrator |
|---|---:|---:|---:|---:|
| View own requests | Yes | Yes | Yes | Yes |
| Create request | Yes | Yes | Yes | Yes |
| View assigned tasks | No | Yes | Yes | Yes |
| Update assigned task progress | No | Yes | Yes | Yes |
| Assign technicians | No | Limited/no | Yes | Yes |
| Manage equipment | No | View | Yes | Yes |
| Manage teams | No | View | Yes | Yes |
| Manage users and roles | No | No | No | Yes |
| View audit records | No | No | Limited | Yes |

This table is illustrative and must be approved by product owners. API policy tests must cover both allowed and denied behavior.

### 6.3 Application protection

- Restricted CORS allowlist.
- Helmet or equivalent security headers.
- CSRF protection appropriate to the session design.
- Request body and upload size limits.
- Rate limits by IP and account-sensitive identifier.
- Uniform authentication and recovery responses.
- Input schema validation and output shaping.
- Dependency, secret, and static security scanning.
- No stack traces or secrets in public errors.
- Audit events for privileged and destructive actions.

## 7. Canonical maintenance workflow

The product team must approve one lifecycle. A proposed baseline is:

```text
Draft -> Submitted -> Triaged -> Assigned -> In Progress
                      |             |             |
                      v             v             v
                   Rejected      Cancelled      On Hold
                                                  |
                                                  v
                              Completed -> Verified -> Closed
                                                  |
                                                  v
                                               Reopened
```

Each transition must define:

- Roles allowed to initiate it.
- Required fields.
- Timestamp and actor recorded.
- Notifications generated.
- Whether the transition can be reversed.
- SLA and metric effects.
- Equipment state effects.

Do not expose statuses in the UI that are absent from backend transition rules.

## 8. Phased implementation roadmap

### Phase 0: Product definition and risk containment

**Duration:** 1–2 weeks  
**Priority:** Immediate

#### Deliverables

- Mark the public environment as demo-only and prohibit real data.
- Disable public creation of Manager and Admin accounts.
- Approve MVP scope, non-goals, tenant model, and role matrix.
- Replace the incomplete SRS with a concise, testable PRD.
- Create the workflow state diagram and domain glossary.
- Create a threat model and data-classification inventory.
- Decide hosting, database, email, monitoring, and backup ownership.

#### Exit criteria

- Product, engineering, and operations approve the MVP boundaries.
- Every MVP user story has acceptance criteria.
- Every role has an explicit permission definition.
- No unsupported performance or business-benefit claims remain in documentation.

### Phase 1: Engineering baseline

**Duration:** 1 week  
**Dependencies:** Phase 0 decisions

#### Deliverables

- Establish supported Node and npm versions.
- Add ESLint, Prettier, and a TypeScript migration strategy.
- Add Vitest, Supertest, and Playwright foundations.
- Add GitHub Actions for install, lint, test, and build.
- Add environment validation at startup.
- Remove generated `client/dist` from source control.
- Remove or archive the unused `vanilla` implementation.
- Add pull-request and release checklists.

#### Exit criteria

- A clean checkout builds reproducibly on CI.
- CI blocks merging when lint, tests, or build fail.
- No secrets or local database files are tracked.
- Dependency update ownership is assigned.

### Phase 2: Durable database and tenancy

**Duration:** 2–3 weeks  
**Dependencies:** Phases 0–1

#### Deliverables

- Provision development, test, staging, and production PostgreSQL databases.
- Implement the approved tenant-aware schema.
- Add versioned migrations and seed data limited to local/test environments.
- Add repository/query boundaries that always require organization context.
- Implement status history, assignment history, authored notes, and audit events.
- Add automated backup policy and a tested restore procedure.
- Create a one-time migration strategy for any data worth retaining.

#### Exit criteria

- Data survives deployments and application restarts.
- Tenant-isolation integration tests prove cross-organization access is denied.
- Migration up/down or forward-recovery behavior is documented and tested.
- A staging backup can be restored successfully.

### Phase 3: Authentication, recovery, and authorization

**Duration:** 2–3 weeks  
**Dependencies:** Phase 2 identity schema

#### Deliverables

- Implement secure sessions.
- Add authentication middleware to every protected route.
- Implement backend authorization policies.
- Replace open privileged signup with invitations or administrator provisioning.
- Implement secure password-reset tokens.
- Add server-side logout and session revocation.
- Add rate limiting, security headers, restricted CORS, and request limits.
- Add security integration tests for anonymous, wrong-role, wrong-tenant, and expired-session cases.

#### Exit criteria

- Anonymous access to protected APIs returns 401.
- Authenticated but unauthorized access returns 403 without data leakage.
- Forging browser state grants no server privileges.
- Reset tokens expire, are single-use, and reveal no account existence.
- Privilege changes and password resets invalidate applicable sessions.

### Phase 4: API reconstruction

**Duration:** 2–4 weeks  
**Dependencies:** Phases 2–3

#### Deliverables

- Introduce route/controller/service/repository separation.
- Add Zod request validation.
- Add consistent error codes and response shapes.
- Add pagination, search, filtering, and sorting.
- Make multi-record mutations transactional.
- Add optimistic concurrency or record versions for edits.
- Add request IDs and structured logs.
- Publish an OpenAPI specification.
- Implement idempotency for sensitive create operations where appropriate.

#### Exit criteria

- All API endpoints have integration tests.
- Invalid input is rejected consistently.
- Destructive and privileged actions produce audit events.
- Concurrent conflicting edits cannot silently overwrite each other.
- OpenAPI behavior matches deployed behavior.

### Phase 5: Workflow and domain correctness

**Duration:** 2–4 weeks  
**Dependencies:** Phase 4

#### Deliverables

- Implement the approved canonical status machine.
- Correct technician assignment filtering.
- Store actual scheduling timestamps and time zones.
- Add priority, equipment criticality, SLA, and downtime fields with approved definitions.
- Add recurring preventive maintenance if included in MVP.
- Add authored notes, attachments, and immutable history.
- Implement assignment and completion verification rules.
- Replace misleading dashboard calculations.

#### Exit criteria

- Illegal status transitions are rejected by the API.
- Task visibility and actions match the role matrix.
- Calendar events use persisted start/end values.
- Dashboard metrics have documented formulas and test fixtures.
- Every state-changing workflow has positive and negative tests.

### Phase 6: Frontend productization

**Duration:** 3–4 weeks  
**Dependencies:** Stable Phase 4 APIs; can overlap Phase 5

#### Deliverables

- Add authenticated and permission-aware route guards.
- Introduce TanStack Query or an equivalent server-state layer.
- Migrate security- and domain-critical modules to TypeScript first.
- Decompose oversized page components.
- Create shared form, modal, table, notification, and error components.
- Add consistent loading, empty, retry, offline, and permission-denied states.
- Add error boundaries and a 404 page.
- Implement accessible focus management and keyboard behavior.
- Remove duplicated CSS and establish design tokens/components.
- Build responsive technician workflows for mobile-sized screens.

#### Exit criteria

- Critical journeys pass Playwright tests on desktop and mobile viewports.
- UI permissions agree with API permissions but do not replace them.
- Key workflows meet agreed accessibility checks.
- No page depends on directly reading a forgeable role for security decisions.

### Phase 7: Notifications and operational visibility

**Duration:** 1–2 weeks  
**Dependencies:** Stable event and identity models

#### Deliverables

- Integrate a transactional email provider.
- Add verified sender/domain configuration.
- Implement event-driven notification jobs and retry policy.
- Store delivery status without storing sensitive message contents unnecessarily.
- Add Sentry or equivalent error monitoring.
- Add structured log aggregation and uptime checks.
- Create dashboards and alerts for API errors, latency, job failures, and database health.

#### Exit criteria

- Notification failure does not roll back valid maintenance operations.
- Failed deliveries can be diagnosed and retried safely.
- On-call owners receive actionable production alerts.
- Health checks cover API availability and critical dependencies.

### Phase 8: Release hardening and controlled beta

**Duration:** 2–3 weeks  
**Dependencies:** Phases 0–7

#### Deliverables

- Conduct security review and dependency remediation.
- Run accessibility, performance, and failure-mode testing.
- Test migration, backup restoration, rollback, and incident procedures.
- Create customer onboarding and support documentation.
- Add privacy policy, terms, retention behavior, and data export/deletion workflows as applicable.
- Conduct a limited beta with synthetic or approved low-risk data.
- Collect workflow accuracy, reliability, and usability feedback.

#### Exit criteria

- No open release-blocking security or data-loss findings.
- Critical user journeys meet the agreed service-level objectives.
- Backup restore and deployment rollback are demonstrated.
- Product, security, QA, and operations provide written release approval.

## 9. Prioritized engineering backlog

### P0: Must complete before any real-data beta

- Remove Admin and Manager from public signup.
- Implement authenticated sessions.
- Protect and authorize every API endpoint.
- Replace password reset with secure tokens.
- Add organization/tenant isolation.
- Replace Vercel `/tmp` SQLite with PostgreSQL.
- Remove production demo seeding.
- Add migrations and backups.
- Add security and tenant-boundary integration tests.
- Deploy and smoke-test the API in staging.

### P1: Must complete before product MVP release

- Normalize workflow statuses and transition rules.
- Fix technician request filtering.
- Add authored notes and immutable history.
- Add real scheduled start/end timestamps.
- Define and correct dashboard metrics.
- Add validation, pagination, transactions, and consistent errors.
- Add CI, linting, core test coverage, monitoring, and alerts.
- Add protected frontend routes and standardized server-state management.
- Upgrade vulnerable dependencies.

### P2: Important product maturity work

- Attachments and object storage.
- Recurring preventive maintenance.
- Notification preferences and delivery tracking.
- SLA/escalation rules.
- Advanced search and saved filters.
- Data export.
- Accessibility improvements beyond the critical baseline.
- Mobile technician UX optimization.
- Administrative audit viewer.

### P3: Defer until validated by customers

- Spare-parts inventory.
- Procurement.
- Vendor portal.
- IoT integrations.
- Offline-first synchronization.
- Custom workflow builder.
- Advanced BI/report designer.
- Predictive maintenance or AI recommendations.

These capabilities should not be built merely because they are common in enterprise CMMS products. Each requires validated demand and operational ownership.

## 10. Test strategy

### 10.1 Unit tests

Cover deterministic domain behavior:

- Status transition policy.
- Permission policy.
- Scheduling calculations.
- SLA and metric calculations.
- Password-reset token lifecycle.
- Notification recipient selection.

### 10.2 API integration tests

Run against a real disposable PostgreSQL database and cover:

- Authentication and session lifecycle.
- Anonymous and unauthorized denial.
- Cross-tenant denial.
- CRUD validation and ownership.
- Concurrent updates.
- Transactions and rollback.
- Audit-event creation.
- Pagination and filtering.
- Migration compatibility.

### 10.3 End-to-end tests

Minimum critical journeys:

1. Administrator invites a manager.
2. Manager creates equipment and a maintenance team.
3. Requester submits a maintenance request.
4. Manager triages and assigns the request.
5. Technician starts, notes, and completes work.
6. Manager verifies and closes the request.
7. Authorized users can inspect the complete history.
8. Unauthorized users cannot view or alter another organization’s records.
9. User completes secure password recovery.
10. Deployment smoke test validates frontend, API, database, and email-job connectivity.

### 10.4 Non-functional tests

- Accessibility testing with automated checks and keyboard/manual review.
- Baseline API load and concurrency testing.
- Dependency and static security scanning.
- Backup restoration drills.
- Failure tests for email provider and database connectivity.
- Browser coverage for supported platforms.

## 11. CI/CD and release gates

Every pull request should run:

1. Reproducible locked dependency installation.
2. Secret scan.
3. Dependency audit with an approved exception policy.
4. Formatting check.
5. Lint.
6. Type check.
7. Unit tests.
8. API integration tests.
9. Production frontend and backend builds.
10. Migration validation.

Protected-branch releases should additionally run:

- End-to-end tests against a preview/staging environment.
- Database migration dry run.
- Deployment.
- Automated smoke tests.
- Manual approval for production.
- Post-deployment monitoring window.

## 12. Operational requirements

### 12.1 Environment separation

- Local development.
- Automated test.
- Shared development if required.
- Staging matching production architecture.
- Production.

Never share databases, credentials, email recipients, or object-storage buckets across these environments.

### 12.2 Service-level objectives for MVP

Initial targets to validate and adjust:

- Monthly API availability: 99.5% during beta.
- P95 read latency: less than 500 ms under agreed beta load.
- P95 mutation latency: less than 800 ms under agreed beta load.
- Recovery point objective: 24 hours initially, improved based on customer need.
- Recovery time objective: 4 hours initially.
- Critical security patch review: within 24 hours.
- Critical incident acknowledgement: within 30 minutes during supported hours.

These are proposed targets, not current capabilities or contractual commitments.

### 12.3 Ownership matrix

Assign named owners before beta for:

- Product decisions.
- Application security.
- Database migrations and backups.
- Production deployments.
- Monitoring and incident response.
- Customer support.
- Privacy and data requests.
- Dependency maintenance.
- Release approval.

## 13. Delivery estimate

For two experienced full-time engineers with timely product decisions:

| Workstream | Estimated duration |
|---|---:|
| Product definition and containment | 1–2 weeks |
| Engineering baseline | 1 week |
| PostgreSQL and tenancy | 2–3 weeks |
| Authentication and authorization | 2–3 weeks |
| API reconstruction | 2–4 weeks |
| Workflow correctness | 2–4 weeks |
| Frontend productization | 3–4 weeks |
| Operations and release hardening | 2–3 weeks |
| **Likely controlled beta range** | **12–18 weeks** |

Some workstreams can overlap after architectural contracts stabilize. Estimates exclude spare-parts inventory, procurement, offline synchronization, IoT integrations, enterprise SSO, formal certification, and advanced reporting.

## 14. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Feature work continues before security foundation | High | Critical | Freeze nonessential features through Phase 3. |
| Tenant data leakage | Medium/High | Critical | Tenant-aware schema, centralized policies, negative integration tests. |
| Data loss during serverless operation | High today | Critical | Replace ephemeral SQLite before real data. |
| Privilege escalation | Certain today | Critical | Remove privileged signup and enforce server authorization. |
| Account takeover through reset | High today | Critical | Tokenized recovery and rate limits. |
| Migration failure | Medium | High | Versioned migrations, staging dry run, backups, rollback plan. |
| Scope expansion delays MVP | High | High | Written MVP non-goals and product change control. |
| Dashboard metrics mislead users | High today | Medium/High | Approve definitions and test calculations. |
| Native dependency blocks deployment | Medium | Medium | PostgreSQL migration and supported runtime pinning. |
| Lack of operational ownership | Medium | High | Named owners and incident runbooks before beta. |

## 15. MVP definition of done

The product is ready for a controlled beta only when all conditions below are true:

- Real authentication and server-enforced authorization are deployed.
- Privileged users cannot self-register.
- Tenant isolation is implemented and tested.
- Password recovery is secure and tested.
- PostgreSQL persistence survives restart and deployment tests.
- Database migrations and backups are controlled and documented.
- Core request lifecycle behavior is approved and tested.
- Technician task visibility is correct.
- Audit history records actors and meaningful state changes.
- Frontend, API, database, email, and monitoring work in staging and production-like environments.
- CI enforces lint, type/build checks, tests, and migrations.
- Critical end-to-end journeys pass.
- No unresolved critical or high-risk release blockers remain without written acceptance.
- Incident, rollback, backup, and restore ownership is established.
- Product documentation describes actual behavior rather than planned behavior.

## 16. First implementation milestone

The first vertical slice should be deliberately narrow:

> An invited user authenticates securely, accesses only records permitted within their organization, resets their password using an expiring one-time token, and creates a maintenance request that persists durably in PostgreSQL. Automated integration tests prove anonymous, wrong-role, and wrong-tenant access is denied.

This milestone validates the architecture required by every later feature. Equipment, work centers, teams, scheduling, dashboards, and notifications should then be migrated incrementally through the same authenticated, tenant-aware, tested path.

## 17. Immediate next actions

### Within 48 hours

1. Designate the current deployment as demo-only.
2. Remove Manager and Admin from public signup.
3. Disable or replace the insecure password-reset flow.
4. Appoint product, engineering, security, and operations owners.
5. Schedule the tenant, role, workflow, and MVP decision workshop.

### Within the first week

1. Approve the role-permission matrix and tenant model.
2. Choose PostgreSQL hosting and authentication strategy.
3. Create the new schema and threat model.
4. Establish CI and the test harness.
5. Break the first vertical slice into implementation tickets.

### First release checkpoint

Do not evaluate progress by the number of newly added screens. Evaluate it by demonstrated guarantees: unauthorized access is denied, data persists, workflow rules are correct, changes are auditable, deployments are observable, and critical behavior is covered by repeatable tests.
