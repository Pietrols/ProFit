import { expect, it } from 'vitest';
import { createDatabase, migrate, type Database } from '../database';
import { migrations } from '../migrations';
import { nodeDriver, testDatabase } from './nodeDriver';
import {
  at,
  other,
  sessionId,
  snapshot,
  user,
} from '../../../features/workouts/__tests__/fixtures';

async function insert(db: Database, saved: string) {
  await db.run(
    `INSERT INTO workout_sessions
    (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at, dirty)
    VALUES (?, ?, ?, ?, '2026-10-09', ?, ?, 'completed', '', 0, ?, ?, 1)`,
    [
      sessionId,
      user,
      user,
      other,
      at(0).toISOString(),
      at(5).toISOString(),
      saved,
      at(5).toISOString(),
    ],
  );
}

it('indexes exercise ids once per session and retains previous ids until invalidation can be repaired', async () => {
  const db = await testDatabase();
  const saved = snapshot();
  saved.exercises.push({ ...saved.exercises[0]! });
  await insert(db, JSON.stringify(saved));
  expect(await db.all('SELECT * FROM workout_history_catalog')).toEqual([
    { user_id: user, exercise_id: 'Barbell_Bench_Press', session_id: sessionId },
  ]);
  saved.exercises.forEach((e) => {
    e.exerciseId = 'Other_exercise';
  });
  await db.run('UPDATE workout_sessions SET snapshot = ? WHERE id = ?', [
    JSON.stringify(saved),
    sessionId,
  ]);
  expect(
    await db.all('SELECT exercise_id FROM workout_history_catalog ORDER BY exercise_id'),
  ).toEqual([{ exercise_id: 'Barbell_Bench_Press' }, { exercise_id: 'Other_exercise' }]);
  await db.run('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
  expect(await db.first('SELECT COUNT(*) AS n FROM workout_history_catalog')).toEqual({ n: 2 });
  expect(await db.first('SELECT * FROM workout_history_dirty')).toEqual({
    user_id: user,
    session_id: sessionId,
  });
  expect(await db.all('SELECT * FROM workout_history_catalog WHERE user_id = ?', [other])).toEqual(
    [],
  );
});

it('backfills metadata without changing legacy canonical rows, including malformed data', async () => {
  for (const saved of [JSON.stringify(snapshot()), '{', '{"exercises":[3,"not json",null,{}]}']) {
    const db = createDatabase(nodeDriver());
    await migrate(
      db,
      migrations.filter((m) => m.version <= 6),
    );
    await insert(db, saved);
    const before = await db.all('SELECT * FROM workout_sessions');
    await migrate(db, migrations);
    expect(await db.all('SELECT * FROM workout_sessions')).toEqual(before);
    expect(await db.first('SELECT COUNT(*) AS n FROM workout_history_catalog')).toEqual({
      n: saved === JSON.stringify(snapshot()) ? 1 : 0,
    });
  }
});
