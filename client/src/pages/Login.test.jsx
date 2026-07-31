import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Login from './Login.jsx';
import { api } from '../services/api';

const renderPage = () => render(<MemoryRouter><Login /></MemoryRouter>);

const signInAs = async (email = 'me@example.com', password = 'Password123!') => {
  await userEvent.type(screen.getByLabelText('Email Address'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('Login', () => {
  it('stores the session on success', async () => {
    const user = { id: 3, name: 'Mitchell', role: 'manager', email: 'me@example.com' };
    vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, user } });

    renderPage();
    await signInAs();

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('user'))).toEqual(user));
  });

  it('shows one indistinguishable message for a rejected sign-in', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 401, data: { message: 'Invalid email or password' } }
    });

    renderPage();
    await signInAs();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid email or password/i);
    // Must not hint that the address is unregistered.
    expect(alert).not.toHaveTextContent(/sign up/i);
    expect(alert).not.toHaveTextContent(/not found/i);
    expect(sessionStorage.getItem('user')).toBeNull();
  });

  it('reports a network outage distinctly from bad credentials', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ code: 'ERR_NETWORK' });

    renderPage();
    await signInAs();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to connect/i);
  });

  it('keeps the forgot-password confirmation non-committal', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/account email/i), 'ghost@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    const confirmation = await screen.findByText(/if an account exists/i);
    expect(confirmation).toBeInTheDocument();
    expect(screen.queryByText(/no account found/i)).not.toBeInTheDocument();
  });
});
