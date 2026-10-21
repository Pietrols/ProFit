import { expect, it } from 'vitest';
import { createDatabase, migrate, type SqlValue } from '../../../lib/db/database';
import { migrations } from '../../../lib/db/migrations';
import { nodeDriver } from '../../../lib/db/__tests__/nodeDriver';
import { withFreshHistory } from '../historyIndex';
import { performedResults, prefillFromSets } from '../logic';
import { readStructuredWorkoutDetail } from '../structuredDetail';
import { setLogId } from '../identity';
import { saveSet } from '../workouts';
import { at, other, session, sessionId, set, user } from './fixtures';

async function fixture() {
  const driver = nodeDriver();
  const calls: { sql: string; params: SqlValue[]; rows: number }[] = [];
  const db = createDatabase({
    ...driver,
    all: async <T>(sql: string, params: SqlValue[]) => {
      const rows = await driver.all<T>(sql, params);
      calls.push({ sql, params, rows: rows.length });
      return rows;
    },
  });
  await migrate(db, migrations);
  const original = session();
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', '', 0, ?, ?, NULL, 1)`,
    [
      other,
      user,
      original.planId,
      original.dayId,
      original.localDate,
      at(-10).toISOString(),
      at(-5).toISOString(),
      JSON.stringify(original.snapshot),
      at(-5).toISOString(),
    ],
  );
  await db.run(
    `INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at)
    VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?)`,
    [
      setLogId(other, 0, 0),
      user,
      other,
      at(-9).toISOString(),
      JSON.stringify(set().logFields),
      '{"weight":50,"reps":8}',
      at(-9).toISOString(),
    ],
  );
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [
      sessionId,
      user,
      original.planId,
      original.dayId,
      original.localDate,
      original.startedAt,
      JSON.stringify(original.snapshot),
      original.startedAt,
    ],
  );
  await saveSet(db, user, { ...set(), values: { weight: 60, reps: 8 } }, at(1));
  calls.length = 0;
  return { db, calls, driver };
}

it('reuses the owned detail read, repairs comparisons atomically and keeps warm reads bounded', async () => {
  const { db, calls, driver } = await fixture();
  await readStructuredWorkoutDetail(db, user, sessionId);
  calls.length = 0;
  const detail = (await readStructuredWorkoutDetail(db, user, sessionId))!;
  expect(calls).toHaveLength(6);
  expect(calls.filter((call) => call.sql.includes('FROM workout_sessions'))).toHaveLength(1);
  expect(calls.filter((call) => call.sql.includes('FROM set_logs'))).toHaveLength(1);
  expect(calls.reduce((sum, call) => sum + call.rows, 0)).toBeLessThanOrEqual(5);
  const exercise = detail.itemView.items[0]!.exercise;
  expect(prefillFromSets(exercise, exercise, detail.previousSets).weight).toBe(50);
  expect(
    performedResults(detail.session, detail.resultView.results, detail.previousSets).records.find(
      (row) => row.record.metric === 'heaviestWeight',
    )!.record.previousBest,
  ).toBe(50);
  expect(await readStructuredWorkoutDetail(db, other, sessionId)).toBeNull();
  driver.raw.close();
});

it('keeps targeted invalidation queries within SQLite limits for many effective exercise ids', async () => {
  const { db, calls, driver } = await fixture();
  const names = Array.from({ length: 1200 }, (_, index) => `Exercise_${index}`);
  names.push('Barbell_Bench_Press');
  await withFreshHistory(
    db,
    user,
    async () => ({ context: null, exercises: names }),
    async () => null,
  );
  expect(calls.every(({ params }) => params.length <= 999)).toBe(true);
  expect(await db.first('SELECT COUNT(*) AS n FROM workout_history_dirty')).toEqual({ n: 0 });
  driver.raw.close();
});
