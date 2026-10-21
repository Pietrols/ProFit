import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { refreshHistoryIndex, withFreshHistory } from '../historyIndex';
import { prefillFromSets } from '../logic';
import { readExerciseHistory } from '../historyQueries';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { at, other, session, sessionId, set, user } from './fixtures';

async function fixture() {
  const db = await testDatabase();
  const value = { ...session(), id: sessionId, updatedAt: at(0).toISOString() };
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', '', 0, ?, ?, NULL, 1)`,
    [
      value.id,
      user,
      value.planId,
      value.dayId,
      value.localDate,
      value.startedAt,
      at(5).toISOString(),
      JSON.stringify(value.snapshot),
      value.updatedAt,
    ],
  );
  const planned = sessionItemsView(value, []).items[0]!;
  const item = {
    ...planned,
    id: other,
    origin: 'added' as const,
    originalPosition: null,
    replacesItemId: null,
    exercise: { ...planned.exercise, exerciseId: 'Added_row' },
  };
  const id = sessionSlotId(item, 2);
  await db.run(
    `INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields,
    values_json, updated_at, dirty, item_id, side, targets_at_performance) VALUES (?, ?, ?, NULL, 2, ?, ?, ?, ?, 1, ?, 'bilateral', ?)`,
    [
      id,
      user,
      sessionId,
      at(1).toISOString(),
      JSON.stringify(set().logFields),
      JSON.stringify(set().values),
      at(1).toISOString(),
      item.id,
      JSON.stringify({
        sets: 3,
        targetReps: 8,
        targetTimeSeconds: null,
        targetDistanceMetres: null,
        restSeconds: 60,
      }),
    ],
  );
  const insertItem = () =>
    db.run(
      `INSERT INTO session_items VALUES (?, ?, ?, 'added', NULL, NULL, 0, 'active', NULL, ?, ?, NULL, 1)`,
      [item.id, user, sessionId, JSON.stringify(item.exercise), at(0).toISOString()],
    );
  return { db, value, item, id, insertItem };
}

it('indexes child-before-item arrivals and keeps actual work after item reduction, removal and tombstoning', async () => {
  const { db, item, id, insertItem } = await fixture();
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 0 });
  await insertItem();
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 1 });
  for (const state of ['skipped', 'removed']) {
    await db.run('UPDATE session_items SET state = ?, exercise = ?, deleted_at = ?', [
      state,
      JSON.stringify({ ...item.exercise, sets: 1 }),
      at(6).toISOString(),
    ]);
    expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 1 });
    const stored = await db.first<{ exercise_id: string; log_json: string }>(
      'SELECT exercise_id, log_json FROM workout_history_index',
    );
    expect(stored!.exercise_id).toBe('Added_row');
    expect(JSON.parse(stored!.log_json)).toMatchObject({
      id,
      exercisePosition: null,
      setIndex: 2,
      targetsAtPerformance: { sets: 3 },
    });
  }
  await db.run('UPDATE set_logs SET deleted_at = ?', [at(7).toISOString()]);
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 0 });
  await db.run('UPDATE set_logs SET deleted_at = NULL');
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 1 });
  await db.run('UPDATE workout_sessions SET deleted_at = ?', [at(8).toISOString()]);
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 0 });
});

it('repairs the relevant exercise catalog and returns stable sparse history without scanning unrelated sessions', async () => {
  const { db, value, item, insertItem } = await fixture();
  await refreshHistoryIndex(db, user);
  await insertItem();
  const current = {
    ...value,
    id: user,
    startedAt: at(10).toISOString(),
    snapshot: { ...value.snapshot, exercises: [item.exercise] },
  };
  const prepared = await withFreshHistory(
    db,
    user,
    async () => ({ context: current, exercises: ['Added_row'] }),
    (tx, session) => readExerciseHistory(tx, user, session, []),
  );
  expect(prepared).toHaveLength(1);
  expect(prepared[0]!.log.exercisePosition).toBeNull();
  expect(prefillFromSets(item.exercise, item.exercise, prepared).weight).toBe(45);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  expect(await refreshHistoryIndex(db, other)).toEqual({ sessions: 0, results: 0 });
});
