/**
 * The pre-React theme bootstrap.
 *
 * It runs at module scope in main.jsx, before createRoot().render(), so anything
 * it throws takes the whole application down to a blank page rather than
 * degrading. These tests import the real implementation, so removing a guard
 * from services/theme.js fails here rather than passing against a copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  prefersDark,
  readStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY
} from './theme';

const withMatchMedia = (impl) => vi.spyOn(window, 'matchMedia').mockImplementation(impl);
const throwing = (name, message) => () => {
  throw new DOMException(message, name);
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('readStoredTheme', () => {
  it('returns a stored theme', () => {
    for (const theme of ['light', 'dark']) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      expect(readStoredTheme()).toBe(theme);
    }
  });

  it('rejects anything that is not a real theme', () => {
    for (const junk of ['', 'DARK', 'blue', '{"theme":"dark"}', 'null', 'undefined']) {
      localStorage.setItem(THEME_STORAGE_KEY, junk);
      expect(readStoredTheme()).toBeNull();
    }
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredTheme()).toBeNull();
  });

  it('returns null instead of throwing when storage is blocked', () => {
    // Private browsing, an enterprise site-data policy, or an embedded webview.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      throwing('SecurityError', 'The operation is insecure.')
    );
    expect(() => readStoredTheme()).not.toThrow();
    expect(readStoredTheme()).toBeNull();
  });
});

describe('prefersDark', () => {
  it('reports the OS preference', () => {
    withMatchMedia((query) => ({ matches: query.includes('dark') }));
    expect(prefersDark()).toBe(true);

    withMatchMedia(() => ({ matches: false }));
    expect(prefersDark()).toBe(false);
  });

  it('returns false when matchMedia throws', () => {
    withMatchMedia(throwing('NotSupportedError', 'not supported'));
    expect(() => prefersDark()).not.toThrow();
    expect(prefersDark()).toBe(false);
  });

  it('returns false when matchMedia is absent entirely', () => {
    const original = window.matchMedia;
    delete window.matchMedia;
    try {
      expect(() => prefersDark()).not.toThrow();
      expect(prefersDark()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('resolveInitialTheme', () => {
  it('prefers the stored theme over the OS preference', () => {
    withMatchMedia(() => ({ matches: true }));
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(resolveInitialTheme()).toBe('light');
  });

  it('falls back to the OS preference when nothing is stored', () => {
    withMatchMedia((query) => ({ matches: query.includes('dark') }));
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('still returns a usable theme when every browser API fails', () => {
    // The case that matters: this runs before render, so it must not throw.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing('SecurityError', 'blocked'));
    withMatchMedia(throwing('NotSupportedError', 'nope'));

    expect(() => resolveInitialTheme()).not.toThrow();
    expect(['light', 'dark']).toContain(resolveInitialTheme());
  });
});

describe('applyTheme', () => {
  it('writes the theme onto the document root', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('paints a theme even with storage blocked, so the first frame is right', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing('SecurityError', 'blocked'));
    withMatchMedia(() => ({ matches: true }));

    expect(() => applyTheme(resolveInitialTheme())).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
