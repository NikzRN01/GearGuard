import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ResetPassword from './ResetPassword.jsx';
import { api } from '../services/api';

const renderAt = (search) =>
  render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes><Route path="/reset-password" element={<ResetPassword />} /></Routes>
    </MemoryRouter>
  );

const VALID = '?token=abc123';

const fillAndSubmit = async (password = 'Rotated123!') => {
  await userEvent.type(screen.getByLabelText('New Password'), password);
  await userEvent.type(screen.getByLabelText('Confirm New Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
};

describe('ResetPassword', () => {
  it('sends only the token from the reset link', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    renderAt(VALID);

    await fillAndSubmit();

    await waitFor(() => expect(post).toHaveBeenCalled());
    // The token identifies the account on its own; no email is collected or sent.
    expect(post).toHaveBeenCalledWith('/auth/reset-password', {
      token: 'abc123',
      newPassword: 'Rotated123!',
      confirmPassword: 'Rotated123!'
    });
  });

  it('never asks for an email address', () => {
    renderAt(VALID);
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('refuses a link with no token', async () => {
    const post = vi.spyOn(api, 'post');
    renderAt('');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid reset link/i);
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the API message when the token is rejected', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 400, data: { message: 'This password reset link is invalid or has expired' } }
    });
    renderAt(VALID);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });

  it('reports a network outage distinctly', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ code: 'ERR_NETWORK' });
    renderAt(VALID);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to connect/i);
  });
});
