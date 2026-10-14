import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import type { Plan, PlanDay, PlanExercise } from '../plans/types';
import { localDay } from '../../lib/dates';
import { sessionSnapshot, type WorkoutHistory } from './logic';
import * as store from './workouts';
import type { SetInput } from './types';
export function useWorkouts() {
  const { db, engine } = useSyncContext(); const auth = useAuth(); const { syncing } = useSyncStatus();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [result, setResult] = useState<{ user: string; history: WorkoutHistory[] } | null>(null);
  const [error, setError] = useState<string | null>(null); const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const owner = useRef(userId); owner.current = userId;
  const retry = useCallback(() => setRevision((v) => v + 1), []);
  const read = useCallback(async () => {
    if (!userId) return;
    const version = ++request.current;
    const sessions = await store.listSessions(db, userId);
    const history = await Promise.all(sessions.map(async (session) => ({ session, logs: await store.listSets(db, userId, session.id) })));
    if (owner.current === userId && version === request.current) { setResult({ user: userId, history }); setError(null); }
  }, [db, userId]);
  useFocusEffect(retry);
  useEffect(() => { let current = true; void read().catch((e: unknown) => { if (current) setError(e instanceof Error ? e.message : 'Could not read workouts.'); }); return () => { current = false; }; }, [read, revision, syncing]);
  const write = async <T,>(action: (user: string) => Promise<T>) => {
    if (!userId) throw new Error('Sign in to save a workout.');
    const value = await action(userId); void engine.noteLocalChange(); await read(); return value;
  };
  return { userId, data: result?.user === userId ? result.history : null, error, retry,
    start: (plan: Plan, day: PlanDay, exercises: PlanExercise[], names: ReadonlyMap<string, string>) => write((user) => store.startSession(db, user, { planId: plan.id, dayId: day.id, localDate: localDay(new Date()), snapshot: sessionSnapshot(plan, day, exercises, names) }, new Date())),
    log: (input: SetInput) => write((user) => store.saveSet(db, user, input, new Date())),
    notes: (id: string, notes: string, easierToday: boolean) => write((user) => store.updateSession(db, user, id, { notes, easierToday }, new Date())),
    finish: (id: string, status: 'completed' | 'abandoned') => write((user) => store.finishSession(db, user, id, status, new Date())),
  };
}
