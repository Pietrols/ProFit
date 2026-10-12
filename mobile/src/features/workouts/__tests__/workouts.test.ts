import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase, migrate, type Database } from '../../../lib/db/database';
import { migrations } from '../../../lib/db/migrations';
import { nodeDriver, testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { deletePlan, saveDay, savePlan } from '../../plans/plans';
import { syncedCollections } from '../../sync/collections';
import { createSyncEngine } from '../../sync/engine';
import { fakeSyncServer } from '../../sync/__tests__/fakeSyncServer';
import { deleteSession, deleteSet, finishSession, getSession, listSessions, listSets, saveSet, setLogId, startSession, updateSession } from '../workouts';
import { at, other, sessionId, set, snapshot, user } from './fixtures';

async function fixture(existing?: Database) {
  const db = existing ?? await testDatabase();
  const planId = await savePlan(db, user, { name: 'My cycle', shape: 'cycle', difficulty: 'standard', active: true }, at(0));
  const dayId = await saveDay(db, user, { planId, position: 0, weekday: null, name: 'Push', restDay: false }, at(0));
  const input = { planId, dayId, localDate: '2026-10-09', snapshot: snapshot() };
  await startSession(db, user, input, at(0), sessionId);
  return { db, planId, dayId, input };
}

describe('workouts on SQLite', () => {
  it('stores a session snapshot, notes and only selected set values', async () => {
    const { db, input } = await fixture();
    input.snapshot.exercises[0]!.sets = 10;
    const id = await saveSet(db, user, { ...set(), values: { reps: 8, weight: 45 } }, at(1));
    expect(id).toBe(setLogId(sessionId, 0, 0));
    expect(await listSets(db, user, sessionId)).toMatchObject([{ id, values: { reps: 8, weight: 45 } }]);
    expect(await db.first('SELECT values_json, dirty FROM set_logs')).toEqual({ values_json: '{"reps":8,"weight":45}', dirty: 1 });
    await updateSession(db, user, sessionId, { notes: 'Felt good', easierToday: true }, at(2));
    expect(await getSession(db, user, sessionId)).toMatchObject({ notes: 'Felt good', easierToday: true, snapshot: { exercises: [{ sets: 3 }] } });
  });
  it('retrying start and logging twice keep one record per slot', async () => {
    const { db, input } = await fixture();
    await startSession(db, user, input, at(1), sessionId);
    expect((await getSession(db, user, sessionId))!.startedAt).toBe(at(0).toISOString());
    await Promise.all([saveSet(db, user, set(), at(1)), saveSet(db, user, { ...set(), values: { reps: 9 } }, at(2))]);
    expect(await listSets(db, user, sessionId)).toMatchObject([{ values: { reps: 9 } }]);
    expect(await db.first('SELECT COUNT(*) AS n FROM set_logs')).toEqual({ n: 1 });
    await expect(startSession(db, user, input, at(2))).rejects.toThrow('active session');
  });
  it('finishes atomically and repeated finish does not move its end', async () => {
    const { db } = await fixture(); await saveSet(db, user, set(), at(1));
    await expect(finishSession(db, user, sessionId, 'completed', at(-1))).rejects.toThrow('end time');
    expect((await getSession(db, user, sessionId))!.status).toBe('active');
    await finishSession(db, user, sessionId, 'completed', at(10));
    await finishSession(db, user, sessionId, 'completed', at(20));
    expect(await getSession(db, user, sessionId)).toMatchObject({ status: 'completed', endedAt: at(10).toISOString() });
    await expect(finishSession(db, user, sessionId, 'abandoned', at(21))).rejects.toThrow('already ended');
    expect(await db.first('SELECT dirty FROM workout_sessions')).toEqual({ dirty: 1 });
  });
  it('rejects finish before a logged set and invalid writes without changing data', async () => {
    const { db } = await fixture(); await saveSet(db, user, { ...set(), loggedAt: at(5).toISOString() }, at(5));
    await expect(finishSession(db, user, sessionId, 'completed', at(2))).rejects.toThrow('logged sets');
    for (const patch of [
      { values: { time: 10 } }, { exercisePosition: 1 }, { setIndex: 3 },
      { logFields: ['reps'] as const as unknown as ReturnType<typeof set>['logFields'], values: { reps: 8 } },
      { loggedAt: at(-1).toISOString() },
    ]) await expect(saveSet(db, user, { ...set(), ...patch }, at(6))).rejects.toThrow();
    await expect(updateSession(db, user, sessionId, { notes: 'x'.repeat(2001), easierToday: false }, at(6))).rejects.toThrow();
    expect((await listSets(db, user, sessionId))[0]!.loggedAt).toBe(at(5).toISOString());
    expect((await getSession(db, user, sessionId))!.notes).toBe('');
  });
  it('abandon preserves the saved log and blocks further logging', async () => {
    const { db } = await fixture(); await saveSet(db, user, set(), at(1));
    await finishSession(db, user, sessionId, 'abandoned', at(2));
    expect(await listSets(db, user, sessionId)).toHaveLength(1);
    await expect(saveSet(db, user, { ...set(), setIndex: 1 }, at(3))).rejects.toThrow('abandoned');
  });
  it('ownership protects reads, writes, ids, parent links and deletes', async () => {
    const { db, input } = await fixture(); const id = await saveSet(db, user, set(), at(1));
    expect(await getSession(db, other, sessionId)).toBeNull(); expect(await listSessions(db, other)).toEqual([]);
    expect(await listSets(db, other, sessionId)).toEqual([]);
    await expect(startSession(db, other, input, at(2), sessionId)).rejects.toThrow('available');
    await expect(startSession(db, other, input, at(2))).rejects.toThrow('day');
    await expect(saveSet(db, other, set(), at(2))).rejects.toThrow('available');
    await expect(updateSession(db, other, sessionId, { notes: 'stolen', easierToday: false }, at(2))).rejects.toThrow('available');
    await deleteSession(db, other, sessionId, at(3)); await deleteSet(db, other, id, at(3));
    expect(await listSessions(db, user)).toHaveLength(1); expect(await listSets(db, user, sessionId)).toHaveLength(1);
  });
  it('plan deletion keeps history, and session deletion tombstones its logs', async () => {
    const { db, planId, input } = await fixture(); const id = await saveSet(db, user, set(), at(1));
    await deletePlan(db, user, planId, at(2));
    expect(await getSession(db, user, sessionId)).toMatchObject({ snapshot: snapshot() });
    expect(await listSets(db, user, sessionId)).toHaveLength(1);
    await deleteSession(db, user, sessionId, at(3));
    expect(await listSessions(db, user)).toEqual([]); expect(await listSets(db, user, sessionId)).toEqual([]);
    expect(await db.first('SELECT deleted_at, dirty FROM set_logs WHERE id = ?', [id])).toEqual({ deleted_at: at(3).toISOString(), dirty: 1 });
    await expect(startSession(db, user, input, at(4), sessionId)).rejects.toThrow('available');
    await expect(saveSet(db, user, set(), at(4))).rejects.toThrow('available');
  });
  it('a deleted set can be explicitly logged again in the same slot', async () => {
    const { db } = await fixture(); const id = await saveSet(db, user, set(), at(1));
    await deleteSet(db, user, id, at(2)); expect(await listSets(db, user, sessionId)).toEqual([]);
    expect(await saveSet(db, user, { ...set(), values: { reps: 6 } }, at(3))).toBe(id);
    expect(await listSets(db, user, sessionId)).toMatchObject([{ values: { reps: 6 } }]);
  });
  it('hides late children of deleted sessions and invalid snapshot slots', async () => {
    const { db } = await fixture(); const id = await saveSet(db, user, set(), at(1));
    await db.run('UPDATE set_logs SET set_index = 99 WHERE id = ?', [id]);
    expect(await listSets(db, user, sessionId)).toEqual([]);
    await db.run('UPDATE set_logs SET set_index = 0, log_fields = ? WHERE id = ?', ['["reps"]', id]);
    expect(await listSets(db, user, sessionId)).toEqual([]);
    await deleteSession(db, user, sessionId, at(2));
    await db.run('UPDATE set_logs SET deleted_at = NULL WHERE id = ?', [id]);
    expect(await listSets(db, user, sessionId)).toEqual([]);
  });
  it('migrates Phase 4 in place without losing unsynced plans', async () => {
    const db = createDatabase(nodeDriver()); await migrate(db, migrations.filter((m) => m.version <= 3));
    const planId = await savePlan(db, user, { name: 'Keep me', shape: 'cycle', difficulty: 'standard', active: true }, at(0));
    expect(await migrate(db, migrations)).toBe(4);
    expect(await db.first('SELECT name, dirty FROM plans WHERE id = ?', [planId])).toEqual({ name: 'Keep me', dirty: 1 });
    expect(await listSessions(db, user)).toEqual([]);
  });
  it('reopens a real SQLite file with offline session and logs intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'profit-workout-'));
    const path = join(dir, 'phone.sqlite'); let driver = nodeDriver(path);
    try {
      const db = createDatabase(driver); await migrate(db, migrations); await fixture(db);
      await saveSet(db, user, set(), at(1)); await finishSession(db, user, sessionId, 'completed', at(2));
      driver.raw.close(); driver = nodeDriver(path);
      const reopened = createDatabase(driver); await migrate(reopened, migrations);
      expect(await getSession(reopened, user, sessionId)).toMatchObject({ status: 'completed' });
      expect(await listSets(reopened, user, sessionId)).toMatchObject([{ values: set().values }]);
      expect(await reopened.first('SELECT dirty FROM set_logs')).toEqual({ dirty: 1 });
    } finally { driver.raw.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('syncs an offline completed workout once to a second phone, then edits and deletes', async () => {
    const { db: a } = await fixture(); const b = await testDatabase(); const server = fakeSyncServer();
    server.state.online = false;
    const ea = createSyncEngine({ db: a, api: server.clientFor(user), collections: syncedCollections });
    const eb = createSyncEngine({ db: b, api: server.clientFor(user), collections: syncedCollections });
    await ea.setUser(user); await eb.setUser(user);
    await saveSet(a, user, set(), at(1)); await finishSession(a, user, sessionId, 'completed', at(2));
    await ea.sync(); expect(await listSets(a, user, sessionId)).toHaveLength(1);
    expect(await listSessions(b, user)).toEqual([]);
    server.state.online = true; await ea.sync(); await ea.sync(); await eb.sync();
    expect(await getSession(b, user, sessionId)).toMatchObject({ status: 'completed', snapshot: snapshot() });
    expect(await listSets(b, user, sessionId)).toHaveLength(1);
    await updateSession(b, user, sessionId, { notes: 'Edited on B', easierToday: false }, at(3));
    await eb.sync(); await ea.sync(); expect((await getSession(a, user, sessionId))!.notes).toBe('Edited on B');
    await deleteSession(a, user, sessionId, at(4)); await ea.sync(); await eb.sync();
    expect(await listSessions(b, user)).toEqual([]); expect(await listSets(b, user, sessionId)).toEqual([]);
  });
  it('accepts a child before its session without displaying an orphan', async () => {
    const { db: a } = await fixture(); await saveSet(a, user, set(), at(1));
    const b = await testDatabase(); const server = fakeSyncServer();
    const ea = createSyncEngine({ db: a, api: server.clientFor(user), collections: syncedCollections });
    await ea.setUser(user); await ea.sync();
    const stored = server.rows.get(sessionId)!; server.rows.delete(sessionId);
    const eb = createSyncEngine({ db: b, api: server.clientFor(user), collections: syncedCollections });
    await eb.setUser(user); await eb.sync(); expect(await listSets(b, user, sessionId)).toEqual([]);
    const max = Math.max(...[...server.rows.values()].map((r) => r.version));
    server.rows.set(sessionId, { ...stored, version: max + 1 });
    await eb.sync(); expect(await listSets(b, user, sessionId)).toHaveLength(1);
  });
});
