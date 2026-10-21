import { expect, it } from 'vitest';
import { createDatabase, migrate } from '../database';
import { migrations } from '../migrations';
import { nodeDriver, testDatabase } from './nodeDriver';
import { saveSet } from '../../../features/workouts/workouts';
import {
  at,
  other,
  sessionId,
  set,
  snapshot,
  user,
} from '../../../features/workouts/__tests__/fixtures';

const activeId = '00000000-0000-4000-8000-000000000004';
async function fixture() {
  const db = createDatabase(nodeDriver());
  await migrate(
    db,
    migrations.filter((m) => m.version <= 5),
  );
  for (const id of [sessionId, activeId]) {
    await db.run(
      `INSERT INTO workout_sessions
      (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at, dirty)
      VALUES (?, ?, ?, ?, '2026-10-09', ?, ?, ?, '', 0, ?, ?, 1)`,
      [
        id,
        user,
        user,
        other,
        at(0).toISOString(),
        id === activeId ? null : at(5).toISOString(),
        id === activeId ? 'active' : 'completed',
        JSON.stringify(snapshot()),
        at(0).toISOString(),
      ],
    );
  }
  await db.run(
    `INSERT INTO set_logs
    (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at, dirty)
    VALUES (?, ?, ?, 0, 0, ?, ?, '{"reps":8,"weight":45}', ?, 1)`,
    [
      other,
      user,
      sessionId,
      at(1).toISOString(),
      JSON.stringify(snapshot().exercises[0]!.logFields),
      at(1).toISOString(),
    ],
  );
  return db;
}

it('adds a rebuild queue without changing populated canonical rows or pending sync edits', async () => {
  const db = await fixture();
  const sessions = await db.all('SELECT * FROM workout_sessions ORDER BY id');
  const legacySetColumns = `id, user_id, session_id, exercise_position, set_index, logged_at,
    log_fields, values_json, updated_at, deleted_at, dirty`;
  const sets = await db.all(`SELECT ${legacySetColumns} FROM set_logs ORDER BY id`);
  await migrate(db, migrations);
  expect(await db.all('SELECT * FROM workout_sessions ORDER BY id')).toEqual(sessions);
  expect(await db.all(`SELECT ${legacySetColumns} FROM set_logs ORDER BY id`)).toEqual(sets);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([
    { user_id: user, session_id: sessionId },
  ]);
  expect(await db.all('SELECT * FROM workout_history_index')).toEqual([]);
  await migrate(db, migrations);
  expect(await db.first('SELECT COUNT(*) AS n FROM workout_history_dirty')).toEqual({ n: 1 });
});

it('invalidates local and sync-shaped writes transactionally, with ownership and rollback', async () => {
  const db = await fixture();
  await migrate(db, migrations);
  await db.run('DELETE FROM workout_history_dirty');
  await db.run('UPDATE set_logs SET dirty = 0');
  await db.run("UPDATE workout_sessions SET notes = 'No result changed', dirty = 0");
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  await expect(
    db.transaction(async (tx) => {
      await tx.run('UPDATE set_logs SET values_json = \'{"reps":9}\'');
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  await db.run('UPDATE set_logs SET values_json = ?, updated_at = ?, dirty = 0 WHERE id = ?', [
    '{"reps":9,"weight":45}',
    at(2).toISOString(),
    other,
  ]);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([
    { user_id: user, session_id: sessionId },
  ]);
  await db.run('DELETE FROM workout_history_dirty');
  await db.run('UPDATE set_logs SET user_id = ? WHERE id = ?', [other, other]);
  expect(await db.all('SELECT * FROM workout_history_dirty ORDER BY user_id')).toEqual([
    { user_id: user, session_id: sessionId },
    { user_id: other, session_id: sessionId },
  ]);
});

it('queues finish, tombstones and physical removal, including children arriving before parents', async () => {
  const db = await fixture();
  await migrate(db, migrations);
  for (const action of [
    () =>
      db.run("UPDATE workout_sessions SET status = 'completed', ended_at = ? WHERE id = ?", [
        at(5).toISOString(),
        activeId,
      ]),
    () =>
      db.run('UPDATE workout_sessions SET deleted_at = ? WHERE id = ?', [
        at(6).toISOString(),
        activeId,
      ]),
    () => db.run('DELETE FROM workout_sessions WHERE id = ?', [activeId]),
    () => db.run('UPDATE set_logs SET session_id = ? WHERE id = ?', [activeId, other]),
    () => db.run('UPDATE set_logs SET deleted_at = ? WHERE id = ?', [at(7).toISOString(), other]),
    () => db.run('DELETE FROM set_logs WHERE id = ?', [other]),
  ]) {
    await db.run('DELETE FROM workout_history_dirty');
    await action();
    expect(
      await db.first('SELECT * FROM workout_history_dirty WHERE user_id = ? AND session_id = ?', [
        user,
        activeId,
      ]),
    ).toEqual({ user_id: user, session_id: activeId });
  }
});

it('creates the derived tables for a fresh installation', async () => {
  const db = await testDatabase();
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  expect(await db.all('SELECT * FROM workout_history_index')).toEqual([]);
});

it('keeps repeated canonical upserts working while invalidation is already queued', async () => {
  const db = await fixture();
  await migrate(db, migrations);
  await saveSet(db, user, set(), at(2));
  await saveSet(db, user, { ...set(), values: { reps: 9, weight: 45 } }, at(3));
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([
    { user_id: user, session_id: sessionId },
  ]);
});
