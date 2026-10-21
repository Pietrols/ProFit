import { useCallback, useState } from 'react';
import type { Database } from '../../lib/db/database';
import { useAuthStore } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';
import type { SetInput } from './types';
import { useWorkoutQuery } from './useWorkoutQuery';
import { readWorkoutDetail } from './workoutDetail';
import * as store from './workouts';

export function useWorkout(id: string) {
  const { db, engine } = useSyncContext();
  const authStore = useAuthStore();
  const load = useCallback((db: Database, user: string) => readWorkoutDetail(db, user, id), [id]);
  const query = useWorkoutQuery(`workout:${id}`, load, !!id);
  const identity = `${query.userId}/${id}`;
  const [pending, setPending] = useState<{ identity: string; afterRevision: number } | null>(null);
  const stale = pending?.identity === identity && query.revision <= pending.afterRevision;
  const write = async <T>(action: (user: string) => Promise<T>) => {
    const owner = authStore.getSnapshot();
    if (!query.userId || owner.status !== 'signedIn' || owner.userId !== query.userId)
      throw new Error('Sign in to save a workout.');
    if (stale || query.error) throw new Error('Refresh the workout before making another change.');
    const value = await action(query.userId);
    // Include background reads published during the save when requiring a post-commit refresh.
    setPending({ identity, afterRevision: query.currentRevision() });
    void engine.noteLocalChange();
    await query.refresh();
    return value;
  };
  return {
    ...query,
    stale,
    error:
      stale && query.error
        ? 'Saved on this phone. Refresh the workout before logging another set.'
        : query.error,
    log: (input: SetInput) => write((user) => store.saveSet(db, user, input, new Date())),
    notes: (target: string, notes: string, easierToday: boolean) =>
      write((user) => store.updateSession(db, user, target, { notes, easierToday }, new Date())),
    finish: (target: string, status: 'completed' | 'abandoned') =>
      write((user) => store.finishSession(db, user, target, status, new Date())),
  };
}
