import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { Database } from '../../lib/db/database';
import { useAuth, useAuthStore } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';
import { createWorkoutReader, refreshAfterSync } from './workoutReader';

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
    revision: number;
  } | null>(null);
  const refreshRef = useRef<(() => Promise<boolean>) | null>(null);
  const revisionRef = useRef(0);
  const currentRevision = useCallback(() => revisionRef.current, []);
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
        publish: (data) => {
          const revision = ++revisionRef.current;
          setResult({ identity, data, error: null, revision });
        },
        fail: (error) =>
          setResult((previous) => ({
            identity,
            data: previous?.identity === identity ? previous.data : null,
            revision: previous?.identity === identity ? previous.revision : 0,
            error: error instanceof Error ? error.message : 'Could not read workouts.',
          })),
      });
      refreshRef.current = reader.refresh;
      void reader.refresh();
      const unsubscribe = refreshAfterSync(engine, reader.refresh);
      return () => {
        reader.dispose();
        unsubscribe();
        if (refreshRef.current === reader.refresh) refreshRef.current = null;
      };
    }, [authStore, db, enabled, engine, identity, load, userId]),
  );

  return {
    userId,
    loaded: enabled && result?.identity === identity,
    revision: result?.identity === identity ? result.revision : 0,
    currentRevision,
    data: enabled && result?.identity === identity ? result.data : null,
    error: enabled && result?.identity === identity ? result.error : null,
    refresh,
    retry,
  };
}
