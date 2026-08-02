import React from 'react';
import { useTheme } from 'next-themes';
import DotField from '../DotField';

/**
 * The public-facing background: a DotField pinned behind the page.
 *
 * The registry example sizes DotField inside a fixed 1080px box; here it has to
 * cover the viewport instead, so the wrapper supplies the fixed full-bleed frame
 * that DotField measures itself against (its canvas reads the parent's rect).
 *
 * Two things the wrapper has to get right:
 *  - `pointer-events: none`. DotField's canvas has no such rule of its own, and
 *    it sits above the page, so without this it would swallow every click on the
 *    sign-in form behind it. DotField listens on `window` for the cursor, so it
 *    still reacts while ignoring hits.
 *  - `aria-hidden`. It is decoration, and its canvas has no accessible meaning.
 */

/** Geometry and motion. Shared by both themes; only the colours differ. */
export const DOT_FIELD_SETTINGS = {
  dotRadius: 4,
  dotSpacing: 28,
  cursorRadius: 750,
  cursorForce: 0.1,
  bulgeOnly: true,
  bulgeStrength: 67,
  glowRadius: 160,
  sparkle: false,
  waveAmplitude: 0
};

/**
 * Dot colours drawn from the product palette in styles/tokens.css, at alphas
 * chosen so that text sitting directly on the backdrop still clears WCAG AA.
 *
 * The worst case is a pixel where a dot fully covers the page: at these values
 * body text measures 13.8:1 (light) and 13.7:1 (dark) against that composite,
 * and secondary text 6.8:1 and 9.5:1. Both stay far inside the 4.5:1 minimum -
 * the alpha could go as high as 0.39 (light) and 0.42 (dark) before secondary
 * text drops below it, so there is deliberate headroom here.
 *
 * DotField reads these every frame, so a theme switch restyles the field in
 * place rather than tearing the canvas down.
 */
export const DOT_FIELD_COLORS = {
  light: {
    // --gg-blue-500 into --gg-blue-600
    gradientFrom: 'rgba(104, 169, 197, 0.20)',
    gradientTo: 'rgba(36, 106, 134, 0.20)',
    glowColor: 'rgba(36, 106, 134, 0.18)'
  },
  dark: {
    // --gg-candy-blue into --gg-blue-400
    gradientFrom: 'rgba(178, 213, 229, 0.18)',
    gradientTo: 'rgba(143, 193, 214, 0.18)',
    glowColor: 'rgba(178, 213, 229, 0.22)'
  }
};

/**
 * next-themes reports `undefined` until it resolves after mount. main.jsx has
 * already stamped data-theme onto <html> before React runs, so read that rather
 * than flashing the wrong palette for a frame.
 */
const currentTheme = (resolved) => {
  if (resolved === 'dark' || resolved === 'light') return resolved;
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
};

export default function DotFieldBackground({ className = '' }) {
  const { resolvedTheme } = useTheme();
  const colors = DOT_FIELD_COLORS[currentTheme(resolvedTheme)];

  return (
    <div className={`dot-field-backdrop ${className}`.trim()} aria-hidden="true">
      <DotField {...DOT_FIELD_SETTINGS} {...colors} />
    </div>
  );
}
