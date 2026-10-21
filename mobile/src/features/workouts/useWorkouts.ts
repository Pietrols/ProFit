import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, useAuthStore } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import type { Plan, PlanDay, PlanExercise } from '../plans/types';
import { localDay } from '../../lib/dates';
import { sessionSnapshot, type WorkoutHistory } from './logic';
import * as store from './workouts';
import type { SetInput } from './types';
export function useWorkouts() {
  const { db, engine } = useSyncContext();
  const auth = useAuth();
  const authStore = useAuthStore();
  const { syncing } = useSyncStatus();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [result, setResult] = useState<{ user: string; history: WorkoutHistory[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const retry = useCallback(() => setRevision((v) => v + 1), []);
  const read = useCallback(async () => {
    const owner = authStore.getSnapshot();
    if (!userId || owner.status !== 'signedIn' || owner.userId !== userId) return;
    const version = ++request.current;
    const sessions = await store.listSessions(db, userId);
    const history = await Promise.all(
      sessions.map(async (session) => ({
        session,
        logs: await store.listSets(db, userId, session.id),
      })),
    );
    const current = authStore.getSnapshot();
    if (current.status === 'signedIn' && current.userId === userId && version === request.current) {
      setResult({ user: userId, history });
      setError(null);
    }
  }, [authStore, db, userId]);
  useFocusEffect(retry);
  useEffect(() => {
    let current = true;
    void read().catch((e: unknown) => {
      if (current) setError(e instanceof Error ? e.message : 'Could not read workouts.');
    });
    return () => {
      current = false;
    };
  }, [read, revision, syncing]);
  const write = async <T>(action: (user: string) => Promise<T>) => {
    if (!userId) throw new Error('Sign in to save a workout.');
    const value = await action(userId);
    void engine.noteLocalChange();
    // A refresh failure must not turn a committed write into a failed save or skip its effects.
    try {
      await read();
    } catch {
      setError('Saved on this phone. Could not refresh workouts; retry the read.');
    }
    return value;
  };
  return {
    userId,
    data: result?.user === userId ? result.history : null,
    error,
    retry,
    start: (
      plan: Plan,
      day: PlanDay,
      exercises: PlanExercise[],
      names: ReadonlyMap<string, string>,
    ) =>
      write((user) =>
        store.startSession(
          db,
          user,
          {
            planId: plan.id,
            dayId: day.id,
            localDate: localDay(new Date()),
            snapshot: sessionSnapshot(plan, day, exercises, names),
          },
          new Date(),
        ),
      ),
    log: (input: SetInput) => write((user) => store.saveSet(db, user, input, new Date())),
    notes: (id: string, notes: string, easierToday: boolean) =>
      write((user) => store.updateSession(db, user, id, { notes, easierToday }, new Date())),
    finish: (id: string, status: 'completed' | 'abandoned') =>
      write((user) => store.finishSession(db, user, id, status, new Date())),
  };
}
