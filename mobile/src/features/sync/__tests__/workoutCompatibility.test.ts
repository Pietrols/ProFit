import { expect, it, vi } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { at, session, sessionId, set, user } from '../../workouts/__tests__/fixtures';
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
  expect(server.rows.size).toBe(7);
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
