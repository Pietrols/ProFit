import { describe, expect, it } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { deleteWeight, listWeights, saveWeight } from '../../weight/weightLog';
import { syncedCollections } from '../collections';
import { createSyncEngine } from '../engine';
import { fakeSyncServer } from './fakeSyncServer';

const PETER = '0b9f3c2e-1d2a-4c5b-8e9f-0a1b2c3d4e5f';
let clockMs = Date.parse('2026-10-07T08:00:00.000Z');
const tick = (minutes = 1) => new Date((clockMs += minutes * 60_000));

async function phone(server: ReturnType<typeof fakeSyncServer>, userId = PETER) {
  const db = await testDatabase();
  const engine = createSyncEngine({ db, api: server.clientFor(userId), collections: syncedCollections, now: () => new Date(clockMs) });
  await engine.setUser(userId);
  return { db, engine };
}

const weights = async (db: Database, userId = PETER) => (await listWeights(db, userId)).map((w) => [w.date, w.weightKg]);

describe('sync engine', () => {
  it('keeps an entry logged offline and sends it exactly once when the connection returns', async () => {
    const server = fakeSyncServer();
    const { db, engine } = await phone(server);

    server.state.online = false;
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81.4 }, tick());
    await engine.noteLocalChange();
    expect(engine.getStatus()).toMatchObject({ pending: 1, offline: true, syncing: false });
    expect(server.rows.size).toBe(0);

    server.state.online = true;
    await engine.sync();
    await engine.sync();
    expect(engine.getStatus()).toMatchObject({ pending: 0, offline: false, problem: null });
    expect(server.rows.size).toBe(1);
    expect([...server.rows.values()][0]!.record).toMatchObject({ date: '2026-10-07', weightKg: 81.4 });
  });

  it('merges two phones: different days add up, the same day keeps the later edit', async () => {
    const server = fakeSyncServer();
    const a = await phone(server);
    const b = await phone(server);

    server.state.online = false;
    await saveWeight(a.db, PETER, { date: '2026-10-05', weightKg: 82 }, tick());
    await saveWeight(b.db, PETER, { date: '2026-10-06', weightKg: 81.8 }, tick());
    await saveWeight(a.db, PETER, { date: '2026-10-07', weightKg: 81.5 }, tick());
    await saveWeight(b.db, PETER, { date: '2026-10-07', weightKg: 81.2 }, tick()); // later edit of the same day

    server.state.online = true;
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();

    const expected = [
      ['2026-10-07', 81.2],
      ['2026-10-06', 81.8],
      ['2026-10-05', 82],
    ];
    expect(await weights(a.db)).toEqual(expected);
    expect(await weights(b.db)).toEqual(expected);
    expect(server.rows.size).toBe(3);
  });

  it('syncs a delete to the other phone', async () => {
    const server = fakeSyncServer();
    const a = await phone(server);
    const b = await phone(server);
    await saveWeight(a.db, PETER, { date: '2026-10-07', weightKg: 81 }, tick());
    await a.engine.sync();
    await b.engine.sync();
    expect(await weights(b.db)).toHaveLength(1);

    await deleteWeight(a.db, PETER, '2026-10-07', tick());
    await a.engine.sync();
    await b.engine.sync();
    expect(await weights(b.db)).toEqual([]);
  });

  it('keeps a newer local edit over an older copy from the server', async () => {
    const server = fakeSyncServer();
    const a = await phone(server);
    const b = await phone(server);
    await saveWeight(a.db, PETER, { date: '2026-10-07', weightKg: 80 }, tick());
    await a.engine.sync();

    // b edits the same day later, offline, before ever pulling a's version.
    server.state.online = false;
    await saveWeight(b.db, PETER, { date: '2026-10-07', weightKg: 79.5 }, tick());
    server.state.online = true;
    await b.engine.sync();
    await a.engine.sync();
    expect(await weights(a.db)).toEqual([['2026-10-07', 79.5]]);
    expect(await weights(b.db)).toEqual([['2026-10-07', 79.5]]);
  });

  it('stops resending a record the server rejects and says why', async () => {
    const server = fakeSyncServer();
    const { db, engine } = await phone(server);
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 900 }, tick());
    await engine.sync();
    expect(engine.getStatus().pending).toBe(0);
    expect(engine.getStatus().problem).toMatch(/weightKg/);
    const pushesAfterFirst = server.state.pushes;
    await engine.sync();
    expect(server.state.pushes).toBe(pushesAfterFirst);
  });

  it('pages through more changes than fit in one pull', async () => {
    const server = fakeSyncServer();
    const a = await phone(server);
    const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    await a.db.transaction(async (tx) => {
      for (let i = 0; i < 1203; i += 1) await saveWeight(tx, PETER, { date: day(i), weightKg: 80 + (i % 10) / 10 }, tick(0));
    });
    await a.engine.sync();
    expect(a.engine.getStatus().pending).toBe(0);
    expect(server.rows.size).toBe(1203);

    const b = await phone(server);
    await b.engine.sync();
    expect(await listWeights(b.db, PETER, 5000)).toHaveLength(1203);
  });

  it("keeps each person's entries apart on a shared phone", async () => {
    const server = fakeSyncServer();
    const other = '1c0a4d3f-2e3b-4d6c-9f0a-1b2c3d4e5f60';
    const { db, engine } = await phone(server);
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81 }, tick());
    await engine.sync();

    // Peter signs out and someone else signs in on the same phone: same database, their own session.
    await engine.setUser(null);
    const theirs = createSyncEngine({ db, api: server.clientFor(other), collections: syncedCollections, now: () => new Date(clockMs) });
    await theirs.setUser(other);
    await saveWeight(db, other, { date: '2026-10-07', weightKg: 64 }, tick());
    await theirs.sync();
    expect(await weights(db, other)).toEqual([['2026-10-07', 64]]);
    expect(theirs.getStatus().pending).toBe(0);
    expect(await weights(db, PETER)).toEqual([['2026-10-07', 81]]);
  });

  it('runs again when a change arrives during a sync', async () => {
    const server = fakeSyncServer();
    const { db, engine } = await phone(server);
    const first = engine.sync();
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81 }, tick());
    const second = engine.noteLocalChange();
    await Promise.all([first, second]);
    expect(server.rows.size).toBe(1);
    expect(engine.getStatus().pending).toBe(0);
  });
});
