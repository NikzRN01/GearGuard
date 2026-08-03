/**
 * The manager overview and the workload page previously each carried their own
 * copy of these rules and disagreed about what the third per-person metric
 * meant. These tests pin the shared definitions so a future divergence fails
 * here rather than surfacing as two screens showing different numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  CLOSED_STATUSES,
  WORKLOAD_SCOPE_NOTE,
  assigneeRequestsPath,
  dateKey,
  isAssignedTo,
  isOpen,
  isOverdue,
  isUnassigned,
  summarizeWorkload
} from './workload';

const TODAY = '2026-08-03';
const YESTERDAY = '2026-08-02';
const TOMORROW = '2026-08-04';

const request = (overrides = {}) => ({
  id: 1,
  status: 'new',
  assigned_to_user_id: null,
  scheduled_date: null,
  ...overrides
});

describe('closed statuses', () => {
  it('lists exactly the terminal statuses the API can produce', () => {
    // 'completed' and 'closed' were carried in the page-local copies but are
    // not in the server's STATUSES enum.
    expect([...CLOSED_STATUSES].sort()).toEqual(['repaired', 'scrap']);
  });

  it('treats new and in_progress as open, repaired and scrap as closed', () => {
    expect(isOpen(request({ status: 'new' }))).toBe(true);
    expect(isOpen(request({ status: 'in_progress' }))).toBe(true);
    expect(isOpen(request({ status: 'repaired' }))).toBe(false);
    expect(isOpen(request({ status: 'scrap' }))).toBe(false);
  });

  it('is case-insensitive and tolerates a missing status', () => {
    expect(isOpen(request({ status: 'REPAIRED' }))).toBe(false);
    expect(isOpen(request({ status: undefined }))).toBe(true);
    expect(isOpen(undefined)).toBe(true);
  });
});

describe('dateKey', () => {
  it('takes the date portion of a timestamp and blanks an unset value', () => {
    expect(dateKey('2026-08-03 09:15:00')).toBe(TODAY);
    expect(dateKey(TODAY)).toBe(TODAY);
    expect(dateKey(null)).toBe('');
    expect(dateKey(undefined)).toBe('');
  });
});

describe('isOverdue', () => {
  it('counts open work scheduled before today', () => {
    expect(isOverdue(request({ scheduled_date: YESTERDAY }), TODAY)).toBe(true);
  });

  it('does not count today, the future, or unscheduled work', () => {
    expect(isOverdue(request({ scheduled_date: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(request({ scheduled_date: TOMORROW }), TODAY)).toBe(false);
    expect(isOverdue(request({ scheduled_date: null }), TODAY)).toBe(false);
  });

  it('does not count closed work, however overdue it looks', () => {
    expect(isOverdue(request({ status: 'repaired', scheduled_date: YESTERDAY }), TODAY)).toBe(false);
    expect(isOverdue(request({ status: 'scrap', scheduled_date: YESTERDAY }), TODAY)).toBe(false);
  });
});

describe('isUnassigned', () => {
  it('is true only for open work with no owner', () => {
    expect(isUnassigned(request())).toBe(true);
    expect(isUnassigned(request({ assigned_to_user_id: 7 }))).toBe(false);
    expect(isUnassigned(request({ status: 'repaired' }))).toBe(false);
  });
});

describe('isAssignedTo', () => {
  it('matches across string and number ids', () => {
    expect(isAssignedTo(request({ assigned_to_user_id: 7 }), '7')).toBe(true);
    expect(isAssignedTo(request({ assigned_to_user_id: '7' }), 7)).toBe(true);
  });

  it('never matches an unassigned request', () => {
    // Number(null) === 0, so a naive comparison would match a falsy id.
    expect(isAssignedTo(request({ assigned_to_user_id: null }), 0)).toBe(false);
    expect(isAssignedTo(request({ assigned_to_user_id: null }), null)).toBe(false);
    expect(isAssignedTo(request({ assigned_to_user_id: 7 }), 8)).toBe(false);
  });
});

describe('summarizeWorkload', () => {
  const users = [
    { id: 1, name: 'Priya Sharma', role: 'technician' },
    { id: 2, name: 'Anas Makari', role: 'technician' },
    { id: 3, name: 'Mitchell Admin', role: 'manager' },
    { id: 4, name: 'Noah Williams', role: 'user' },
    { id: 5, name: 'GearGuard Admin', role: 'admin' }
  ];

  const requests = [
    request({ id: 1, assigned_to_user_id: 1, status: 'in_progress', scheduled_date: YESTERDAY }),
    request({ id: 2, assigned_to_user_id: 1, status: 'new', scheduled_date: TOMORROW }),
    request({ id: 3, assigned_to_user_id: 1, status: 'repaired', scheduled_date: YESTERDAY }),
    request({ id: 4, assigned_to_user_id: 2, status: 'new', scheduled_date: null }),
    request({ id: 5, assigned_to_user_id: null, status: 'new', scheduled_date: YESTERDAY })
  ];

  const rows = summarizeWorkload(users, requests, TODAY);

  it('includes only technicians and managers', () => {
    expect(rows.map((row) => row.name)).toEqual(['Priya Sharma', 'Anas Makari', 'Mitchell Admin']);
    expect(ASSIGNABLE_ROLES).toEqual(['technician', 'manager']);
  });

  it('counts open assigned work only, excluding closed requests', () => {
    // Request 3 is repaired, so Priya's active count is 2 rather than 3.
    expect(rows[0]).toMatchObject({ name: 'Priya Sharma', active: 2, inProgress: 1, overdue: 1 });
  });

  it('leaves unassigned work out of every row', () => {
    expect(rows.reduce((total, row) => total + row.active, 0)).toBe(3);
  });

  it('reports zeroes for someone with nothing assigned', () => {
    expect(rows[2]).toMatchObject({ name: 'Mitchell Admin', active: 0, inProgress: 0, overdue: 0 });
  });

  it('sorts busiest first, then alphabetically', () => {
    expect(rows.map((row) => row.active)).toEqual([2, 1, 0]);
  });

  it('tolerates empty inputs', () => {
    expect(summarizeWorkload([], [], TODAY)).toEqual([]);
    expect(summarizeWorkload(undefined, undefined, TODAY)).toEqual([]);
  });
});

describe('assigneeRequestsPath', () => {
  it('filters by user id and hides closed history', () => {
    // Both parameters matter: the id keeps the match exact, view=open keeps the
    // destination list equal to the count the workload row displayed.
    expect(assigneeRequestsPath(7)).toBe('/app/manager/requests?assignee=7&view=open');
  });
});

describe('WORKLOAD_SCOPE_NOTE', () => {
  it('names every dimension the counts do not represent', () => {
    for (const term of ['capacity', 'utilization', 'Shifts', 'estimated hours', 'priority', 'verification']) {
      expect(WORKLOAD_SCOPE_NOTE).toContain(term);
    }
  });
});
