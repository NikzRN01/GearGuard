/**
 * Shared definition of "assigned workload".
 *
 * The manager overview and the workload page both answer the same question and
 * used to answer it with their own copies of these predicates - which drifted:
 * one page's third per-person metric counted overdue work while the other
 * counted anything merely scheduled, so a technician whose work was entirely
 * overdue read as healthy on one screen and red on the other. Both now derive
 * every number here.
 */
import { todayKey } from './datetime';

/**
 * The server's terminal statuses (see CLOSED_STATUSES in
 * server/routes/maintenanceRoutes.js). Only these four statuses exist; earlier
 * copies of this set also listed 'completed' and 'closed', which the API can
 * never produce.
 */
export const CLOSED_STATUSES = new Set(['repaired', 'scrap']);

/** Roles that may hold a maintenance assignment. */
export const ASSIGNABLE_ROLES = ['technician', 'manager'];

/**
 * What these counts do and do not mean, stated identically wherever they are
 * shown.
 *
 * "Estimated hours" is accurate even though `maintenance_requests` carries a
 * `duration_hours` column: that value is *recorded* effort, written when a
 * request changes status or when a manager edits it. Nothing in the schema
 * estimates effort ahead of the work, and there is no per-person capacity or
 * shift model at all.
 */
export const WORKLOAD_SCOPE_NOTE =
  'Counts show open assigned requests — not capacity or utilization. Shifts, estimated hours, priority, and verification are not yet modeled.';

/** The date portion of a scheduled_date column, or '' when unset. */
export const dateKey = (value) => (value ? String(value).slice(0, 10) : '');

/** Whether a request is still active work rather than a historical record. */
export const isOpen = (request) =>
  !CLOSED_STATUSES.has(String(request?.status || '').toLowerCase());

/** Open work whose scheduled date has already passed. */
export const isOverdue = (request, today = todayKey()) => {
  const key = dateKey(request?.scheduled_date);
  return isOpen(request) && Boolean(key) && key < today;
};

/** Open work that nobody owns yet. */
export const isUnassigned = (request) => isOpen(request) && !request?.assigned_to_user_id;

/** Whether a request is assigned to a specific user. Null-safe on both sides. */
export const isAssignedTo = (request, userId) =>
  request?.assigned_to_user_id != null
  && userId != null
  && Number(request.assigned_to_user_id) === Number(userId);

/**
 * Per-person open workload, busiest first, then alphabetical.
 *
 * `requests` may be the full queue; closed work is filtered out here so callers
 * cannot forget to.
 */
export function summarizeWorkload(users, requests, today = todayKey()) {
  const open = (requests || []).filter(isOpen);

  return (users || [])
    .filter((user) => ASSIGNABLE_ROLES.includes(user?.role))
    .map((user) => {
      const assigned = open.filter((request) => isAssignedTo(request, user.id));
      return {
        ...user,
        assigned,
        active: assigned.length,
        inProgress: assigned.filter((request) => String(request.status).toLowerCase() === 'in_progress').length,
        overdue: assigned.filter((request) => isOverdue(request, today)).length
      };
    })
    .sort((a, b) => b.active - a.active || String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * Where a person's workload row drills through to.
 *
 * Both parameters matter: `assignee` matches the user id exactly (a name-based
 * text search also matched subjects, teams and assets), and `view=open` keeps
 * closed history out, so the destination list holds exactly the requests the
 * row counted.
 */
export const assigneeRequestsPath = (userId) =>
  `/app/manager/requests?assignee=${encodeURIComponent(userId)}&view=open`;

/**
 * Where an equipment row drills through to.
 *
 * `equipment` matches equipment_id exactly; the name search this replaced also
 * matched subjects, teams, and any other asset whose name merely contained this
 * one. No view filter is applied on purpose: unlike a workload row, this is an
 * asset's maintenance record rather than a count of live work, so closed
 * requests are part of the answer.
 */
export const equipmentRequestsPath = (equipmentId) =>
  `/app/manager/requests?equipment=${encodeURIComponent(equipmentId)}`;
