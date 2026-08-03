/**
 * The equipment register's drill-through into the request queue.
 *
 * Two defects motivated these tests. The link used a fuzzy `?search=<name>`,
 * which also matched request subjects, teams, and any other asset whose name
 * contained this one - so the queue showed work belonging to other equipment.
 * And the register is open to all four roles while /app/manager/requests is
 * manager/admin only, so for a requester or technician the link was a dead end
 * that RoleRoute bounced back to their own workspace.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MachineTools from './MachineTools.jsx';
import ManagerRequests from './ManagerRequests.jsx';
import { api } from '../services/api';

const EQUIPMENT = [
  { id: 1, name: 'CNC Milling Machine', serial_number: 'CNC-5AX-0042', department: 'Manufacturing', team_name: 'Internal Maintenance' },
  // A name that contains the first one: the old search matched both.
  { id: 2, name: 'CNC Milling Machine Mk II', serial_number: 'CNC-5AX-0043', department: 'Manufacturing', team_name: 'Internal Maintenance' }
];

const REQUESTS = [
  { id: 201, subject: 'Spindle vibration', status: 'new', equipment_id: 1, equipment_name: 'CNC Milling Machine', assigned_to_user_id: 1, scheduled_date: null, type: 'corrective' },
  // Closed work on the same asset: part of its maintenance record, so it stays.
  { id: 202, subject: 'Coolant line replaced', status: 'repaired', equipment_id: 1, equipment_name: 'CNC Milling Machine', assigned_to_user_id: 1, scheduled_date: null, type: 'corrective' },
  // Different asset, overlapping name.
  { id: 203, subject: 'Mk II commissioning check', status: 'new', equipment_id: 2, equipment_name: 'CNC Milling Machine Mk II', assigned_to_user_id: 1, scheduled_date: null, type: 'preventive' },
  // No asset at all, but the subject names one.
  { id: 204, subject: 'Order parts for CNC Milling Machine', status: 'new', equipment_id: null, work_center_id: 1, work_center_name: 'Assembly Line 1', assigned_to_user_id: null, scheduled_date: null, type: 'corrective' }
];

const signIn = (role) =>
  sessionStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test', email: 't@demo.com', role }));

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path === '/equipment') return Promise.resolve({ data: { data: EQUIPMENT } });
    if (path === '/maintenance') return Promise.resolve({ data: { data: REQUESTS } });
    if (path === '/teams') return Promise.resolve({ data: { data: [] } });
    if (path === '/teams/users/all') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
});

const mount = (ui, entries = ['/app/equipment/machine-tools']) =>
  render(<MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>);

/** MemoryRouter has no address bar, so surface the current URL for assertions. */
const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="url">{`${location.pathname}${location.search}`}</span>;
};

describe('equipment drill-through', () => {
  it('navigates by equipment id, not a name search', async () => {
    signIn('manager');
    const user = userEvent.setup();
    mount(<><MachineTools /><LocationProbe /></>);

    await waitFor(() => expect(screen.getByText('2 equipment records')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'CNC Milling Machine' }));

    expect(screen.getByTestId('url')).toHaveTextContent('/app/manager/requests?equipment=1');
  });

  it('sends the second asset to its own id, not a shared name match', async () => {
    signIn('manager');
    const user = userEvent.setup();
    mount(<><MachineTools /><LocationProbe /></>);

    await waitFor(() => expect(screen.getByText('2 equipment records')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'CNC Milling Machine Mk II' }));

    expect(screen.getByTestId('url')).toHaveTextContent('/app/manager/requests?equipment=2');
  });

  it('shows the asset its whole maintenance record, including closed work', async () => {
    signIn('manager');
    mount(<ManagerRequests />, ['/app/manager/requests?equipment=1']);

    await waitFor(() => expect(screen.getByText('2 requests shown for CNC Milling Machine.')).toBeInTheDocument());
    expect(screen.getByText('Spindle vibration')).toBeInTheDocument();
    // Unlike a workload row, an asset record keeps its history.
    expect(screen.getByText('Coolant line replaced')).toBeInTheDocument();
  });

  it('excludes another asset whose name contains this one', async () => {
    signIn('manager');
    mount(<ManagerRequests />, ['/app/manager/requests?equipment=1']);

    await waitFor(() => expect(screen.getByText('Spindle vibration')).toBeInTheDocument());
    expect(screen.queryByText('Mk II commissioning check')).not.toBeInTheDocument();
  });

  it('excludes an assetless request that merely names the equipment', async () => {
    signIn('manager');
    mount(<ManagerRequests />, ['/app/manager/requests?equipment=1']);

    await waitFor(() => expect(screen.getByText('Spindle vibration')).toBeInTheDocument());
    expect(screen.queryByText('Order parts for CNC Milling Machine')).not.toBeInTheDocument();
  });

  it('counts the equipment filter as an active filter', async () => {
    signIn('manager');
    mount(<ManagerRequests />, ['/app/manager/requests?equipment=1']);
    await waitFor(() => expect(screen.getByText('1 active filter')).toBeInTheDocument());
  });
});

describe('equipment register by role', () => {
  it('offers the drill-through to an admin', async () => {
    signIn('admin');
    mount(<MachineTools />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'CNC Milling Machine' })).toBeInTheDocument());
  });

  it('does not link a requester into a queue they cannot open', async () => {
    signIn('user');
    mount(<MachineTools />);

    await waitFor(() => expect(screen.getByText('2 equipment records')).toBeInTheDocument());
    // The name is still shown, just not as a control that dead-ends in a
    // redirect back to their own workspace.
    expect(screen.getByText('CNC Milling Machine')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CNC Milling Machine' })).not.toBeInTheDocument();
  });

  it('does not link a technician into that queue either', async () => {
    signIn('technician');
    mount(<MachineTools />);

    await waitFor(() => expect(screen.getByText('2 equipment records')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'CNC Milling Machine' })).not.toBeInTheDocument();
  });

  it('labels the page as reference rather than a manager workspace for a requester', async () => {
    signIn('user');
    mount(<MachineTools />);
    await waitFor(() => expect(screen.getByText('Operations reference')).toBeInTheDocument());
  });
});
