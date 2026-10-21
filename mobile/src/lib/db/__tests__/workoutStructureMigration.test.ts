import { expect, it } from 'vitest';
import { createDatabase, migrate } from '../database';
import { migrations } from '../migrations';
import { nodeDriver, testDatabase } from './nodeDriver';
import {
  at,
  other,
  sessionId,
  snapshot,
  user,
} from '../../../features/workouts/__tests__/fixtures';

const legacyColumns = `id, user_id, session_id, exercise_position, set_index, logged_at,
  log_fields, values_json, updated_at, deleted_at, dirty`;

it('preserves populated legacy sessions, dirty sets, tombstones and repeated exercises in place', async () => {
  const db = createDatabase(nodeDriver());
  await migrate(
    db,
    migrations.filter((migration) => migration.version <= 7),
  );
  const original = snapshot();
  original.exercises.push({ ...original.exercises[0]! });
  for (const [id, status] of [
    [sessionId, 'completed'],
    [other, 'active'],
  ] as const) {
    await db.run(
      `INSERT INTO workout_sessions
      (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at, dirty)
      VALUES (?, ?, ?, ?, '2026-10-09', ?, ?, ?, 'Keep notes', 1, ?, ?, 1)`,
      [
        id,
        user,
        user,
        other,
        at(0).toISOString(),
        status === 'completed' ? at(3).toISOString() : null,
        status,
        JSON.stringify(original),
        at(3).toISOString(),
      ],
    );
  }
  for (let index = 0; index < 3; index++) {
    await db.run(
      `INSERT INTO set_logs (${legacyColumns}) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        `00000000-0000-4000-8000-00000000001${index}`,
        user,
        index === 2 ? other : sessionId,
        index === 1 ? 1 : 0,
        at(1).toISOString(),
        '["weight","reps"]',
        '{"weight":60,"reps":8}',
        at(2).toISOString(),
        index === 1 ? at(2).toISOString() : null,
        index === 0 ? 0 : 1,
      ],
    );
  }
  const sessions = await db.all('SELECT * FROM workout_sessions ORDER BY id');
  const results = await db.all(`SELECT ${legacyColumns} FROM set_logs ORDER BY id`);
  const queue = await db.all('SELECT * FROM workout_history_dirty ORDER BY session_id');
  await migrate(db, migrations);
  expect(await db.all('SELECT * FROM workout_sessions ORDER BY id')).toEqual(sessions);
  expect(await db.all(`SELECT ${legacyColumns} FROM set_logs ORDER BY id`)).toEqual(results);
  expect(await db.all('SELECT * FROM workout_history_dirty ORDER BY session_id')).toEqual(queue);
  expect(
    await db.all('SELECT DISTINCT item_id, side, targets_at_performance FROM set_logs'),
  ).toEqual([{ item_id: null, side: null, targets_at_performance: null }]);
  expect(await db.all('SELECT * FROM session_items')).toEqual([]);
  expect(await db.first('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
  await migrate(db, migrations);
  expect(await db.all(`SELECT ${legacyColumns} FROM set_logs ORDER BY id`)).toEqual(results);
});

it('queues item changes transactionally, retaining old exercise tags and allowing original-position null', async () => {
  const db = await testDatabase();
  const exercise = snapshot().exercises[0]!;
  const insert = `INSERT INTO session_items
    (id, user_id, session_id, origin, original_position, position, state, exercise, updated_at, dirty)
    VALUES (?, ?, ?, 'added', NULL, 0, 'active', ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET exercise = excluded.exercise`;
  const params = [other, user, sessionId, JSON.stringify(exercise), at(0).toISOString()];
  await db.run(insert, params);
  await db.run(insert, params);
  await db.run('DELETE FROM workout_history_dirty');
  await expect(
    db.transaction(async (tx) => {
      await tx.run('UPDATE session_items SET exercise = ?', [
        JSON.stringify({ ...exercise, exerciseId: 'Rolled_back' }),
      ]);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  expect(await db.all('SELECT exercise_id FROM workout_history_catalog')).toEqual([
    { exercise_id: exercise.exerciseId },
  ]);
  await db.run('UPDATE session_items SET exercise = ?, state = ?, deleted_at = ?', [
    JSON.stringify({ ...exercise, exerciseId: 'Added_row' }),
    'removed',
    at(1).toISOString(),
  ]);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([
    { user_id: user, session_id: sessionId },
  ]);
  expect(
    await db.all('SELECT exercise_id FROM workout_history_catalog ORDER BY exercise_id'),
  ).toEqual([{ exercise_id: 'Added_row' }, { exercise_id: exercise.exerciseId }]);
  await db.run(
    `INSERT INTO set_logs
    (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at, item_id, side, targets_at_performance)
    VALUES (?, ?, ?, NULL, 0, ?, '["reps"]', '{"reps":8}', ?, ?, 'bilateral', ?)`,
    [user, user, sessionId, at(1).toISOString(), at(1).toISOString(), other, '{"sets":3}'],
  );
  expect(await db.first('SELECT exercise_position FROM set_logs')).toEqual({
    exercise_position: null,
  });
});
