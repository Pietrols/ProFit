import type { Database } from '../../lib/db/database';
import { withFreshHistory } from './historyIndex';
import { readPerformedExerciseHistory } from './historyQueries';
import { historyIdsForExercises } from './historyRequests';
import { personalRecords } from './logic';
import { readSessionStructure } from './structureReads';
import { getSession } from './workouts';

export function readStructuredWorkoutDetail(db: Database, user: string, id: string) {
  return withFreshHistory(
    db,
    user,
    async (tx) => {
      const session = await getSession(tx, user, id);
      if (!session) return { context: null, exercises: [] };
      const structure = await readSessionStructure(tx, user, session);
      const exercises = structure.itemView.items
        .filter((item) => !item.deletedAt && item.state === 'active')
        .map((item) => item.exercise);
      const actuals = structure.resultView.results;
      return {
        context: { session, ...structure, exercises },
        exercises: [
          ...new Set([
            ...historyIdsForExercises(exercises),
            ...actuals
              .filter((row) => personalRecords(row, []).length > 0)
              .map((row) => row.exerciseId),
          ]),
        ],
      };
    },
    async (tx, context) => {
      if (!context) return null;
      const { exercises, ...detail } = context;
      return {
        ...detail,
        previousSets: await readPerformedExerciseHistory(
          tx,
          user,
          context.session,
          exercises,
          context.resultView.results,
        ),
      };
    },
  );
}
export type StructuredWorkoutDetail = NonNullable<
  Awaited<ReturnType<typeof readStructuredWorkoutDetail>>
>;
