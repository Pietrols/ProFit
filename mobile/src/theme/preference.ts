import type { Mode } from './tokens';

// What the user picked on the You screen. Dark is the default per the spec.
export type ThemePreference = 'dark' | 'light' | 'system';

export const DEFAULT_PREFERENCE: ThemePreference = 'dark';

// The phone reports 'light', 'dark', or nothing useful ('unspecified', null or undefined).
export type SystemScheme = 'light' | 'dark' | 'unspecified' | null | undefined;

// Decide which palette to show. "Follow phone" falls back to dark when the phone gives no answer.
export function resolveMode(preference: ThemePreference, system: SystemScheme): Mode {
  if (preference === 'system') return system === 'light' ? 'light' : 'dark';
  return preference;
}

export const PREFERENCE_KEY = 'profit.theme';

// Reads the saved choice. Anything unknown falls back to the default.
export function parsePreference(raw: string | null): ThemePreference {
  return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : DEFAULT_PREFERENCE;
}
