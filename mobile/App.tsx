import {
  Saira_400Regular,
  Saira_600SemiBold,
} from '@expo-google-fonts/saira';
import {
  SairaCondensed_700Bold,
  SairaCondensed_800ExtraBold,
} from '@expo-google-fonts/saira-condensed';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/features/auth/AuthContext';
import { RootNav } from './src/navigation/RootNav';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeContext';

function AppInner() {
  const t = useAppTheme();
  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <RootNav />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Saira_400Regular,
    Saira_600SemiBold,
    SairaCondensed_700Bold,
    SairaCondensed_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
