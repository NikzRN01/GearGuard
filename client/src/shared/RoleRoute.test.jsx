import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RoleRoute from './RoleRoute.jsx';
import { getDefaultAppPath, getSessionUser } from '../services/session';

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

const signIn = (role) => sessionStorage.setItem('user', JSON.stringify({ id: 1, name: 'T', role }));

describe('RoleRoute', () => {
  it('redirects an anonymous visitor to the login page', () => {
    renderRoute(['admin']);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the route for an allowed role', () => {
    signIn('admin');
    renderRoute(['admin']);
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('sends a disallowed role back to its own landing page', () => {
    signIn('technician');
    renderRoute(['admin']);
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.getByText('technician home')).toBeInTheDocument();
  });

  it('allows any signed-in role when no list is supplied', () => {
    signIn('user');
    renderRoute(undefined);
    expect(screen.getByText('protected content')).toBeInTheDocument();
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
