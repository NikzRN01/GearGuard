/**
 * Render smoke tests for the pages that had no coverage of their own.
 *
 * These exist because the hook dependency arrays in each of them were corrected
 * (helpers hoisted to module scope, callbacks wrapped in useCallback). The risk
 * with that kind of change is not a type error - it is a component that mounts
 * into an infinite update loop, or one that now fires its data load twice. Each
 * test therefore asserts the page renders AND counts the calls it makes.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Calendar from './Calendar.jsx';
import UserRequests from './UserRequests.jsx';
import MachineTools from './MachineTools.jsx';
import Teams from './Teams.jsx';
import { api } from '../services/api';

// The calendar opens on the current week, so a fixed date would drift out of
// view and the test would start failing on an unrelated day. Build today's key
// from local parts - the same reason the page itself avoids UTC parsing.
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const REQUEST = {
  id: 1,
  subject: 'Grinding noise',
  status: 'new',
  type: 'corrective',
  scheduled_date: todayKey,
  equipment_name: 'Printer 01',
  created_at: `${todayKey} 09:15:00`
};

const signIn = (role) =>
  sessionStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test', email: 't@demo.com', role }));

let get;
beforeEach(() => {
  get = vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path === '/maintenance/calendar') return Promise.resolve({ data: { data: [REQUEST] } });
    if (path === '/maintenance') return Promise.resolve({ data: { data: [REQUEST] } });
    if (path === '/equipment') return Promise.resolve({ data: { data: [{ id: 1, name: 'Printer 01', serial_number: 'PRN-001' }] } });
    if (path === '/work-centers') return Promise.resolve({ data: { data: [] } });
    if (path === '/teams') return Promise.resolve({ data: { data: [{ id: 1, name: 'Internal Maintenance', member_count: 2 }] } });
    if (path === '/teams/users/all') return Promise.resolve({ data: { data: [] } });
    if (path.startsWith('/teams/')) return Promise.resolve({ data: { data: { id: 1, name: 'Internal Maintenance', members: [] } } });
    return Promise.resolve({ data: { data: [] } });
  });
});

const mount = (ui, entries = ['/app']) =>
  render(<MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>);

/** How many times a given endpoint was requested. */
const callsTo = (path) => get.mock.calls.filter(([p]) => p === path).length;

describe('page render smoke tests', () => {
  it('Calendar renders scheduled work using its module-scope date helpers', async () => {
    signIn('manager');
    mount(<Calendar />);

    await waitFor(() => expect(callsTo('/maintenance/calendar')).toBe(1));
    // The helpers were moved out of the component; if that broke, the event
    // would never be built and the title would not appear.
    await waitFor(() => expect(screen.getAllByText(/Grinding noise/).length).toBeGreaterThan(0));
  });

  it('Calendar loads exactly once, not on every render', async () => {
    signIn('manager');
    mount(<Calendar />);
    await waitFor(() => expect(callsTo('/maintenance/calendar')).toBe(1));
    // Give any runaway effect a chance to fire before asserting stability.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callsTo('/maintenance/calendar')).toBe(1);
  });

  it('UserRequests renders and loads once despite the useCallback change', async () => {
    signIn('user');
    mount(<UserRequests />, ['/app/requests']);

    await waitFor(() => expect(screen.getByText('My requests')).toBeInTheDocument());
    await waitFor(() => expect(callsTo('/maintenance')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callsTo('/maintenance')).toBe(1);
  });

  it('MachineTools renders equipment and fetches teams only for a manager', async () => {
    signIn('manager');
    mount(<MachineTools />);

    await waitFor(() => expect(callsTo('/equipment')).toBe(1));
    await waitFor(() => expect(callsTo('/teams')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callsTo('/equipment')).toBe(1);
  });

  it('MachineTools skips the teams fetch for a plain requester', async () => {
    signIn('user');
    mount(<MachineTools />);

    await waitFor(() => expect(callsTo('/equipment')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callsTo('/teams')).toBe(0);
  });

  it('Teams renders and loads once', async () => {
    signIn('manager');
    mount(<Teams />);

    await waitFor(() => expect(callsTo('/teams')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callsTo('/teams')).toBe(1);
  });
});
