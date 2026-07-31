import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import RoleRoute from './RoleRoute.jsx';
import { getDefaultAppPath, getSessionUser } from '../services/session';
import { api } from '../services/api';

const Protected = () => <div>protected content</div>;

const renderRoute = (allowedRoles, entry = '/app/secret') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/app/home" element={<div>user home</div>} />
        <Route path="/app/admin" element={<div>admin home</div>} />
        <Route path="/app/manager/overview" element={<div>manager home</div>} />
        <Route path="/app/technician" element={<div>technician home</div>} />
        <Route path="/app/secret" element={<RoleRoute allowedRoles={allowedRoles}><Protected /></RoleRoute>} />
      </Routes>
    </MemoryRouter>
  );

/** The route now proves identity against the server rather than trusting storage. */
const signedInAs = (role) =>
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { user: { id: 1, name: 'T', role }, csrfToken: 'csrf-abc' }
  });

const signedOut = () => vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 401 } });

describe('RoleRoute', () => {
  it('shows a checking state before the session is confirmed', async () => {
    signedInAs('admin');
    renderRoute(['admin']);
    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);

    // Let the in-flight /auth/me settle inside the test. Without this the state
    // update lands after the test has finished, which React reports as an
    // unwrapped act() and which leaves a pending promise for the next test.
    expect(await screen.findByText('protected content')).toBeInTheDocument();
  });

  it('redirects to login when the server rejects the session', async () => {
    signedOut();
    renderRoute(['admin']);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('renders the route for an allowed role', async () => {
    signedInAs('admin');
    renderRoute(['admin']);
    expect(await screen.findByText('protected content')).toBeInTheDocument();
  });

  it('sends a disallowed role back to its own landing page', async () => {
    signedInAs('technician');
    renderRoute(['admin']);
    expect(await screen.findByText('technician home')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('allows any signed-in role when no list is supplied', async () => {
    signedInAs('user');
    renderRoute(undefined);
    expect(await screen.findByText('protected content')).toBeInTheDocument();
  });

  it('caches the confirmed identity and CSRF token for later requests', async () => {
    signedInAs('manager');
    renderRoute(['manager']);

    await screen.findByText('protected content');
    await waitFor(() => expect(sessionStorage.getItem('csrf_token')).toBe('csrf-abc'));
    expect(JSON.parse(sessionStorage.getItem('user')).role).toBe('manager');
  });

  it('clears stale identity when the session is gone', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 9, role: 'admin' }));
    sessionStorage.setItem('csrf_token', 'stale');
    signedOut();

    renderRoute(['admin']);

    await screen.findByText('login page');
    expect(sessionStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('csrf_token')).toBeNull();
  });
});

describe('session helpers', () => {
  it('returns null rather than throwing on corrupt session data', () => {
    sessionStorage.setItem('user', '{not json');
    expect(getSessionUser()).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(getSessionUser()).toBeNull();
  });

  it('routes each role to its own landing page', () => {
    expect(getDefaultAppPath({ role: 'technician' })).toBe('/app/technician');
    expect(getDefaultAppPath({ role: 'manager' })).toBe('/app/manager/overview');
    expect(getDefaultAppPath({ role: 'admin' })).toBe('/app/admin');
    expect(getDefaultAppPath({ role: 'user' })).toBe('/app/home');
    expect(getDefaultAppPath(null)).toBe('/app/home');
  });
});
