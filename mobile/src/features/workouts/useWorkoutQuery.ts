import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { Database } from '../../lib/db/database';
import { useAuth, useAuthStore } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';
import { createWorkoutReader } from './workoutReader';

export function useWorkoutQuery<T>(
  key: string,
  load: (db: Database, user: string) => Promise<T>,
  enabled = true,
) {
  const { db, engine } = useSyncContext();
  const auth = useAuth();
  const authStore = useAuthStore();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const identity = `${userId}/${key}`;
  const [result, setResult] = useState<{
    identity: string;
    data: T | null;
    error: string | null;
  } | null>(null);
  const refreshRef = useRef<(() => Promise<boolean>) | null>(null);
  const refresh = useCallback(() => refreshRef.current?.() ?? Promise.resolve(false), []);
  const retry = useCallback(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return;
      const reader = createWorkoutReader({
        user: userId,
        owner: () => {
          const current = authStore.getSnapshot();
          return current.status === 'signedIn' ? current.userId : null;
        },
        load: () => load(db, userId),
        publish: (data) => setResult({ identity, data, error: null }),
        fail: (error) =>
          setResult((previous) => ({
            identity,
            data: previous?.identity === identity ? previous.data : null,
            error: error instanceof Error ? error.message : 'Could not read workouts.',
          })),
      });
      refreshRef.current = reader.refresh;
      void reader.refresh();
      let syncing = engine.getStatus().syncing;
      const unsubscribe = engine.subscribe(() => {
        const next = engine.getStatus().syncing;
        if (syncing && !next) void reader.refresh();
        syncing = next;
      });
      return () => {
        reader.dispose();
        unsubscribe();
        if (refreshRef.current === reader.refresh) refreshRef.current = null;
      };
    }, [authStore, db, enabled, engine, identity, load, userId]),
  );

  return {
    userId,
    data: enabled && result?.identity === identity ? result.data : null,
    error: enabled && result?.identity === identity ? result.error : null,
    refresh,
    retry,
  };
}
