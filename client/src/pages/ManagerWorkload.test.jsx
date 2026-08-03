/**
 * The workload surfaces must agree with each other and with the queue they link
 * into.
 *
 * Three defects motivated these tests: the two pages showed differently worded
 * scope disclaimers, their third per-person metric measured different things
 * ("Scheduled" counted overdue work as healthy), and the drill-through used a
 * fuzzy name search that also matched subjects, teams and closed history - so
 * the destination list did not hold the requests the row had counted.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManagerWorkload from './ManagerWorkload.jsx';
import ManagerOverview from './ManagerOverview.jsx';
import ManagerRequests from './ManagerRequests.jsx';
import { api } from '../services/api';
import { WORKLOAD_SCOPE_NOTE } from '../services/workload';

// Relative to the machine's own clock, for the same reason the pages compute
// today from local date parts: a hard-coded date would drift out of range.
const shiftDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const YESTERDAY = shiftDays(-1);
const TOMORROW = shiftDays(1);

const USERS = [
  { id: 1, name: 'Priya Sharma', email: 'priya@demo.com', role: 'technician' },
  { id: 2, name: 'Anas Makari', email: 'anas@demo.com', role: 'technician' },
  { id: 9, name: 'Noah Williams', email: 'noah@demo.com', role: 'user' }
];

const REQUESTS = [
  // Priya: overdue and in progress.
  { id: 101, subject: 'Overdue spindle check', status: 'in_progress', assigned_to_user_id: 1, scheduled_date: YESTERDAY, type: 'corrective' },
  // Priya: open, scheduled ahead.
  { id: 102, subject: 'Future calibration', status: 'new', assigned_to_user_id: 1, scheduled_date: TOMORROW, type: 'preventive' },
  // Priya: closed history, must never be counted or listed.
  { id: 103, subject: 'Closed paint booth job', status: 'repaired', assigned_to_user_id: 1, scheduled_date: YESTERDAY, type: 'corrective' },
  // Anas: open, unscheduled.
  { id: 104, subject: 'Conveyor sensor swap', status: 'new', assigned_to_user_id: 2, scheduled_date: null, type: 'corrective' },
  // Nobody's: mentions Priya's name in the subject, so a name-based text search
  // would wrongly pull it into her drill-through.
  { id: 105, subject: 'Handover notes from Priya Sharma', status: 'new', assigned_to_user_id: null, scheduled_date: YESTERDAY, type: 'corrective' }
];

const signIn = (role = 'manager') =>
  sessionStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test', email: 't@demo.com', role }));

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path === '/maintenance') return Promise.resolve({ data: { data: REQUESTS } });
    if (path === '/teams/users/all') return Promise.resolve({ data: { data: USERS } });
    return Promise.resolve({ data: { data: [] } });
  });
});

const mount = (ui, entries = ['/app/manager/workload']) =>
  render(<MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>);

/** The workload table row for a person. */
const rowFor = (name) => screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr');

/** One metric cell from a person's row, addressed by its column label. */
const metric = (name, label) => rowFor(name).querySelector(`[data-label="${label}"]`);

describe('ManagerWorkload metrics', () => {
  it('reports Overdue rather than Scheduled as the third metric', async () => {
    signIn();
    mount(<ManagerWorkload />);

    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Overdue' })).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Scheduled' })).not.toBeInTheDocument();
  });

  it('counts only open assigned work, excluding closed requests', async () => {
    signIn();
    mount(<ManagerWorkload />);

    await waitFor(() => expect(screen.getByText('Priya Sharma')).toBeInTheDocument());
    // Requests 101 and 102 are open; 103 is repaired and must not be counted.
    expect(metric('Priya Sharma', 'Active assigned')).toHaveTextContent('2');
    expect(metric('Priya Sharma', 'In progress')).toHaveTextContent('1');
    expect(metric('Priya Sharma', 'Overdue')).toHaveTextContent('1');
  });

  it('does not treat a scheduled-but-overdue person as healthy', async () => {
    signIn();
    mount(<ManagerWorkload />);

    await waitFor(() => expect(screen.getByText('Anas Makari')).toBeInTheDocument());
    // Anas has open work with no date: active 1, overdue 0. Priya has a date in
    // the past, so the old "Scheduled" column showed 2 for her and 0 for Anas -
    // exactly backwards as a signal of trouble.
    expect(metric('Anas Makari', 'Active assigned')).toHaveTextContent('1');
    expect(metric('Anas Makari', 'Overdue')).toHaveTextContent('0');
    expect(metric('Priya Sharma', 'Overdue')).toHaveTextContent('1');
  });

  it('lists only technicians and managers', async () => {
    signIn();
    mount(<ManagerWorkload />);

    await waitFor(() => expect(screen.getByText('2 eligible team members')).toBeInTheDocument());
    expect(screen.queryByText('Noah Williams')).not.toBeInTheDocument();
  });
});

describe('workload scope disclaimer', () => {
  it('uses the shared wording on the workload page', async () => {
    signIn();
    mount(<ManagerWorkload />);
    await waitFor(() => expect(screen.getByText(WORKLOAD_SCOPE_NOTE)).toBeInTheDocument());
  });

  it('uses the same wording on the manager overview', async () => {
    signIn();
    mount(<ManagerOverview />, ['/app/manager/overview']);
    await waitFor(() => expect(screen.getByText(WORKLOAD_SCOPE_NOTE)).toBeInTheDocument());
  });
});

describe('workload drill-through', () => {
  it('links by assignee id and open-only, not a name search', async () => {
    signIn();
    mount(<ManagerWorkload />);

    await waitFor(() => expect(screen.getByText('Priya Sharma')).toBeInTheDocument());
    const link = within(rowFor('Priya Sharma')).getByRole('link', { name: 'View requests' });
    expect(link).toHaveAttribute('href', '/app/manager/requests?assignee=1&view=open');
  });

  it('lands on exactly the requests the row counted', async () => {
    signIn();
    mount(<ManagerRequests />, ['/app/manager/requests?assignee=1&view=open']);

    // The row said 2 active assigned; the queue must show those same 2.
    await waitFor(() => expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/^2 requests shown/));
    expect(screen.getByText('Overdue spindle check')).toBeInTheDocument();
    expect(screen.getByText('Future calibration')).toBeInTheDocument();
    // Closed history stays out.
    expect(screen.queryByText('Closed paint booth job')).not.toBeInTheDocument();
    // Another technician's work stays out.
    expect(screen.queryByText('Conveyor sensor swap')).not.toBeInTheDocument();
    // And the unassigned request that merely mentions her name stays out.
    expect(screen.queryByText('Handover notes from Priya Sharma')).not.toBeInTheDocument();
  });

  it('names the person being filtered in the results readout', async () => {
    signIn();
    mount(<ManagerRequests />, ['/app/manager/requests?assignee=1&view=open']);
    await waitFor(() => expect(screen.getByText('2 requests shown for Priya Sharma.')).toBeInTheDocument());
  });

  it('counts the assignee filter as an active filter', async () => {
    signIn();
    mount(<ManagerRequests />, ['/app/manager/requests?assignee=1&view=open']);
    await waitFor(() => expect(screen.getByText('2 active filters')).toBeInTheDocument());
  });
});
