import { expect, it, vi } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { at, other, session, sessionId, set, user } from '../../workouts/__tests__/fixtures';
import { logStableSet } from '../../workouts/stableLogging';
import { correctLoggedSet, removeLoggedSet, undoLoggedSet } from '../../workouts/setCorrections';
import { performedVolume } from '../../workouts/logic';
import { setLogId } from '../../workouts/identity';
import { sessionItemsView } from '../../workouts/sessionItemsView';
import { sessionSlotId } from '../../workouts/structureIdentity';
import { readStructuredWorkout } from '../../workouts/structureReads';
import type { SessionItem } from '../../workouts/structureTypes';
import {
  fromWire,
  setLogsCollection,
  syncedCollections,
  workoutSessionsCollection,
  type Collection,
  type WireRecord,
} from '../collections';
import { createSyncEngine } from '../engine';
import { sessionItemsCollection } from '../workoutCollections';
import { fakeSyncServer } from './fakeSyncServer';

async function seed(db: Database, collection: Collection, record: WireRecord) {
  const { columns, values } = fromWire(collection, record);
  await db.run(
    `INSERT INTO ${collection.name} (user_id, dirty, ${columns.join(', ')})
     VALUES (?, 1, ${values.map(() => '?').join(', ')})`,
    [user, ...values],
  );
}

async function canonicalRows(db: Database) {
  const rows = [];
  for (const table of ['workout_sessions', 'session_items', 'set_logs', 'sync_state'])
    rows.push(await db.all(`SELECT * FROM ${table} ORDER BY rowid`));
  return rows;
}

it('retains mixed dirty records and the cursor before feature negotiation, then syncs them to a second phone', async () => {
  const db = await testDatabase();
  const server = fakeSyncServer();
  // This persisted cursor represents earlier activity in the shared server sequence.
  await server.clientFor(other).post('/sync/push', {
    protocol: 2,
    changes: {
      weight_entries: Array.from({ length: 25 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        date: `2026-10-${String(index + 1).padStart(2, '0')}`,
        weightKg: 80,
        note: null,
        updatedAt: at(0).toISOString(),
        deletedAt: null,
      })),
    },
  });
  const api = server.clientFor(user);
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString(), deletedAt: null };
  const original = sessionItemsView(parent, []).items[0]!;
  const added: SessionItem = {
    ...original,
    id: '00000000-0000-4000-8000-000000000004',
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 1,
  };
  const removed = {
    ...added,
    id: '00000000-0000-4000-8000-000000000005',
    position: 2,
    state: 'removed',
    deletedAt: at(2).toISOString(),
    updatedAt: at(2).toISOString(),
  };
  const legacy = {
    ...set(),
    id: setLogId(sessionId, 0, 0),
    updatedAt: at(2).toISOString(),
    deletedAt: null,
    values: { weight: 0, reps: 8 },
  };
  const stable = {
    ...legacy,
    id: sessionSlotId(added, 0),
    exercisePosition: null,
    itemId: added.id,
    side: 'bilateral',
    targetsAtPerformance: {
      sets: 3,
      targetReps: 8,
      targetTimeSeconds: null,
      targetDistanceMetres: null,
      restSeconds: 0,
    },
  };
  await seed(db, workoutSessionsCollection, parent);
  for (const item of [added, removed]) await seed(db, sessionItemsCollection, item);
  for (const log of [legacy, stable]) {
    await seed(db, setLogsCollection, log);
    await seed(db, setLogsCollection, {
      ...log,
      id: 'itemId' in log ? sessionSlotId(added, 1) : setLogId(sessionId, 0, 1),
      setIndex: 1,
      deletedAt: at(2).toISOString(),
    });
  }
  await db.run('INSERT INTO sync_state VALUES (?, 25, ?)', [user, at(0).toISOString()]);
  const before = await canonicalRows(db);
  const originalGet = api.get;
  const get = vi.fn();
  api.get = async <T>(path: string): Promise<T> => {
    get(path);
    if (path === '/sync/capabilities')
      return { protocols: [1, 2], minimumProtocol: 1, features: [] } as T;
    return originalGet<T>(path);
  };
  const post = vi.spyOn(api, 'post');
  const beforePush = vi.fn(async () => []);
  const engine = createSyncEngine({ db, api, collections: syncedCollections, beforePush });
  await engine.setUser(user);
  await engine.sync();
  expect(engine.getStatus()).toMatchObject({ pending: 7, syncing: false });
  expect(engine.getStatus().problem).toContain('Update');
  expect(get).toHaveBeenCalledExactlyOnceWith('/sync/capabilities');
  expect(post).not.toHaveBeenCalled();
  expect(beforePush).not.toHaveBeenCalled();
  expect(await canonicalRows(db)).toEqual(before);

  api.get = originalGet;
  await engine.sync();
  expect(engine.getStatus()).toMatchObject({ pending: 0, problem: null });
  expect([...server.rows.values()].filter((row) => row.userId === user)).toHaveLength(7);
  expect(await db.first('SELECT cursor FROM sync_state WHERE user_id = ?', [user])).toEqual({
    cursor: 32,
  });
  const second = await testDatabase();
  const otherEngine = createSyncEngine({
    db: second,
    api: server.clientFor(user),
    collections: syncedCollections,
  });
  await otherEngine.setUser(user);
  await otherEngine.sync();
  expect(otherEngine.getStatus()).toMatchObject({ pending: 0, problem: null });
  const received = (await readStructuredWorkout(second, user, sessionId))!;
  expect(received.resultView.available).toBe(true);
  expect(received.resultView.results).toHaveLength(2);
  expect(received.resultRecords).toHaveLength(4);
  expect(received.resultRecords.find((log) => log.id === stable.id)).toEqual(stable);
  expect(received.resultRecords.find((log) => log.id === legacy.id)).toEqual(legacy);
  expect(received.itemRecords.find((item) => item.id === removed.id)).toEqual(removed);
});

