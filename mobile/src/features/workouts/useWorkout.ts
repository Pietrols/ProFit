import { useCallback, useState } from 'react';
import type { Database } from '../../lib/db/database';
import { useAuthStore } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';
import type { SetValues } from './types';
import type { SetRecord, SetUndoReceipt } from './setChanges';
import { correctLoggedSet, removeLoggedSet, undoLoggedSet } from './setCorrections';
import { useWorkoutQuery } from './useWorkoutQuery';
import { readStructuredWorkoutDetail } from './structuredDetail';
import { logStableSet } from './stableLogging';
import type { StablePerformanceInput } from './stablePerformance';
import * as store from './workouts';

export function useWorkout(id: string) {
  const { db, engine } = useSyncContext();
  const authStore = useAuthStore();
  const load = useCallback(
    (db: Database, user: string) => readStructuredWorkoutDetail(db, user, id),
    [id],
  );
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
  const checkTarget = (target: SetRecord) => {
    if (target.sessionId !== id) throw new Error('Choose a set from this workout.');
  };
  return {
    ...query,
    stale,
    error:
      stale && query.error
        ? 'Saved on this phone. Refresh the workout before logging another set.'
        : query.error,
    log: (input: StablePerformanceInput) => {
      if (input.item.sessionId !== id) throw new Error('Choose a set from this workout.');
      return write((user) => logStableSet(db, user, input, new Date()));
    },
    correct: (target: SetRecord, values: SetValues, restore = false) => {
      checkTarget(target);
      return write((user) => correctLoggedSet(db, user, target, values, new Date(), restore));
    },
    remove: (target: SetRecord) => {
      checkTarget(target);
      return write((user) => removeLoggedSet(db, user, target, new Date()));
    },
    undo: (receipt: SetUndoReceipt) => {
      checkTarget(receipt.before);
      return write((user) => undoLoggedSet(db, user, receipt, new Date()));
    },
    notes: (target: string, notes: string, easierToday: boolean) =>
      write((user) => store.updateSession(db, user, target, { notes, easierToday }, new Date())),
    finish: (target: string, status: 'completed' | 'abandoned') =>
      write((user) => store.finishSession(db, user, target, status, new Date())),
  };
}
