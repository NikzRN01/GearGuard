/**
 * Theme resolution for the pre-React bootstrap.
 *
 * This runs at module scope in main.jsx, before createRoot().render(), so that
 * the first painted frame already carries the right theme. That position is
 * also what makes it fragile: anything thrown here escapes module evaluation
 * and the user gets a blank page instead of a degraded one. Every browser API
 * touched below is therefore treated as fallible - reading localStorage throws
 * a SecurityError when storage is blocked (private browsing, an enterprise
 * site-data policy, some embedded webviews), and matchMedia is absent in a few
 * webview runtimes.
 *
 * Kept in its own module so the guards are covered by tests; importing main.jsx
 * would mount the whole application.
 */

export const THEME_STORAGE_KEY = 'gearguard-theme';

const THEMES = ['light', 'dark'];
let themeTransitionTimer = null;

/** The stored preference, or null if absent, unreadable or not a real theme. */
export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Whether the OS asks for a dark UI. False when the query cannot be run. */
export function prefersDark() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  } catch {
    return false;
  }
}

/** The theme to paint before React mounts. Always returns a usable value. */
export function resolveInitialTheme() {
  return readStoredTheme() ?? (prefersDark() ? 'dark' : 'light');
}

/** Applies a theme to the document root. Safe to call before React mounts. */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  return theme;
}

/**
 * Applies a user-initiated theme change without an abrupt full-page flash.
 * A short-lived root class lets CSS transition only major surfaces. Avoid a
 * document View Transition here: snapshotting a dashboard and its canvas is
 * substantially more expensive than interpolating a small set of tokens.
 */
export function transitionTheme(changeTheme) {
  let reduceMotion = false;
  try {
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    reduceMotion = false;
  }

  if (reduceMotion) {
    changeTheme();
    return null;
  }

  const root = document.documentElement;
  const targetTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  root.classList.remove('gg-theme-to-light', 'gg-theme-to-dark');
  root.classList.add('gg-theme-transitioning');
  root.classList.add(`gg-theme-to-${targetTheme}`);
  const finish = () => {
    root.classList.remove('gg-theme-transitioning', 'gg-theme-to-light', 'gg-theme-to-dark');
  };

  changeTheme();
  themeTransitionTimer = window.setTimeout(() => {
    finish();
    themeTransitionTimer = null;
  }, 560);
  return null;
}
