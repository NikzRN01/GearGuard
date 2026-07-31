import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TechnicianDashboard from './TechnicianDashboard.jsx';
import { api } from '../services/api';

const ME = { id: 7, name: 'Marc Demo', role: 'technician' };

const signIn = (user = ME) => sessionStorage.setItem('user', JSON.stringify(user));

const renderPage = () =>
  render(<MemoryRouter><TechnicianDashboard /></MemoryRouter>);

const rows = [
  { id: 1, subject: 'Mine: new', status: 'new', type: 'corrective', assigned_to_user_id: 7, assigned_to_name: 'Marc Demo' },
  { id: 2, subject: 'Mine: working', status: 'in_progress', type: 'corrective', assigned_to_user_id: 7, assigned_to_name: 'Marc Demo' },
  { id: 3, subject: 'Mine: done', status: 'repaired', type: 'preventive', assigned_to_user_id: 7, assigned_to_name: 'Marc Demo' },
  { id: 4, subject: 'Someone else', status: 'in_progress', type: 'corrective', assigned_to_user_id: 99, assigned_to_name: 'Anas Makari' },
  { id: 5, subject: 'Unassigned', status: 'new', type: 'corrective', assigned_to_user_id: null, assigned_to_name: null }
];

const stat = (label) =>
  screen.getByText(label).parentElement.querySelector('.tech-stat-value').textContent;

describe('TechnicianDashboard', () => {
  it('shows only the signed-in technician\'s own tasks', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: rows } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Mine: new')).toBeInTheDocument());
    expect(screen.getByText('Mine: working')).toBeInTheDocument();
    expect(screen.getByText('Mine: done')).toBeInTheDocument();

    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('counts the API status values, not display labels', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: rows } });

    renderPage();

    await waitFor(() => expect(stat('Total Tasks')).toBe('3'));
    expect(stat('In Progress')).toBe('1');
    expect(stat('Completed')).toBe('1');
    expect(stat('New Tasks')).toBe('1');
  });

  it('asks the API for its own assignments only', async () => {
    signIn();
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } });

    renderPage();

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get).toHaveBeenCalledWith('/maintenance', { params: { assigned_to: ME.id } });
  });

  it('renders an empty state instead of failing when nothing is assigned', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [rows[3], rows[4]] } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No tasks assigned yet')).toBeInTheDocument());
  });

  it('surfaces a load failure', async () => {
    signIn();
    vi.spyOn(api, 'get').mockRejectedValue({ response: { data: { message: 'boom' } } });

    renderPage();

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  it('does not call the API when there is no session', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No tasks assigned yet')).toBeInTheDocument());
    expect(get).not.toHaveBeenCalled();
  });
});
