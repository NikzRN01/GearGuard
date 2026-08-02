/**
 * The auth screens carry a DotField background. It disappeared once before,
 * when the previous surface was restricted to the light theme while the app
 * resolved to dark - it then rendered nothing at all, so the screen just looked
 * flat with no error anywhere to explain it. These tests hold the background to
 * being present regardless of theme, and to staying out of the pointer path.
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
  it.each(['light', 'dark', undefined])('renders the background with theme=%s', (theme) => {
    resolvedTheme = theme;
    const { container } = mount();
    const surface = container.querySelector('.auth-dotted-surface');
    expect(surface).toBeInTheDocument();
    // DotField draws to a canvas; if the element is there but the canvas is
    // not, the backdrop is an empty box.
    expect(surface.querySelector('canvas')).toBeInTheDocument();
  });

  it('mounts the backdrop with the full-bleed frame DotField measures against', () => {
    // DotField sizes its canvas from the parent's rect, so the wrapper class
    // that supplies `position: fixed; inset: 0` is load-bearing, not cosmetic.
    const { container } = mount();
    expect(container.querySelector('.dot-field-backdrop.auth-dotted-surface')).toBeInTheDocument();
  });

  it('keeps the backdrop out of the pointer path and away from assistive tech', () => {
    // A background that swallows clicks would break the sign-in form, and
    // DotField's own canvas carries no pointer-events rule of its own.
    const { container } = mount();
    const surface = container.querySelector('.dot-field-backdrop');
    expect(surface).toHaveAttribute('aria-hidden', 'true');
    expect(surface.className).toMatch(/dot-field-backdrop/);
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