it('merges two offline additions, concurrent display order and result delete/undo without changing slot identity', async () => {
  const server = fakeSyncServer();
  const a = await testDatabase();
  const b = await testDatabase();
  const engines = [a, b].map((db) =>
    createSyncEngine({ db, api: server.clientFor(user), collections: syncedCollections }),
  );
  for (const engine of engines) await engine.setUser(user);
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString(), deletedAt: null };
  await seed(a, workoutSessionsCollection, parent);
  await engines[0]!.sync();
  await engines[1]!.sync();
  server.state.online = false;
  const original = sessionItemsView(parent, []).items[0]!;
  const ids = ['00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005'];
  const results: string[] = [];
  for (const [index, db] of [a, b].entries()) {
    const item: SessionItem = {
      ...original,
      id: ids[index]!,
      origin: 'added',
      originalPosition: null,
      replacesItemId: null,
      position: 1,
    };
    await seed(db, sessionItemsCollection, item);
    results.push(
      await logStableSet(
        db,
        user,
        {
          item,
          setIndex: 0,
          values: { weight: (index + 1) * 10, reps: 8 },
          difficulty: 'standard',
          easierToday: false,
        },
        at(index + 1),
      ),
    );
    await engines[index]!.noteLocalChange();
    expect(engines[index]!.getStatus()).toMatchObject({ pending: 2, offline: true });
  }
  expect(results[0]).not.toBe(results[1]);
  server.state.online = true;
  await engines[0]!.sync();
  await engines[1]!.sync();
  await engines[0]!.sync();
  const before = (await readStructuredWorkout(a, user, sessionId))!;
  expect(before.resultView.results.map((row) => row.log.id)).toEqual(results);
  expect(before.session.snapshot).toEqual(parent.snapshot);
  expect(performedVolume(before.resultView.results.map((row) => row.log))).toBe(240);
  const target = { ...before.resultView.results[1]!.log, deletedAt: null };
  server.state.online = false;
  for (const [index, db] of [a, b].entries())
    await db.run('UPDATE session_items SET position = ?, updated_at = ?, dirty = 1 WHERE id = ?', [
      index === 0 ? 9 : 0,
      at(10 + index).toISOString(),
      ids[0]!,
    ]);
  await correctLoggedSet(a, user, target, { weight: 70, reps: 8 }, at(11));
  const receipt = await removeLoggedSet(b, user, target, at(12));
  server.state.online = true;
  await engines[0]!.sync();
  await engines[1]!.sync();
  await engines[0]!.sync();
  const deleted = (await readStructuredWorkout(a, user, sessionId))!;
  expect(deleted.itemView.items.find((item) => item.id === ids[0])!.position).toBe(0);
  expect(deleted.resultView.results.map((row) => row.log.id)).toEqual([results[0]]);
  expect(performedVolume(deleted.resultView.results.map((row) => row.log))).toBe(80);
  await undoLoggedSet(b, user, receipt, at(15));
  await engines[1]!.sync();
  await engines[0]!.sync();
  for (const db of [a, b]) {
    const restored = (await readStructuredWorkout(db, user, sessionId))!;
    expect(restored.resultView.results.map((row) => row.log.id)).toEqual(results);
    expect(restored.resultView.results[1]!.log.loggedAt).toBe(at(2).toISOString());
    expect(performedVolume(restored.resultView.results.map((row) => row.log))).toBe(240);
    expect(restored.session.snapshot).toEqual(parent.snapshot);
  }
});
