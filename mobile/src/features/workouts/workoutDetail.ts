import type { Database } from '../../lib/db/database';
import { withFreshHistory } from './historyIndex';
import { readExerciseHistory } from './historyQueries';
import { historyExerciseIds } from './historyRequests';
import { getSession, readSessionSets } from './workouts';

export function readWorkoutDetail(db: Database, user: string, id: string) {
  return withFreshHistory(
    db,
    user,
    async (tx) => {
      const session = await getSession(tx, user, id);
      return {
        context: session,
        exercises: session ? historyExerciseIds(session) : [],
      };
    },
    async (tx, session) => {
      if (!session) return null;
      const logs = await readSessionSets(tx, user, session);
      return { session, logs, previousSets: await readExerciseHistory(tx, user, session, logs) };
    },
  );
}
export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof readWorkoutDetail>>>;
