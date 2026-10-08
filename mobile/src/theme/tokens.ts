// ProFit design tokens: the single source of truth for colour, type, radius and spacing.
// Documented in docs/DESIGN.md. Plain data only (no React Native imports) so it can be unit tested.

export type ColorTokens = {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  text2: string;
  accent: string;
  onAccent: string;
  accent2: string;
  onAccent2: string;
  caution: string;
  line: string;
};

export type Mode = 'dark' | 'light';

export const palettes: Record<Mode, ColorTokens> = {
  dark: {
    bg: '#16120F',
    surface: '#211B17',
    surface2: '#2C241F',
    text: '#F2EBE3',
    text2: '#B0A497',
    accent: '#E57A52',
    onAccent: '#1C0D06',
    accent2: '#62B5A2',
    onAccent2: '#06201A',
    caution: '#E0AE52',
    line: 'rgba(242,235,227,0.10)',
  },
  light: {
    bg: '#F3EEE6',
    surface: '#FFFCF7',
    surface2: '#E8E0D3',
    text: '#231C16',
    text2: '#6B5E51',
    accent: '#A84126',
    onAccent: '#FFFFFF',
    accent2: '#2A6A5D',
    onAccent2: '#FFFFFF',
    caution: '#83550E',
    line: 'rgba(35,28,22,0.10)',
  },
};

// Font family names are the keys registered with useFonts in src/app/_layout.tsx.
export const fontFamilies = {
  display: 'BebasNeue_400Regular',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemiBold: 'Barlow_600SemiBold',
} as const;

export type TypeVariant = 'display' | 'title' | 'stat' | 'body' | 'bodyStrong' | 'label' | 'caption';

type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

export const typeScale: Record<TypeVariant, TypeStyle> = {
  display: { fontFamily: fontFamilies.display, fontSize: 40, lineHeight: 42, letterSpacing: 0.5 },
  title: { fontFamily: fontFamilies.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.5 },
  stat: { fontFamily: fontFamilies.display, fontSize: 32, lineHeight: 34, letterSpacing: 0.5 },
  body: { fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.bodySemiBold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fontFamilies.bodySemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  caption: { fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 18 },
};

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

// Minimum size for anything tappable.
export const touchTarget = 44;
