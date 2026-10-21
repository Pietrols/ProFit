import { expect, it } from 'vitest';
import type { Database, SqlValue } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { saveDay, savePlan } from '../../plans/plans';
import { rebuildHistoryIndex, refreshHistoryIndex } from '../historyIndex';
import {
  deleteSession,
  deleteSet,
  finishSession,
  getSession,
  listSets,
  saveSet,
  startSession,
} from '../workouts';
import { at, other, sessionId, set, snapshot, user } from './fixtures';

async function fixture() {
  const db = await testDatabase();
  const planId = await savePlan(
    db,
    user,
    { name: 'Cycle', shape: 'cycle', difficulty: 'standard', active: true },
    at(0),
  );
  const dayId = await saveDay(
    db,
    user,
    { planId, position: 0, weekday: null, name: 'Push', restDay: false },
    at(0),
  );
  await startSession(
    db,
    user,
    { planId, dayId, localDate: '2026-10-09', snapshot: snapshot() },
    at(0),
    sessionId,
  );
  const id = await saveSet(db, user, set(), at(1));
  return { db, id };
}
const rows = (db: Database) =>
  db.all<{ log_json: string }>('SELECT * FROM workout_history_index ORDER BY id');

it('indexes only completed owned results and does no canonical history work when warm', async () => {
  const { db, id } = await fixture();
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 0 });
  await finishSession(db, user, sessionId, 'completed', at(5));
  expect(await refreshHistoryIndex(db, other)).toEqual({ sessions: 0, results: 0 });
  expect(await refreshHistoryIndex(db, user)).toEqual({ sessions: 1, results: 1 });
  const indexed = await db.first(
    'SELECT id, user_id, exercise_id, weight, reps, logged_ms FROM workout_history_index',
  );
  expect(indexed).toEqual({
    id,
    user_id: user,
    exercise_id: 'Barbell_Bench_Press',
    weight: 45,
    reps: 8,
    logged_ms: at(1).getTime(),
  });
  const warmReads: string[] = [];
  const warm: Database = {
    ...db,
    transaction: (action) =>
      db.transaction((tx) =>
        action({
          ...tx,
          all: async <T>(sql: string, params?: SqlValue[]) => {
            warmReads.push(sql);
            return tx.all<T>(sql, params);
          },
        }),
      ),
  };
  expect(await refreshHistoryIndex(warm, user)).toEqual({ sessions: 0, results: 0 });
  expect(warmReads).toHaveLength(1);
  expect(warmReads[0]).toContain('FROM workout_history_dirty');
  const before = {
    session: await getSession(db, user, sessionId),
    logs: await listSets(db, user, sessionId),
  };
  const index = await rows(db);
  await rebuildHistoryIndex(db, user);
  expect(await rows(db)).toEqual(index);
  expect({
    session: await getSession(db, user, sessionId),
    logs: await listSets(db, user, sessionId),
  }).toEqual(before);
});

it('invalidates corrections, tombstones and explicit restore without rewriting performance time', async () => {
  const { db, id } = await fixture();
  await finishSession(db, user, sessionId, 'completed', at(5));
  await refreshHistoryIndex(db, user);
  await saveSet(db, user, { ...set(), values: { reps: 9, weight: 50 } }, at(6));
  await refreshHistoryIndex(db, user);
  expect(JSON.parse((await rows(db))[0]!.log_json)).toMatchObject({
    values: { reps: 9, weight: 50 },
    loggedAt: at(1).toISOString(),
  });
  await deleteSet(db, user, id, at(7));
  await refreshHistoryIndex(db, user);
  expect(await rows(db)).toEqual([]);
  await saveSet(db, user, set(), at(8));
  await refreshHistoryIndex(db, user);
  expect(await rows(db)).toHaveLength(1);
  await deleteSession(db, user, sessionId, at(9));
  await refreshHistoryIndex(db, user);
  expect(await rows(db)).toEqual([]);
});

it('retains the invalidation and prior projection when rebuilding fails, then recovers', async () => {
  const { db } = await fixture();
  await finishSession(db, user, sessionId, 'completed', at(5));
  await refreshHistoryIndex(db, user);
  const previous = await rows(db);
  await saveSet(db, user, { ...set(), values: { reps: 10, weight: 50 } }, at(6));
  const failing: Database = {
    ...db,
    transaction: (action) =>
      db.transaction((tx) =>
        action({
          ...tx,
          run: (sql, params) => {
            if (sql.startsWith('INSERT INTO workout_history_index'))
              throw new Error('disk unavailable');
            return tx.run(sql, params);
          },
        }),
      ),
  };
  await expect(refreshHistoryIndex(failing, user)).rejects.toThrow('disk unavailable');
  expect(await rows(db)).toEqual(previous);
  expect(
    await db.first('SELECT COUNT(*) AS n FROM workout_history_dirty WHERE user_id = ?', [user]),
  ).toEqual({ n: 1 });
  await refreshHistoryIndex(db, user);
  expect(JSON.parse((await rows(db))[0]!.log_json)).toMatchObject({
    values: { reps: 10, weight: 50 },
  });
});
