/**
 * The auth screens carry a dotted background surface. It disappeared once
 * before, because the component was passed `lightOnly` while the app resolved
 * to a dark theme - in that combination it renders nothing at all, so the
 * screen just looks flat with no error anywhere to explain it.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// next-themes reports `undefined` until it has resolved after mount, so the
// unresolved case is a real state the component is rendered in, not a fiction.
let resolvedTheme = 'light';
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme, setTheme: vi.fn() })
}));

const AuthCard = (await import('./AuthCard.jsx')).default;

const mount = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      {/* A title distinct from the component's own "Welcome back" eyebrow. */}
      <AuthCard title="Account access" subtitle="Continue to GearGuard">
        <button type="button">Sign in</button>
      </AuthCard>
    </MemoryRouter>
  );

afterEach(() => { resolvedTheme = 'light'; });

describe('AuthCard background surface', () => {
  it.each(['light', 'dark'])('renders the dotted surface in the %s theme', (theme) => {
    resolvedTheme = theme;
    const { container } = mount();
    expect(container.querySelector('.auth-dotted-surface')).toBeInTheDocument();
  });

  it('renders the surface before the theme has resolved', () => {
    resolvedTheme = undefined;
    const { container } = mount();
    // The element must exist immediately; only the WebGL scene waits for a
    // resolved theme. Otherwise the background pops in after first paint.
    expect(container.querySelector('.auth-dotted-surface')).toBeInTheDocument();
  });

  it('keeps the surface behind the content and out of the pointer path', () => {
    const { container } = mount();
    const surface = container.querySelector('.auth-dotted-surface');
    // A background that swallows clicks would break the sign-in form.
    expect(surface.className).toMatch(/pointer-events-none/);
    expect(surface.className).toMatch(/fixed/);
  });

  it('still renders the card content around it', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Account access' })).toBeInTheDocument();
    expect(screen.getByText('Continue to GearGuard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('offers the right cross-link on each auth route', () => {
    mount('/login');
    expect(screen.getByRole('link', { name: /create an account/i })).toBeInTheDocument();

    mount('/signup');
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });
});
