import { useCallback } from 'react';
import type { Database } from '../../lib/db/database';
import { localDay } from '../../lib/dates';
import { useAuthStore } from '../auth/AuthProvider';
import type { Plan, PlanDay, PlanExercise } from '../plans/types';
import { useSyncContext } from '../sync/SyncProvider';
import { sessionSnapshot } from './logic';
import { readWorkoutOverview } from './workoutReads';
import { startSession } from './workouts';
import { useWorkoutQuery } from './useWorkoutQuery';

export function useWorkoutOverview(planId: string | null, enabled = true) {
  const { db, engine } = useSyncContext();
  const authStore = useAuthStore();
  const load = useCallback(
    (db: Database, user: string) => readWorkoutOverview(db, user, planId),
    [planId],
  );
  const query = useWorkoutQuery(`overview:${planId ?? 'none'}`, load, enabled);
  return {
    ...query,
    async start(
      plan: Plan,
      day: PlanDay,
      exercises: PlanExercise[],
      names: ReadonlyMap<string, string>,
    ) {
      const owner = authStore.getSnapshot();
      if (!query.userId || owner.status !== 'signedIn' || owner.userId !== query.userId)
        throw new Error('Sign in to start a workout.');
      const now = new Date();
      const id = await startSession(
        db,
        query.userId,
        {
          planId: plan.id,
          dayId: day.id,
          localDate: localDay(now),
          snapshot: sessionSnapshot(plan, day, exercises, names),
        },
        now,
      );
      void engine.noteLocalChange();
      // The session is committed even if its refresh fails. Open it using the saved id.
      await query.refresh();
      return id;
    },
  };
}
export type WorkoutOverviewState = ReturnType<typeof useWorkoutOverview>;
