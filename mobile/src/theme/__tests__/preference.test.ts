import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCE, parsePreference, resolveMode } from '../preference';

describe('resolveMode', () => {
  it('defaults to dark', () => {
    expect(DEFAULT_PREFERENCE).toBe('dark');
    expect(resolveMode(DEFAULT_PREFERENCE, 'light')).toBe('dark');
  });

  it('uses an explicit choice whatever the phone says', () => {
    expect(resolveMode('light', 'dark')).toBe('light');
    expect(resolveMode('dark', 'light')).toBe('dark');
  });

  it('follows the phone when asked, falling back to dark when the phone gives no answer', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', 'unspecified')).toBe('dark');
    expect(resolveMode('system', null)).toBe('dark');
  });
});

describe('parsePreference', () => {
  it('reads a saved choice and falls back to dark for anything else', () => {
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference('system')).toBe('system');
    expect(parsePreference(null)).toBe('dark');
    expect(parsePreference('blue')).toBe('dark');
  });
});
