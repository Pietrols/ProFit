import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { startDisplayClock } from './displayClock';

const clock = {
  now: Date.now,
  foreground: () => AppState.currentState === 'active',
  subscribe(listener: () => void) {
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
  },
  every(tick: () => void, milliseconds: number) {
    const handle = setInterval(tick, milliseconds);
    return () => clearInterval(handle);
  },
};

export function useWorkoutClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      if (enabled) return startDisplayClock(clock, setNow);
    }, [enabled]),
  );
  return now;
}
