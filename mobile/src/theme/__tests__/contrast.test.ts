import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from '../contrast';
import { palettes, type ColorTokens, type Mode } from '../tokens';

const AA_TEXT = 4.5;
const backgrounds: (keyof ColorTokens)[] = ['bg', 'surface', 'surface2'];
const foregrounds: (keyof ColorTokens)[] = ['text', 'text2', 'accent', 'accent2', 'caution'];

describe('contrastRatio', () => {
  it('matches the known extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('rejects colours that are not #RRGGBB', () => {
    expect(() => relativeLuminance('rgba(0,0,0,0.1)')).toThrow(/RRGGBB/);
  });
});

describe.each(['dark', 'light'] as Mode[])('%s palette', (mode) => {
  const p = palettes[mode];

  it.each(foregrounds.flatMap((fg) => backgrounds.map((bg) => [fg, bg] as const)))(
    '%s on %s meets WCAG AA for text',
    (fg, bg) => {
      expect(contrastRatio(p[fg], p[bg])).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('keeps text readable on both accent fills', () => {
    expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(p.onAccent2, p.accent2)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('defines every token for both modes', () => {
    expect(Object.keys(p).sort()).toEqual(Object.keys(palettes.dark).sort());
  });
});
