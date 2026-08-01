/**
 * Design-token guards.
 *
 * The theme is two parallel token sets (light in :root, dark under
 * [data-theme='dark']) and nothing at build time checks that they stay in step.
 * Every failure these tests describe shipped at some point: a colour token that
 * was never given a dark value, and muted text that missed WCAG AA on the light
 * backgrounds it actually renders on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLE_DIR = path.join(process.cwd(), 'src', 'styles');
const tokensCss = fs.readFileSync(path.join(STYLE_DIR, 'tokens.css'), 'utf8');

/** Extract the `--name: value` declarations from one selector block. */
const blockFor = (css, selectorRe) => {
  const match = css.match(selectorRe);
  if (!match) throw new Error(`selector not found: ${selectorRe}`);
  const start = css.indexOf('{', match.index) + 1;
  let depth = 1;
  let i = start;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return Object.fromEntries(
    [...css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()])
  );
};

const light = blockFor(tokensCss, /:root,\s*:root\[data-theme='light'\]/);
const dark = blockFor(tokensCss, /:root\[data-theme='dark'\]/);

const parseHex = (value) => {
  const match = String(value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const h = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const resolve = (name, theme, depth = 0) => {
  if (depth > 10) return null;
  const value = (theme === 'dark' ? dark[name] : undefined) ?? light[name];
  if (!value) return null;
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1], theme, depth + 1) : parseHex(value);
};

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

const isColour = (value) =>
  /^(#|rgba?\(|hsla?\(|var\(--gg-(blue|navy|green|amber|red|onyx|candy))/.test(value);

describe('token parity between the two themes', () => {
  it('gives every semantic colour token a dark value', () => {
    // A token left out of the dark block silently keeps its light value. For a
    // fill that means a light tint over a near-black surface, which disappears.
    const unthemed = Object.entries(light)
      .filter(([name, value]) => name.startsWith('--gg-color-') && isColour(value) && !(name in dark))
      .map(([name]) => name);

    expect(unthemed).toEqual([]);
  });

  it('defines no dark token that light does not also define', () => {
    const orphans = Object.keys(dark).filter((name) => !(name in light));
    expect(orphans).toEqual([]);
  });
});

describe('WCAG contrast', () => {
  const SURFACES = [
    ['--gg-color-page', 'page'],
    ['--gg-color-surface', 'card'],
    ['--gg-color-surface-subtle', 'subtle panel']
  ];

  for (const theme of ['light', 'dark']) {
    describe(`${theme} theme`, () => {
      it.each([
        ['--gg-color-text', 4.5],
        ['--gg-color-text-secondary', 4.5],
        ['--gg-color-text-muted', 4.5]
      ])('%s clears %s:1 on every surface it renders on', (token, min) => {
        const fg = resolve(token, theme);
        expect(fg, `${token} did not resolve`).not.toBeNull();

        for (const [surfaceToken, label] of SURFACES) {
          const bg = resolve(surfaceToken, theme);
          expect(bg, `${surfaceToken} did not resolve`).not.toBeNull();
          const ratio = contrast(fg, bg);
          expect(ratio, `${token} on ${label} was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
        }
      });

      it('keeps the text hierarchy ordered from strongest to faintest', () => {
        const order = ['--gg-color-text', '--gg-color-text-secondary', '--gg-color-text-muted']
          .map((t) => contrast(resolve(t, theme), resolve('--gg-color-surface', theme)));
        expect(order[0]).toBeGreaterThan(order[1]);
        expect(order[1]).toBeGreaterThan(order[2]);
      });

      it('keeps a primary button label readable on its own background', () => {
        const ratio = contrast(resolve('--gg-color-primary-contrast', theme), resolve('--gg-color-primary', theme));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it.each([
        ['--gg-color-success'],
        ['--gg-color-warning'],
        ['--gg-color-danger'],
        ['--gg-color-info']
      ])('%s stays distinguishable against a card', (token) => {
        // Status colour carries meaning, so it needs the 3:1 non-text minimum.
        const ratio = contrast(resolve(token, theme), resolve('--gg-color-surface', theme));
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('stylesheet integrity', () => {
  it('resolves every var() reference used across the stylesheets', () => {
    const sheets = ['tokens.css', 'theme-overrides.css', 'manager-theme.css', 'auth-theme.css']
      .map((f) => fs.readFileSync(path.join(STYLE_DIR, f), 'utf8'))
      .concat(fs.readFileSync(path.join(process.cwd(), 'src', 'styles.css'), 'utf8'))
      .join('\n');

    const defined = new Set([...Object.keys(light), ...Object.keys(dark)]);
    const dangling = [...new Set([...sheets.matchAll(/var\((--gg-[\w-]+)/g)].map((m) => m[1]))]
      .filter((name) => !defined.has(name));

    expect(dangling).toEqual([]);
  });
});
