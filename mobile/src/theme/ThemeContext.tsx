import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { Mode, theme } from '../../theme';

type ThemeValue = ReturnType<typeof theme> & {
  setMode: (mode: Mode | 'system') => void;
  modeSetting: Mode | 'system';
};

const ThemeContext = createContext<ThemeValue | null>(null);
const STORAGE_KEY = 'profit.themeMode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [modeSetting, setModeSetting] = useState<Mode | 'system'>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        setModeSetting(stored);
      }
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const mode: Mode =
      modeSetting === 'system'
        ? system === 'light'
          ? 'light'
          : 'dark'
        : modeSetting;
    return {
      ...theme(mode),
      modeSetting,
      setMode: (m) => {
        setModeSetting(m);
        AsyncStorage.setItem(STORAGE_KEY, m);
      },
    };
  }, [modeSetting, system]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside ThemeProvider');
  return ctx;
}
