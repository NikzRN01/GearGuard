import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard.jsx';
import { api } from '../services/api';

/** Formats an instant the way SQLite's CURRENT_TIMESTAMP does: UTC, no offset. */
const sqliteTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

/**
 * Local noon, n local days ago.
 *
 * The chart buckets by the viewer's local day, so fixtures have to be built on
 * the local day grid too. Subtracting 24h blocks from "now" drifts off that
 * grid whenever the run happens near local midnight; noon is always at least
 * 12 hours from a boundary, so the UTC round-trip can never land on the wrong
 * local day.
 */
const daysAgo = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

const mockApi = ({ requests = [], equipment = [], teams = [], users = [] }) =>
  vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path === '/maintenance') return Promise.resolve({ data: { data: requests } });
    if (path === '/equipment') return Promise.resolve({ data: { data: equipment } });
    if (path === '/teams') return Promise.resolve({ data: { data: teams } });
    if (path === '/teams/users/all') return Promise.resolve({ data: { data: users } });
    return Promise.resolve({ data: { data: [] } });
  });

const renderPage = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

const trendCounts = () =>
  [...document.querySelectorAll('.admin-trend-day strong')].map((node) => Number(node.textContent));

describe('AdminDashboard', () => {
  it('buckets requests created today into the current day, whatever the timezone', async () => {
    mockApi({
      requests: [
        { id: 1, subject: 'A', status: 'new', created_at: sqliteTimestamp(new Date()) },
        { id: 2, subject: 'B', status: 'new', created_at: sqliteTimestamp(new Date()) }
      ]
    });

    renderPage();

    await waitFor(() => expect(trendCounts()).toHaveLength(7));
    const counts = trendCounts();
    expect(counts.at(-1)).toBe(2);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('keeps every request from the last week inside the 7-day window', async () => {
    const requests = [0, 1, 2, 3, 4, 5, 6].map((offset) => ({
      id: offset + 1,
      subject: `Day -${offset}`,
      status: 'new',
      created_at: sqliteTimestamp(daysAgo(offset))
    }));

    mockApi({ requests });
    renderPage();

    await waitFor(() => expect(trendCounts()).toHaveLength(7));
    expect(trendCounts().reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('ignores requests older than the window instead of miscounting them', async () => {
    mockApi({
      requests: [
        { id: 1, subject: 'Old', status: 'new', created_at: sqliteTimestamp(daysAgo(60)) },
        { id: 2, subject: 'Today', status: 'new', created_at: sqliteTimestamp(new Date()) }
      ]
    });

    renderPage();

    await waitFor(() => expect(trendCounts()).toHaveLength(7));
    expect(trendCounts().reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('survives a missing or unparseable created_at', async () => {
    mockApi({
      requests: [
        { id: 1, subject: 'No date', status: 'new' },
        { id: 2, subject: 'Junk date', status: 'new', created_at: 'not a date' },
        { id: 3, subject: 'Today', status: 'new', created_at: sqliteTimestamp(new Date()) }
      ]
    });

    renderPage();

    await waitFor(() => expect(trendCounts()).toHaveLength(7));
    expect(trendCounts().reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('summarises open work, users, teams and equipment', async () => {
    mockApi({
      requests: [
        { id: 1, subject: 'Open', status: 'new', created_at: sqliteTimestamp(new Date()) },
        { id: 2, subject: 'Closed', status: 'repaired', created_at: sqliteTimestamp(new Date()) },
        { id: 3, subject: 'Scrapped', status: 'scrap', created_at: sqliteTimestamp(new Date()) }
      ],
      equipment: [{ id: 1, status: 'active' }, { id: 2, status: 'retired' }],
      teams: [{ id: 1, name: 'Internal' }],
      users: [{ id: 1, role: 'technician' }, { id: 2, role: 'manager' }]
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('1 unassigned')).toBeInTheDocument());
    expect(screen.getByText('1 technicians')).toBeInTheDocument();
    expect(screen.getByText('1 active')).toBeInTheDocument();
  });
});
