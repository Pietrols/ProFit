import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { saveDay, savePlan } from '../../plans/plans';
import { refreshHistoryIndex } from '../historyIndex';
import { correctLoggedSet, removeLoggedSet, undoLoggedSet } from '../setCorrections';
import { SetConflictError, type SetRecord } from '../setChanges';
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
