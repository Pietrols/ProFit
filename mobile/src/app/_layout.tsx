import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold } from '@expo-google-fonts/barlow';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { AuthProvider, useArea } from '@/features/auth/AuthProvider';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { fontFamilies } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BebasNeue_400Regular,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });

  // Keep the splash screen up until the fonts are ready, so nothing flashes in a fallback face.
  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedNavigation />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Passes ProFit's palette to the navigator so headers, cards and transitions match the app.
// The splash screen also covers the moment the stored sign-in is read, so the app never flashes
// the sign-in screen at someone who is already signed in.
function ThemedNavigation() {
  const { mode, colors } = useAppTheme();
  const area = useArea();

  useEffect(() => {
    if (area !== 'loading') SplashScreen.hideAsync();
  }, [area]);

  const navigationTheme = useMemo<Theme>(() => {
    const base = mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: mode === 'dark',
      colors: {
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.line,
        notification: colors.accent,
      },
      fonts: {
        regular: { fontFamily: fontFamilies.body, fontWeight: '400' },
        medium: { fontFamily: fontFamilies.bodyMedium, fontWeight: '500' },
        bold: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
        heavy: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
      },
    };
  }, [mode, colors]);

  if (area === 'loading') return null;

  // Each area only exists while its guard is true; when sign-in state changes, expo-router moves
  // to the first screen that is still available.
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamilies.bodySemiBold } }}>
        <Stack.Protected guard={area === 'app'}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="progress" options={{ title: 'Progress' }} />
          <Stack.Screen name="coach" options={{ title: 'Coach' }} />
        </Stack.Protected>
        <Stack.Protected guard={area === 'onboarding'}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={area === 'signIn'}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}
