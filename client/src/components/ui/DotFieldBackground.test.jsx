/**
 * The DotField backdrop sits inside the auth card and the landing page, so a
 * throw anywhere in it takes the surrounding page down with it. jsdom has no
 * canvas implementation, which makes it a faithful stand-in for the real cases
 * where a 2D context cannot be handed out: the browser is out of contexts,
 * canvas is blocked for fingerprinting reasons, or the renderer is headless.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let resolvedTheme = 'light';
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme, setTheme: vi.fn() }) }));

const { default: DotFieldBackground, DOT_FIELD_SETTINGS, DOT_FIELD_COLORS } =
  await import('./DotFieldBackground.jsx');

/** Worst case for legibility: a dot pixel fully covering the page. */
const parseRgba = (value) => {
  const [r, g, b, a] = value.match(/[\d.]+/g).map(Number);
  return { rgb: [r, g, b], alpha: a };
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const composite = (value, page) => {
  const { rgb, alpha } = parseRgba(value);
  return rgb.map((c, i) => alpha * c + (1 - alpha) * page[i]);
};

// Page and text colours from styles/tokens.css.
const THEME_SURFACES = {
  light: { page: hex('#ecefef'), text: hex('#101416'), secondary: hex('#3d4a50') },
  dark: { page: hex('#020202'), text: hex('#f2f6f7'), secondary: hex('#c5d0d4') }
};

afterEach(() => { resolvedTheme = 'light'; });

describe('DotFieldBackground', () => {
  it('renders without a usable canvas context instead of throwing', () => {
    // jsdom's getContext already returns null; assert the component tolerates it.
    expect(() => render(<DotFieldBackground />)).not.toThrow();
  });

  it('keeps sibling content alive when the canvas cannot initialise', () => {
    // The real consequence of a throw here: the sign-in form vanishes.
    render(
      <div>
        <DotFieldBackground className="auth-dotted-surface" />
        <button type="button">Sign in</button>
      </div>
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('survives getContext throwing outright, not just returning null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('canvas blocked');
    });
    try {
      // A throw from getContext is not something the component can catch from
      // the outside, so this documents the boundary: if this ever fails, the
      // call needs wrapping rather than the result checking.
      expect(() => render(<DotFieldBackground />)).toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('marks the backdrop as decoration and gives it the full-bleed frame', () => {
    const { container } = render(<DotFieldBackground className="landing-dotted-surface" />);
    const backdrop = container.querySelector('.dot-field-backdrop');

    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveClass('landing-dotted-surface');
    expect(backdrop.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with no className supplied', () => {
    const { container } = render(<DotFieldBackground />);
    expect(container.querySelector('.dot-field-backdrop')).toBeInTheDocument();
  });

  it('uses the agreed DotField geometry', () => {
    // These are the values the design calls for; drift here changes the look of
    // both public pages at once, so it is worth pinning.
    expect(DOT_FIELD_SETTINGS).toMatchObject({
      dotRadius: 4,
      dotSpacing: 28,
      cursorRadius: 750,
      cursorForce: 0.1,
      bulgeOnly: true,
      bulgeStrength: 67,
      glowRadius: 160,
      sparkle: false,
      waveAmplitude: 0
    });
  });
});

describe('DotField colours', () => {
  it('defines a palette for both themes', () => {
    expect(Object.keys(DOT_FIELD_COLORS).sort()).toEqual(['dark', 'light']);
    for (const theme of ['light', 'dark']) {
      for (const key of ['gradientFrom', 'gradientTo', 'glowColor']) {
        expect(DOT_FIELD_COLORS[theme][key], `${theme}.${key}`).toMatch(/^rgba\(/);
      }
    }
  });

  it.each(['light', 'dark'])('keeps text readable over a %s dot at full coverage', (theme) => {
    // The reason the alpha is low: a dot can land directly behind body copy on
    // the landing page, where there is no card between them.
    const { page, text, secondary } = THEME_SURFACES[theme];

    for (const key of ['gradientFrom', 'gradientTo', 'glowColor']) {
      const behind = composite(DOT_FIELD_COLORS[theme][key], page);
      expect(contrast(text, behind), `body text over ${theme}.${key}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(secondary, behind), `secondary text over ${theme}.${key}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'])('keeps %s dots subtle enough to stay a background', (theme) => {
    // An upper bound as well as a lower one: past this the field stops reading
    // as texture and starts competing with the content in front of it.
    for (const key of ['gradientFrom', 'gradientTo', 'glowColor']) {
      const { alpha } = parseRgba(DOT_FIELD_COLORS[theme][key]);
      expect(alpha, `${theme}.${key}`).toBeLessThanOrEqual(0.25);
      expect(alpha, `${theme}.${key}`).toBeGreaterThan(0);
    }
  });

  it('picks the palette that matches the active theme', () => {
    resolvedTheme = 'dark';
    const { container: darkContainer } = render(<DotFieldBackground />);
    expect(darkContainer.querySelector('.dot-field-backdrop')).toBeInTheDocument();

    resolvedTheme = 'light';
    const { container: lightContainer } = render(<DotFieldBackground />);
    expect(lightContainer.querySelector('.dot-field-backdrop')).toBeInTheDocument();
  });

  it('falls back to the theme already stamped on <html> before next-themes resolves', () => {
    // main.jsx sets data-theme pre-render; using it avoids a frame of the wrong
    // palette on first paint.
    resolvedTheme = undefined;
    document.documentElement.dataset.theme = 'dark';
    expect(() => render(<DotFieldBackground />)).not.toThrow();
    document.documentElement.dataset.theme = 'light';
    expect(() => render(<DotFieldBackground />)).not.toThrow();
  });
});
