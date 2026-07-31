import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TechnicianDashboard from './TechnicianDashboard.jsx';
import { api } from '../services/api';

const ME = { id: 7, name: 'Marc Demo', role: 'technician' };

const signIn = (user = ME) => sessionStorage.setItem('user', JSON.stringify(user));

const renderPage = () => render(<MemoryRouter><TechnicianDashboard /></MemoryRouter>);

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const rows = [
  { id: 1, subject: 'Mine: new', status: 'new', type: 'corrective', assigned_to_user_id: 7 },
  { id: 2, subject: 'Mine: working', status: 'in_progress', type: 'corrective', assigned_to_user_id: 7 },
  { id: 3, subject: 'Mine: done', status: 'repaired', type: 'preventive', assigned_to_user_id: 7 },
  { id: 4, subject: 'Mine: overdue', status: 'new', type: 'corrective', assigned_to_user_id: 7, scheduled_date: yesterday() },
  { id: 5, subject: 'Someone else', status: 'in_progress', type: 'corrective', assigned_to_user_id: 99 },
  { id: 6, subject: 'Unassigned', status: 'new', type: 'corrective', assigned_to_user_id: null }
];

/** Reads a KPI from the stat grid; the same words also appear as status badges. */
const stat = (label) => {
  const grid = document.querySelector('.tech-stats-grid');
  const card = [...grid.querySelectorAll('.tech-stat-card')]
    .find((node) => node.querySelector('.tech-stat-label')?.textContent === label);
  return card.querySelector('.tech-stat-value').textContent;
};

describe('TechnicianDashboard', () => {
  it("shows only the signed-in technician's own tasks", async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: rows } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Mine: new')).toBeInTheDocument());
    expect(screen.getByText('Mine: working')).toBeInTheDocument();

    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('counts the API status values, not display labels', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: rows } });

    renderPage();

    // Open work excludes the repaired row: 3 of the 4 own tasks are still open.
    await waitFor(() => expect(stat('Open tasks')).toBe('3'));
    expect(stat('In progress')).toBe('1');
    expect(stat('New tasks')).toBe('2');
    expect(stat('Overdue')).toBe('1');
  });

  it('does not count closed work as overdue', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [
          { id: 1, subject: 'Closed but past due', status: 'repaired', assigned_to_user_id: 7, scheduled_date: yesterday() }
        ]
      }
    });

    renderPage();

    await waitFor(() => expect(stat('Overdue')).toBe('0'));
    expect(stat('Open tasks')).toBe('0');
  });

  it('renders an empty state instead of failing when nothing is assigned', async () => {
    signIn();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [rows[4], rows[5]] } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No assigned tasks')).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByText('No assigned tasks')).toBeInTheDocument());
    expect(get).not.toHaveBeenCalled();
  });
});
