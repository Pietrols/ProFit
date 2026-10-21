import type { Sql, SqlValue } from '../../lib/db/database';
import { completedSets, personalRecords, type ExerciseSet } from './logic';
import { prefillRequestsForExercises } from './historyRequests';
import type { WorkoutResult } from './structureTypes';
import type { SetLog, SnapshotExercise, WorkoutSession } from './types';

type Row = { exercise_id: string; log_json: string };
const previous = `previous AS NOT MATERIALIZED (
  SELECT * FROM workout_history_index WHERE user_id = ? AND session_id <> ? AND completed_ms <= ?
)`;
const beforeCandidate =
  '(h.logged_ms < c.logged_ms OR (h.logged_ms = c.logged_ms AND h.id < c.id))';

// The caller repairs the projection and reads the current workout in the same snapshot.
export async function readExerciseHistory(
  db: Sql,
  user: string,
  session: WorkoutSession,
  logs: readonly SetLog[],
): Promise<ExerciseSet[]> {
  return readPerformedExerciseHistory(
    db,
    user,
    session,
    session.snapshot.exercises,
    completedSets(session, logs).map((log) => ({
      exerciseId: session.snapshot.exercises[log.exercisePosition]!.exerciseId,
      log,
    })),
  );
}

// Current item targets and resolved actuals are independent of the original routine's order.
export async function readPerformedExerciseHistory(
  db: Sql,
  user: string,
  session: WorkoutSession,
  exercises: readonly SnapshotExercise[],
  actuals: readonly ExerciseSet[],
): Promise<ExerciseSet[]> {
  const base: SqlValue[] = [user, session.id, Date.parse(session.startedAt)];
  const found = new Map<string, ExerciseSet>();
  const collect = (rows: Row[]) => {
    for (const row of rows) {
      const log = JSON.parse(row.log_json) as WorkoutResult;
      found.set(log.id, { exerciseId: row.exercise_id, log });
    }
  };
  const requested = prefillRequestsForExercises(exercises);
  for (let start = 0; start < requested.length; start += 200) {
    const batch = requested.slice(start, start + 200);
    const values = batch.map(() => '(?, ?)').join(', ');
    collect(
      await db.all<Row>(
        `WITH ${previous}, requested(exercise_id, field) AS (VALUES ${values}),
      wanted AS (SELECT (SELECT h.id FROM previous h WHERE h.exercise_id = r.exercise_id
        AND CASE r.field WHEN 'weight' THEN h.weight WHEN 'reps' THEN h.reps
          WHEN 'time' THEN h.time WHEN 'distance' THEN h.distance END IS NOT NULL
        ORDER BY h.logged_ms DESC, h.id DESC LIMIT 1) AS id FROM requested r)
      SELECT exercise_id, log_json FROM previous WHERE id IN (SELECT id FROM wanted)`,
        [...base, ...batch.flatMap((r) => [r.exerciseId, r.field])],
      ),
    );
  }
  const candidates = actuals
    .filter((candidate) => personalRecords(candidate, []).length > 0)
    .map(({ exerciseId, log }) => [
      exerciseId,
      Date.parse(log.loggedAt),
      log.id,
      log.values.weight ?? null,
    ]);
  // Candidate-dependent lookups preserve exact same-instant ordering and reps at each load.
  for (let start = 0; start < candidates.length; start += 50) {
    const batch = candidates.slice(start, start + 50);
    const metrics = ['eligible_weight', 'reps', 'one_rep_max', 'time'] as const;
    const wanted = metrics
      .map(
        (metric) => `SELECT (SELECT h.id FROM previous h
      WHERE h.exercise_id = c.exercise_id AND ${beforeCandidate} AND h.${metric} > 0
        ${metric === 'reps' ? 'AND h.weight = c.weight' : ''}
      ORDER BY h.${metric} DESC LIMIT 1) AS id FROM candidates c`,
      )
      .join(' UNION ');
    collect(
      await db.all<Row>(
        `WITH ${previous},
      candidates(exercise_id, logged_ms, id, weight) AS (VALUES ${batch.map(() => '(?, ?, ?, ?)').join(', ')}),
      wanted AS (${wanted})
      SELECT exercise_id, log_json FROM previous WHERE id IN (SELECT id FROM wanted)`,
        [...base, ...batch.flat()],
      ),
    );
  }
  return [...found.values()];
}
