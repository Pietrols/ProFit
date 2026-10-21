import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { randomId } from '@/lib/randomId';
import { awakeLease } from './awakeLease';

export function useWorkoutAwake(active: boolean): string | null {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !focused || !foreground) return;
    return awakeLease(
      { activate: activateKeepAwakeAsync, deactivate: deactivateKeepAwake },
      `workout:${randomId()}`,
      () => setError('Screen wake lock unavailable. Check your screen timeout while training.'),
      () => setError(null),
    );
  }, [active, focused, foreground]);
  return error;
}
