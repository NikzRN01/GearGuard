import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';

const signIn = (role, extra = {}) => {
  sessionStorage.setItem('user', JSON.stringify({ id: 1, name: `A ${role}`, email: `${role}@demo.com`, role, ...extra }));
};

const renderShell = (path = '/app') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/app" element={<App />}>
        <Route index element={<div>content</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const navLinks = () => [...document.querySelectorAll('.app-sidebar a')].map((node) => node.textContent.trim());

describe('App navigation', () => {
  it('gives a requester their own workspace links', () => {
    // Regression: the requester branch sat behind a condition that was already
    // true for every signed-in role, so it never rendered and requesters were
    // shown the generic operations menu instead.
    signIn('user');
    renderShell();

    expect(navLinks()).toEqual(['Home', 'My Requests', 'Equipment Directory']);
    expect(screen.getByText('My workspace')).toBeInTheDocument();
    expect(screen.queryByText('Maintenance Calendar')).not.toBeInTheDocument();
  });

  it('only points a requester at routes their role can open', () => {
    // Every link must survive RoleRoute for this role, or the user lands on a
    // redirect loop back to their default page.
    const allowedForRequester = ['/app/home', '/app/requests', '/app/equipment/machine-tools'];
    signIn('user');
    renderShell();

    const hrefs = [...document.querySelectorAll('.app-sidebar a')].map((node) => node.getAttribute('href'));
    expect(hrefs).toEqual(allowedForRequester);
  });

  it('gives a technician their work links', () => {
    signIn('technician');
    renderShell();
    expect(navLinks()).toEqual(['My Tasks', 'Assigned Requests', 'Teams']);
  });

  it('gives a manager the full operations menu', () => {
    signIn('manager');
    renderShell();
    expect(navLinks()).toEqual([
      'Overview', 'Requests', 'Schedule', 'Team Workload', 'Equipment', 'Work Centers', 'Teams'
    ]);
  });

  it('gives an administrator governance and full operational navigation', () => {
    signIn('admin');
    renderShell();
    expect(navLinks()).toEqual(['Control Center', 'User Access', 'Requests', 'Schedule', 'Team Workload', 'Equipment', 'Work Centers', 'Teams']);
    expect(screen.queryByText('System administrator')).not.toBeInTheDocument();
  });

  it('labels the workspace for each role', () => {
    for (const [role, label] of [['user', 'Requester'], ['technician', 'Technician'], ['manager', 'Manager'], ['admin', 'Admin']]) {
      sessionStorage.clear();
      signIn(role);
      const { unmount } = renderShell();
      expect(screen.getAllByText(`${label} workspace`).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('renders without a stored user rather than throwing', () => {
    renderShell();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
