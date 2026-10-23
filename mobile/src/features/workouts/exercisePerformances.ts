import type { Database } from '../../lib/db/database';
import { withFreshHistory } from './historyIndex';
import { validUuid } from './model';
import type { WorkoutResult } from './structureTypes';
import { WORKOUT_PAGE_SIZE } from './workoutReads';

export type ExerciseCursor = { loggedMs: number; id: string };
type Row = {
  id: string;
  sessionId: string;
  loggedMs: number;
  localDate: string;
  planName: string;
  dayName: string;
  logJson: string;
};
export function readExercisePerformances(
  db: Database,
  user: string,
  exerciseId: string,
  cursor: ExerciseCursor | null = null,
) {
  if (!exerciseId.trim() || exerciseId.length > 200) throw new Error('Choose a valid exercise.');
  if (
    cursor &&
    (!validUuid(cursor.id) ||
      !Number.isSafeInteger(cursor.loggedMs) ||
      cursor.loggedMs < 0 ||
      cursor.loggedMs > 8.64e15)
  )
    throw new Error('This exercise history page is invalid. Open it again.');
  return withFreshHistory(
    db,
    user,
    async () => ({ context: exerciseId, exercises: [exerciseId] }),
    async (tx, selected) => {
      const rows = await tx.all<Row>(
        `SELECT h.id, h.session_id AS sessionId, h.logged_ms AS loggedMs,
         s.local_date AS localDate, json_extract(s.snapshot, '$.planName') AS planName,
         json_extract(s.snapshot, '$.dayName') AS dayName, h.log_json AS logJson
         FROM workout_history_index h JOIN workout_sessions s ON s.id = h.session_id AND s.user_id = h.user_id
         WHERE h.user_id = ? AND h.exercise_id = ? AND s.status = 'completed' AND s.deleted_at IS NULL
         ${cursor ? 'AND (h.logged_ms < ? OR (h.logged_ms = ? AND h.id < ?))' : ''}
         ORDER BY h.logged_ms DESC, h.id DESC LIMIT ?`,
        cursor
          ? [user, selected, cursor.loggedMs, cursor.loggedMs, cursor.id, WORKOUT_PAGE_SIZE + 1]
          : [user, selected, WORKOUT_PAGE_SIZE + 1],
      );
      const entries = rows
        .slice(0, WORKOUT_PAGE_SIZE)
        .map(({ logJson, ...row }) => ({ ...row, log: JSON.parse(logJson) as WorkoutResult }));
      const last = entries.at(-1);
      return {
        entries,
        next:
          rows.length > WORKOUT_PAGE_SIZE && last ? { loggedMs: last.loggedMs, id: last.id } : null,
      };
    },
  );
}
export type ExercisePerformancesPage = Awaited<ReturnType<typeof readExercisePerformances>>;
