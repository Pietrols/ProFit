import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import { copyStarter, type StarterPlan } from './starters';
import * as store from './plans';
import type { DayInput, Plan, PlanDay, PlanExercise, PlanExerciseInput, PlanInput } from './types';
export type PlansData = { plans: Plan[]; days: PlanDay[]; exercises: PlanExercise[]; habit: string[] };
export function usePlans() {
  const { db, engine } = useSyncContext(); const auth = useAuth(); const { syncing } = useSyncStatus();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [data, setData] = useState<PlansData | null>(null); const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0); const reload = useCallback(() => setRevision((v) => v + 1), []);
  useFocusEffect(reload);
  useEffect(() => {
    if (!userId || syncing) return; let current = true;
    (async () => {
      const plans = await store.listPlans(db, userId);
      const days = (await Promise.all(plans.map((p) => store.listDays(db, userId, p.id)))).flat();
      const exercises = (await Promise.all(days.map((d) => store.listPlanExercises(db, userId, d.id)))).flat();
      return { plans, days, exercises, habit: await store.listHabit(db, userId) };
    })().then((value) => { if (current) { setData(value); setError(null); } }, (e: unknown) => { if (current) setError(e instanceof Error ? e.message : 'Could not read plans.'); });
    return () => { current = false; };
  }, [db, userId, syncing, revision]);
  const write = useCallback(async <T,>(action: (id: string) => Promise<T>) => {
    if (!userId) throw new Error('Sign in to save a plan.');
    const result = await action(userId); reload(); void engine.noteLocalChange(); return result;
  }, [engine, userId, reload]);
  return { data, error, retry: reload,
    useStarter: (starter: StarterPlan) => write((user) => copyStarter(db, user, starter, new Date())),
    savePlan: (input: PlanInput, id?: string) => write((user) => store.savePlan(db, user, input, new Date(), id)),
    saveDay: (input: DayInput, id?: string) => write((user) => store.saveDay(db, user, input, new Date(), id)),
    saveExercise: (input: PlanExerciseInput, id?: string) => write((user) => store.savePlanExercise(db, user, input, new Date(), id)),
    removePlan: (id: string) => write((user) => store.deletePlan(db, user, id, new Date())),
    removeDay: (id: string) => write((user) => store.deleteDay(db, user, id, new Date())),
    removeExercise: (id: string) => write((user) => store.deletePlanExercise(db, user, id, new Date())),
    reorder: (planId: string, days: PlanDay[]) => write((user) => store.reorderDays(db, user, planId, days, new Date())),
    saveHabit: (ids: string[]) => write((user) => store.saveHabit(db, user, ids, new Date())),
  };
}
