import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../../lib/api/client';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { saveWeight } from '../../weight/weightLog';
import { syncedCollections } from '../collections';
import { createSyncEngine } from '../engine';
import { fakeSyncServer } from './fakeSyncServer';

const firstUser = '00000000-0000-4000-8000-000000000001';
const secondUser = '00000000-0000-4000-8000-000000000002';
const now = () => new Date('2026-10-22T10:00:00Z');

async function harness() {
  const db = await testDatabase();
  const server = fakeSyncServer();
  let account = firstUser;
  const api: ApiClient = {
    ...server.clientFor(firstUser),
    get: (path) => server.clientFor(account).get(path),
    post: (path, body, options) => server.clientFor(account).post(path, body, options),
  };
  const engine = createSyncEngine({ db, api, collections: syncedCollections, now });
  await engine.setUser(firstUser);
  const change = async (user: string) => {
    account = user;
    await engine.setUser(user);
  };
  return { db, server, api, engine, change };
}

describe('sync account changes across asynchronous work', () => {
  it.each(['media', 'row read', 'same account returns'])(
    'does not upload a previous run after %s',
    async (boundary) => {
      const h = await harness();
      const { db, api, server } = h;
      const change = async () => {
        await h.change(secondUser);
        if (boundary === 'same account returns') await h.change(firstUser);
      };
      let engine = h.engine;
      if (boundary === 'row read') {
        const all = db.all;
        let changed = false;
        db.all = async <T>(sql: string, params = []): Promise<T[]> => {
          const rows = await all<T>(sql, params);
          if (!changed && sql.startsWith('SELECT * FROM weight_entries')) {
            changed = true;
            await change();
          }
          return rows;
        };
      } else {
        engine = createSyncEngine({
          db,
          api,
          collections: syncedCollections,
          now,
          beforePush: async () => {
            await h.change(secondUser);
            await engine.setUser(secondUser);
            if (boundary === 'same account returns') {
              await h.change(firstUser);
              await engine.setUser(firstUser);
            }
            return [];
          },
        });
        await engine.setUser(firstUser);
      }
      await saveWeight(db, firstUser, { date: '2026-10-22', weightKg: 80 }, now());
      await engine.sync();
      expect(server.rows.size).toBe(0);
      expect(await db.first('SELECT dirty FROM weight_entries')).toEqual({ dirty: 1 });
      expect(await db.first('SELECT * FROM sync_state WHERE user_id = ?', [firstUser])).toBeNull();
    },
  );

  it('does not apply an old pull or advance its cursor after switching accounts', async () => {
    const { db, server, api, engine, change } = await harness();
    const source = await testDatabase();
    const record = await saveWeight(source, firstUser, { date: '2026-10-22', weightKg: 80 }, now());
    await server.clientFor(firstUser).post('/sync/push', {
      changes: { weight_entries: [record] },
    });
    const get = api.get;
    api.get = async <T>(path: string): Promise<T> => {
      const result = await get<T>(path);
      if (path.startsWith('/sync/pull')) await change(secondUser);
      return result;
    };
    await engine.sync();
    expect(await db.all('SELECT * FROM weight_entries')).toEqual([]);
    expect(await db.first('SELECT * FROM sync_state WHERE user_id = ?', [firstUser])).toBeNull();
  });

  it('checks ownership again when a queued acknowledgement transaction begins', async () => {
    const { db, server, engine, change } = await harness();
    await saveWeight(db, firstUser, { date: '2026-10-22', weightKg: 80 }, now());
    const transaction = db.transaction;
    let changed = false;
    db.transaction = async (action) => {
      if (!changed) {
        changed = true;
        await change(secondUser);
      }
      return transaction(action);
    };
    await engine.sync();
    expect([...server.rows.values()].map((row) => row.userId)).toEqual([firstUser]);
    expect(await db.first('SELECT dirty FROM weight_entries')).toEqual({ dirty: 1 });
    expect(await db.first('SELECT * FROM sync_state WHERE user_id = ?', [firstUser])).toBeNull();
  });
});
