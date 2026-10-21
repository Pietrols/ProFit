import { expect, it } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { readStructuredWorkout } from '../structureReads';
import type { SessionItem } from '../structureTypes';
import { deleteSession, listSets, saveSet } from '../workouts';
import { at, other, session, sessionId, set, user } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const planned = () => sessionItemsView(parent(), []).items[0]!;
async function fixture() {
  const db = await testDatabase();
  const value = parent();
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [
      value.id,
      user,
      value.planId,
      value.dayId,
      value.localDate,
      value.startedAt,
      JSON.stringify(value.snapshot),
      value.updatedAt,
    ],
  );
  return db;
}
async function insertItem(db: Database, item: SessionItem, owner = user) {
  await db.run(`INSERT INTO session_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
    item.id,
    owner,
    item.sessionId,
    item.origin,
    item.originalPosition,
    item.replacesItemId,
    item.position,
    item.state,
    item.reason,
    JSON.stringify(item.exercise),
    item.updatedAt,
    item.deletedAt,
  ]);
}

it('reads legacy shapes without rewriting dirty rows and hides foreign or deleted parents', async () => {
  const db = await fixture();
  await saveSet(db, user, set(), at(1));
  const before = await db.all('SELECT * FROM set_logs');
  const view = await readStructuredWorkout(db, user, sessionId);
  expect(view!.resultView.available).toBe(true);
  expect(view!.resultView.results.map((result) => result.log)).toEqual(
    (await listSets(db, user, sessionId)).map((log) => ({ ...log, deletedAt: null })),
  );
  expect(await db.all('SELECT * FROM set_logs')).toEqual(before);
  expect(await readStructuredWorkout(db, other, sessionId)).toBeNull();
  await deleteSession(db, user, sessionId, at(3));
  await db.run('UPDATE set_logs SET deleted_at = NULL');
  expect(await readStructuredWorkout(db, user, sessionId)).toBeNull();
});

it('waits for an owned added parent, then reads its result with null position and captured targets', async () => {
  const db = await fixture();
  const item: SessionItem = {
    ...planned(),
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const id = sessionSlotId(item, 0);
  await db.run(
    `INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields,
    values_json, updated_at, dirty, item_id, side, targets_at_performance) VALUES (?, ?, ?, NULL, 0, ?, ?, ?, ?, 1, ?, 'bilateral', ?)`,
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
  expect(
    (await readStructuredWorkout(db, user, sessionId))!.resultView.unavailableResultIds,
  ).toEqual([id]);
  await insertItem(db, item, other);
  expect((await readStructuredWorkout(db, user, sessionId))!.resultView.results).toEqual([]);
  await db.run('UPDATE session_items SET user_id = ?, state = ?, deleted_at = ? WHERE id = ?', [
    user,
    'removed',
    at(2).toISOString(),
    item.id,
  ]);
  const view = await readStructuredWorkout(db, user, sessionId);
  expect(view!.resultView.available).toBe(true);
  expect(view!.resultView.results[0]!.log).toMatchObject({
    id,
    exercisePosition: null,
    itemId: item.id,
  });
  expect(await db.first('SELECT dirty FROM set_logs')).toEqual({ dirty: 1 });
});

it('retains canonical tombstones and reports malformed JSON, partial metadata and corrupt overrides', async () => {
  const db = await fixture();
  const id = await saveSet(db, user, set(), at(1));
  await insertItem(db, planned());
  await db.run('UPDATE session_items SET exercise = ?', ['{']);
  let view = await readStructuredWorkout(db, user, sessionId);
  expect(view!.itemView.unavailableItemIds).toEqual([planned().id]);
  expect(view!.resultView.results).toEqual([]);
  await db.run('DELETE FROM session_items');
  for (const value of ['{', 'null']) {
    await db.run('UPDATE set_logs SET values_json = ?', [value]);
    view = await readStructuredWorkout(db, user, sessionId);
    expect(view!.resultView.unavailableResultIds).toEqual([id]);
  }
  await db.run('UPDATE set_logs SET values_json = ?, side = ?', [
    JSON.stringify(set().values),
    'bilateral',
  ]);
  expect((await readStructuredWorkout(db, user, sessionId))!.resultView.available).toBe(false);
  await db.run('UPDATE set_logs SET side = NULL, deleted_at = ?', [at(2).toISOString()]);
  view = await readStructuredWorkout(db, user, sessionId);
  expect(view!.resultRecords[0]!.deletedAt).toBe(at(2).toISOString());
  expect(view!.resultView.results).toEqual([]);
  expect(view!.resultView.available).toBe(true);
});
