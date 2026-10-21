import type { Database } from '../../lib/db/database';
import { withFreshHistory } from './historyIndex';
import { readExerciseHistory } from './historyQueries';
import { readWorkout } from './workouts';

export function readWorkoutDetail(db: Database, user: string, id: string) {
  return withFreshHistory(db, user, async (tx) => {
    const current = await readWorkout(tx, user, id);
    if (!current) return null;
    return {
      ...current,
      previousSets: await readExerciseHistory(tx, user, current.session, current.logs),
    };
  });
}
export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof readWorkoutDetail>>>;
