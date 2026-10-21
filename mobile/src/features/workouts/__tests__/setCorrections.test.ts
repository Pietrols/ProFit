import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { saveDay, savePlan } from '../../plans/plans';
import { syncedCollections } from '../../sync/collections';
import { createSyncEngine } from '../../sync/engine';
import { fakeSyncServer } from '../../sync/__tests__/fakeSyncServer';
import { refreshHistoryIndex } from '../historyIndex';
import { sessionResultsFromSets } from '../logic';
import { readWorkoutDetail } from '../workoutDetail';
import { correctLoggedSet, removeLoggedSet, undoLoggedSet } from '../setCorrections';
import { SetConflictError, type SetRecord } from '../setChanges';
import { sessionSlotId } from '../structureIdentity';
import { readStructuredWorkout } from '../structureReads';
import type { SessionItem } from '../structureTypes';
import {
  deleteSession,
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
    {
      planId,
      dayId,
      localDate: '2026-10-09',
      snapshot: snapshot(),
    },
    at(0),
    sessionId,
  );
  await saveSet(db, user, { ...set(), values: { weight: 80, reps: 8 } }, at(1));
  const target: SetRecord = { ...(await listSets(db, user, sessionId))[0]!, deletedAt: null };
  return { db, target };
}

async function stableFixture() {
  const { db } = await fixture();
  const session = (await getSession(db, user, sessionId))!;
  const exercise = session.snapshot.exercises[0]!;
  const item: SessionItem = {
    id: other,
    sessionId,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 1,
    state: 'removed',
    reason: 'Bench was busy',
    exercise: { ...exercise, exerciseId: 'Added_row', sets: 1, logFields: ['notes'] },
    updatedAt: at(2).toISOString(),
    deletedAt: at(2).toISOString(),
  };
  await db.run(
    `INSERT INTO session_items VALUES (?, ?, ?, 'added', NULL, NULL, 1, 'removed', ?, ?, ?, ?, 1)`,
    [
      item.id,
      user,
      sessionId,
      item.reason,
      JSON.stringify(item.exercise),
      item.updatedAt,
      item.deletedAt,
    ],
  );
  const id = sessionSlotId(item, 2);
  await db.run(
    `INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields,
    values_json, updated_at, dirty, item_id, side, targets_at_performance) VALUES (?, ?, ?, NULL, 2, ?, ?, ?, ?, 1, ?, 'bilateral', ?)`,
    [
      id,
      user,
      sessionId,
      at(1).toISOString(),
      JSON.stringify(exercise.logFields),
      '{"weight":80,"reps":8}',
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
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  const target: SetRecord = {
    ...detail.resultRecords.find((log) => log.id === id)!,
    deletedAt: null,
  };
  return { db, target };
}

it('corrects, deletes and undoes a removed added exercise while retaining its original slot and targets', async () => {
  const { db, target } = await stableFixture();
  await finishSession(db, user, sessionId, 'completed', at(3));
  const before = await getSession(db, user, sessionId);
  const next = await correctLoggedSet(db, user, target, { weight: 60, reps: 8 }, at(4));
  expect(next).toEqual({
    ...target,
    values: { weight: 60, reps: 8 },
    updatedAt: at(4).toISOString(),
  });
  await refreshHistoryIndex(db, user);
  expect(
    await db.first(
      "SELECT weight, reps FROM workout_history_index WHERE exercise_id = 'Added_row'",
    ),
  ).toEqual({ weight: 60, reps: 8 });
  const receipt = await removeLoggedSet(db, user, next, at(5));
  await refreshHistoryIndex(db, user);
  expect(
    await db.first("SELECT id FROM workout_history_index WHERE exercise_id = 'Added_row'"),
  ).toBeNull();
  expect(await undoLoggedSet(db, user, receipt, at(6))).toEqual({
    ...next,
    updatedAt: at(6).toISOString(),
  });
  await refreshHistoryIndex(db, user);
  expect(
    await db.first("SELECT weight FROM workout_history_index WHERE exercise_id = 'Added_row'"),
  ).toEqual({ weight: 60 });
  expect(await getSession(db, user, sessionId)).toEqual(before);
  expect(await db.first('SELECT COUNT(*) AS n FROM set_logs WHERE id = ?', [target.id])).toEqual({
    n: 1,
  });
});

it('rejects stable corrections and undo when another revision changes captured targets at equal edit time', async () => {
  const { db, target } = await stableFixture();
  if (!('itemId' in target)) throw new Error('Expected a stable fixture.');
  const targets = { ...target.targetsAtPerformance, restSeconds: 90 };
  await db.run('UPDATE set_logs SET targets_at_performance = ? WHERE id = ?', [
    JSON.stringify(targets),
    target.id,
  ]);
  await expect(correctLoggedSet(db, user, target, { weight: 60 }, at(3))).rejects.toThrow(
    SetConflictError,
  );
  const current: SetRecord = { ...target, targetsAtPerformance: targets };
  const receipt = await removeLoggedSet(db, user, current, at(4));
  await db.run('UPDATE set_logs SET targets_at_performance = ? WHERE id = ?', [
    JSON.stringify(target.targetsAtPerformance),
    target.id,
  ]);
  await expect(undoLoggedSet(db, user, receipt, at(5))).rejects.toThrow(SetConflictError);
  expect(
    (await db.first<{ values_json: string }>('SELECT values_json FROM set_logs WHERE id = ?', [
      target.id,
    ]))!.values_json,
  ).toBe('{"weight":80,"reps":8}');
});

it('corrects a completed result and rebuilds history without moving performance or session time', async () => {
  const { db, target } = await fixture();
  await finishSession(db, user, sessionId, 'completed', at(2));
  const parent = await getSession(db, user, sessionId);
  await refreshHistoryIndex(db, user);
  expect(await db.first('SELECT weight FROM workout_history_index')).toEqual({ weight: 80 });
  const next = await correctLoggedSet(db, user, target, { weight: 60, reps: 8 }, at(3));
  expect(next).toEqual({
    ...target,
    values: { weight: 60, reps: 8 },
    updatedAt: at(3).toISOString(),
  });
  expect(await getSession(db, user, sessionId)).toEqual(parent);
  expect(await db.first('SELECT dirty FROM set_logs')).toEqual({ dirty: 1 });
  await refreshHistoryIndex(db, user);
  expect(await db.first('SELECT weight, reps FROM workout_history_index')).toEqual({
    weight: 60,
    reps: 8,
  });
  const receipt = await removeLoggedSet(db, user, next, at(4));
  expect(await listSets(db, user, sessionId)).toEqual([]);
  await refreshHistoryIndex(db, user);
  expect(await db.all('SELECT * FROM workout_history_index')).toEqual([]);
  const restored = await undoLoggedSet(db, user, receipt, at(5));
  expect(restored).toEqual({ ...next, updatedAt: at(5).toISOString() });
  await refreshHistoryIndex(db, user);
  expect(await db.first('SELECT weight FROM workout_history_index')).toEqual({ weight: 60 });
  expect(await db.first('SELECT COUNT(*) AS n FROM set_logs')).toEqual({ n: 1 });
});

it('rejects invalid values, foreign accounts and stale edits atomically', async () => {
  const { db, target } = await fixture();
  for (const values of [{ time: 30 }, { weight: -1 }, {}])
    await expect(correctLoggedSet(db, user, target, values, at(2))).rejects.toThrow();
  await expect(correctLoggedSet(db, other, target, { weight: 60 }, at(2))).rejects.toThrow(
    'available',
  );
  await expect(removeLoggedSet(db, other, target, at(2))).rejects.toThrow('available');
  expect(await listSets(db, user, sessionId)).toEqual([{ ...target, deletedAt: undefined }]);
  // An incoming edit with an equal timestamp still invalidates the old draft revision.
  await db.run('UPDATE set_logs SET values_json = ? WHERE id = ?', [
    '{"weight":85,"reps":8}',
    target.id,
  ]);
  await expect(correctLoggedSet(db, user, target, { weight: 60 }, at(3))).rejects.toThrow(
    SetConflictError,
  );
  await expect(removeLoggedSet(db, user, target, at(3))).rejects.toThrow(SetConflictError);
  expect((await listSets(db, user, sessionId))[0]!.values.weight).toBe(85);
});

it('blocks stale undo after a new result in the slot, including a later deletion', async () => {
  const { db, target } = await fixture();
  const receipt = await removeLoggedSet(db, user, target, at(2));
  await saveSet(
    db,
    user,
    { ...set(), loggedAt: at(3).toISOString(), values: { weight: 90 } },
    at(3),
  );
  await expect(undoLoggedSet(db, user, receipt, at(4))).rejects.toThrow(SetConflictError);
  const newer: SetRecord = { ...(await listSets(db, user, sessionId))[0]!, deletedAt: null };
  await removeLoggedSet(db, user, newer, at(4));
  await expect(undoLoggedSet(db, user, receipt, at(5))).rejects.toThrow(SetConflictError);
  expect(await listSets(db, user, sessionId)).toEqual([]);
});

it('does not revive children of deleted or abandoned sessions or invalid slots', async () => {
  const { db, target } = await fixture();
  await db.run('UPDATE set_logs SET set_index = 99 WHERE id = ?', [target.id]);
  await expect(removeLoggedSet(db, user, target, at(2))).rejects.toThrow('matches');
  await db.run('UPDATE set_logs SET set_index = 0 WHERE id = ?', [target.id]);
  const receipt = await removeLoggedSet(db, user, target, at(2));
  await finishSession(db, user, sessionId, 'abandoned', at(3));
  await expect(undoLoggedSet(db, user, receipt, at(4))).rejects.toThrow('available');
  await deleteSession(db, user, sessionId, at(4));
  await expect(correctLoggedSet(db, user, target, { weight: 60 }, at(5))).rejects.toThrow(
    'available',
  );
  await expect(undoLoggedSet(db, user, receipt, at(5))).rejects.toThrow('available');
});

it('syncs corrections, deletion and undo to another SQLite phone and blocks undo over an arrived edit', async () => {
  const { db: a, target } = await fixture();
  const b = await testDatabase();
  const server = fakeSyncServer();
  const phone = (db: typeof a) =>
    createSyncEngine({ db, api: server.clientFor(user), collections: syncedCollections });
  const first = phone(a);
  const second = phone(b);
  await first.setUser(user);
  await second.setUser(user);
  await finishSession(a, user, sessionId, 'completed', at(2));
  const ended = (await getSession(a, user, sessionId))!.endedAt;
  await first.sync();
  await second.sync();
  const saved = async (db: typeof a): Promise<SetRecord> => ({
    ...(await listSets(db, user, sessionId))[0]!,
    deletedAt: null,
  });
  const results = async (db: typeof a) => {
    const detail = (await readWorkoutDetail(db, user, sessionId))!;
    return sessionResultsFromSets(detail.session, detail.logs, detail.previousSets);
  };
  server.state.online = false;
  await correctLoggedSet(b, user, await saved(b), { weight: 60, reps: 8 }, at(3));
  await second.sync();
  expect((await saved(a)).values.weight).toBe(80);
  expect((await results(b)).volumeKg).toBe(480);
  server.state.online = true;
  await second.sync();
  await first.sync();
  expect((await saved(a)).values.weight).toBe(60);
  expect((await results(a)).records).toContainEqual({
    exerciseId: 'Barbell_Bench_Press',
    setId: target.id,
    record: { metric: 'heaviestWeight', value: 60, previousBest: null },
  });
  const receipt = await removeLoggedSet(a, user, await saved(a), at(4));
  await first.sync();
  await second.sync();
  expect(await results(b)).toMatchObject({ completed: 0, volumeKg: 0, records: [] });
  await undoLoggedSet(b, user, receipt, at(5));
  await second.sync();
  await first.sync();
  expect(await saved(a)).toMatchObject({
    id: target.id,
    loggedAt: target.loggedAt,
    values: { weight: 60, reps: 8 },
  });
  expect((await results(a)).volumeKg).toBe(480);
  const offlineDraft = await saved(b);
  const oldUndo = await removeLoggedSet(a, user, await saved(a), at(6));
  await first.sync();
  // The other phone edits its local copy before receiving that deletion.
  await correctLoggedSet(b, user, offlineDraft, { weight: 70, reps: 8 }, at(7));
  await second.sync();
  await first.sync();
  await expect(undoLoggedSet(a, user, oldUndo, at(8))).rejects.toThrow(SetConflictError);
  expect((await saved(a)).values.weight).toBe(70);
  expect((await results(a)).volumeKg).toBe(560);
  for (const db of [a, b]) {
    expect(await db.first('SELECT COUNT(*) AS n FROM set_logs')).toEqual({ n: 1 });
    expect((await getSession(db, user, sessionId))!.endedAt).toBe(ended);
  }
});

it('rolls back a failed correction without changing the result or clean history projection', async () => {
  const { db, target } = await fixture();
  await finishSession(db, user, sessionId, 'completed', at(2));
  await refreshHistoryIndex(db, user);
  await db.exec(`CREATE TEMP TRIGGER reject_correction BEFORE UPDATE ON set_logs
    BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END;`);
  await expect(correctLoggedSet(db, user, target, { weight: 60 }, at(3))).rejects.toThrow(
    'storage unavailable',
  );
  expect((await listSets(db, user, sessionId))[0]!.values.weight).toBe(80);
  expect(await db.first('SELECT weight FROM workout_history_index')).toEqual({ weight: 80 });
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
});
