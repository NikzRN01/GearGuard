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

const VALID = '?email=user%40example.com&token=abc123';

describe('ResetPassword', () => {
  it('sends the token from the reset link', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    renderAt(VALID);

    await userEvent.type(screen.getByLabelText('New Password'), 'Rotated123!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'Rotated123!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/auth/reset-password', {
      email: 'user@example.com',
      token: 'abc123',
      newPassword: 'Rotated123!',
      confirmPassword: 'Rotated123!'
    });
  });

  it('refuses a link with no token', async () => {
    const post = vi.spyOn(api, 'post');
    renderAt('?email=user%40example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid reset link/i);
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a link with no email', async () => {
    renderAt('?token=abc123');
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid reset link/i);
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
  });

  it('shows the API message when the token is rejected', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 400, data: { message: 'This password reset link is invalid or has expired' } }
    });
    renderAt(VALID);

    await userEvent.type(screen.getByLabelText('New Password'), 'Rotated123!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'Rotated123!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });
});
