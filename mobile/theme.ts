// ProFit theme tokens — generated from DESIGN_NOTES.md (Claude Design reference).
// Single source of truth for colors/type/shape in the RN app.
// Import: `import { theme, useTheme } from './theme';`

export const palette = {
  dark: {
    pagebg: '#050506',
    bg: '#0A0A0B',
    deep: '#000000',
    s1: '#131316',
    s2: '#1B1B20',
    s3: '#27272E',
    tab: '#0C0C0F',

    tx: '#F4F4F6',
    tx2: '#9A9AA4',
    tx3: '#9C9CA4',

    green: '#5CF77B',
    gdim: 'rgba(92,247,123,0.13)',
    gGlow: 'rgba(92,247,123,0.45)', // use as shadowColor + opacity/radius
    onGreen: '#06140B',

    red: '#FF4B5C',
    rdim: 'rgba(255,75,92,0.13)',
    rGlow: 'rgba(255,75,92,0.5)',
    onRed: '#20040A',

    blue: '#4CB4FF',
    bdim: 'rgba(76,180,255,0.13)',
    bGlow: 'rgba(76,180,255,0.42)',
    onBlue: '#04121F',

    line: 'rgba(255,255,255,0.08)',
    line2: 'rgba(255,255,255,0.15)',
    track: 'rgba(255,255,255,0.09)',
  },
  light: {
    pagebg: '#E7E7E2',
    bg: '#F1F1EE',
    deep: '#DBDBD5',
    s1: '#FFFFFF',
    s2: '#FBFBF8',
    s3: '#EFEFE9',
    tab: '#FFFFFF',

    tx: '#161619',
    tx2: '#5E5E66',
    tx3: '#5A5A64',

    green: '#0FA152',
    gdim: 'rgba(15,161,82,0.11)',
    gGlow: 'rgba(15,161,82,0.26)',
    onGreen: '#FFFFFF',

    red: '#E02B44',
    rdim: 'rgba(224,43,68,0.1)',
    rGlow: 'rgba(224,43,68,0.26)',
    onRed: '#FFFFFF',

    blue: '#1A7CE0',
    bdim: 'rgba(26,124,224,0.1)',
    bGlow: 'rgba(26,124,224,0.24)',
    onBlue: '#FFFFFF',

    line: 'rgba(0,0,0,0.09)',
    line2: 'rgba(0,0,0,0.16)',
    track: 'rgba(0,0,0,0.08)',
  },
} as const;

export const typography = {
  display: 'SairaCondensed_800ExtraBold', // big numbers, timers, headers
  heading: 'SairaCondensed_700Bold',
  body: 'Saira_400Regular',
  label: 'Saira_600SemiBold',
  // Load via @expo-google-fonts/saira and @expo-google-fonts/saira-condensed
} as const;

export const radius = {
  sm: 6,   // chips, pills
  md: 12,  // controls, inputs
  lg: 16,  // cards (default)
  xl: 20,  // large surfaces
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Neon glow helper — RN shadow (approximates the CSS box-shadow glow).
// Apply to active/emphasis elements ONLY.
export const glow = (color: string) => ({
  shadowColor: color,
  shadowOpacity: 1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8, // Android
});

export type Mode = 'dark' | 'light';
export const theme = (mode: Mode = 'dark') => ({
  colors: palette[mode],
  typography,
  radius,
  spacing,
  glow,
  mode,
});

// Minimal hook stub — replace body with your context/store wiring.
export function useTheme(mode: Mode = 'dark') {
  return theme(mode);
}
