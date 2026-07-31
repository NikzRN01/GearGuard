import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard.jsx';
import { api } from '../services/api';

/** Audit rows arrive as SQLite UTC strings with no offset marker. */
const sqliteTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const OVERVIEW = {
  totalUsers: 12,
  roles: { admin: 1, manager: 2, technician: 6, user: 3 },
  activeSessions: 4,
  recentAuditEvents: 27,
  pendingPasswordResets: 2
};

const EVENTS = [
  {
    id: 1,
    action: 'auth.login',
    actor_name: 'Mitchell Admin',
    actor_email: 'manager@demo.com',
    resource_type: 'session',
    resource_id: null,
    created_at: sqliteTimestamp(new Date())
  },
  {
    id: 2,
    action: 'admin.user.role.update',
    actor_name: 'GearGuard Admin',
    actor_email: 'admin@demo.com',
    resource_type: 'user',
    resource_id: '7',
    created_at: sqliteTimestamp(new Date())
  },
  {
    id: 3,
    action: 'maintenance.create',
    actor_name: 'Marc Demo',
    actor_email: 'tech1@demo.com',
    resource_type: 'maintenance_request',
    resource_id: '42',
    created_at: sqliteTimestamp(new Date())
  }
];

const mockApi = ({ overview = OVERVIEW, events = EVENTS, fail = false } = {}) =>
  vi.spyOn(api, 'get').mockImplementation((path) => {
    if (fail) return Promise.reject({ response: { data: { message: 'nope' } } });
    if (path === '/admin/overview') return Promise.resolve({ data: { data: overview } });
    if (path === '/admin/audit') return Promise.resolve({ data: { data: events } });
    return Promise.resolve({ data: { data: [] } });
  });

const renderPage = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

/** Reads a KPI by its caption; several tiles can show the same number. */
const kpi = (caption) => {
  const card = [...document.querySelectorAll('.admin-kpi-card')]
    .find((node) => node.querySelector('p')?.textContent === caption);
  return card?.querySelector('strong')?.textContent;
};

describe('AdminDashboard', () => {
  it('reads its figures from the admin endpoints', async () => {
    const get = mockApi();
    renderPage();

    await waitFor(() => expect(kpi('User accounts')).toBe('12'));
    expect(get).toHaveBeenCalledWith('/admin/overview');
    expect(get).toHaveBeenCalledWith('/admin/audit');

    expect(kpi('Active sessions')).toBe('4');
    expect(kpi('Security activity')).toBe('27');
    expect(kpi('Password resets')).toBe('2');
  });

  it('renders each audit event with a readable action and its actor', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());
    expect(screen.getByText('User access changed')).toBeInTheDocument();
    expect(screen.getByText('Maintenance request created')).toBeInTheDocument();
    expect(screen.getByText('GearGuard Admin')).toBeInTheDocument();
  });

  it('filters the audit trail by search text', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText(/search actor, action, or resource/i), 'Marc');

    await waitFor(() => expect(screen.queryByText('Signed in')).not.toBeInTheDocument());
    expect(screen.getByText('Maintenance request created')).toBeInTheDocument();
  });

  it('shows an empty row when nothing matches', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());
    await userEvent.type(
      screen.getByPlaceholderText(/search actor, action, or resource/i),
      'nothing-matches-this'
    );

    await waitFor(() =>
      expect(screen.getByText('No activity matches these filters.')).toBeInTheDocument()
    );
  });

  it('survives an audit row with no actor or timestamp', async () => {
    mockApi({
      events: [{ id: 9, action: 'auth.logout', resource_type: 'session', created_at: null }]
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Signed out')).toBeInTheDocument());
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Unknown time')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    mockApi({ fail: true });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'));
  });
});
