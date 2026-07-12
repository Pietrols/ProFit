import { DbLike, Exercise } from './types';
import { getMeta, setMeta, upsertExercises } from './exercisesRepo';

const CURSOR_KEY = 'exercises.lastSyncServerTime';

export interface ExercisePage {
  serverTime: string;
  exercises: Exercise[];
}

export type ExerciseFetcher = (
  updatedSince: string | null,
) => Promise<ExercisePage>;

/**
 * Pull-sync the exercise library. Idempotent: rows are keyed on the server's
 * stable id and INSERT OR REPLACEd, so re-running (or a retry after a crash
 * mid-sync) can never duplicate. The cursor is the server's clock, stored
 * only after the page is fully applied.
 */
export async function syncExercises(
  db: DbLike,
  fetchPage: ExerciseFetcher,
): Promise<{ applied: number }> {
  const cursor = await getMeta(db, CURSOR_KEY);
  const page = await fetchPage(cursor);
  await upsertExercises(db, page.exercises);
  await setMeta(db, CURSOR_KEY, page.serverTime);
  return { applied: page.exercises.length };
}
