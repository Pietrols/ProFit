import type { Database } from '../../lib/db/database';
import { readWorkoutPage, type WorkoutCursor, type WorkoutHistoryFilters } from './workoutReads';

// Counts are labelled saved results, including incomplete entries. Eligibility belongs in detail.
export function readWorkoutHistory(
  db: Database,
  user: string,
  filters: WorkoutHistoryFilters,
  cursor: WorkoutCursor | null = null,
) {
  return db.transaction(async (tx) => {
    const page = await readWorkoutPage(tx, user, cursor, {
      ...filters,
      status: filters.status ?? 'saved',
    });
    const ids = page.sessions.map((session) => session.id);
    if (!ids.length) return { entries: [], next: page.next };
    const counts = await tx.all<{ sessionId: string; count: number }>(
      `SELECT session_id AS sessionId, COUNT(*) AS count FROM set_logs
       WHERE user_id = ? AND deleted_at IS NULL AND session_id IN (${ids.map(() => '?').join(', ')})
       GROUP BY session_id`,
      [user, ...ids],
    );
    const saved = new Map(counts.map((row) => [row.sessionId, row.count]));
    return {
      entries: page.sessions.map((session) => ({
        session,
        savedResults: saved.get(session.id) ?? 0,
      })),
      next: page.next,
    };
  });
}
export type WorkoutHistoryPage = Awaited<ReturnType<typeof readWorkoutHistory>>;
