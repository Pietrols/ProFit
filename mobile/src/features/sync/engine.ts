import type { ApiClient } from '../../lib/api/client';
import { ApiError, isNetworkError, messageFor } from '../../lib/api/errors';
import type { Database, Sql } from '../../lib/db/database';
import { fromWire, toWire, type Collection, type WireRecord } from './collections';
import { negotiateSync, SYNC_PROTOCOL } from './protocol';

// Moves dirty rows to the server and the server's newer rows to the phone. The protocol is in
// docs/phases/PHASE_2.md. No React Native imports: tests drive it with Node's SQLite.

export const BATCH = 500;
// Stops a run that keeps finding work (for example a server that never accepts anything) from
// looping forever. 40 batches of 500 is far more than a phone ever holds.
const MAX_ROUNDS = 40;

export type SyncStatus = {
  syncing: boolean;
  pending: number; // edits on this phone not yet on the server
  offline: boolean; // the last attempt had no connection
  lastSyncedAt: string | null;
  problem: string | null; // something the user should know, other than being offline
};

type PushResponse = {
  applied: string[];
  ignored: string[];
  rejected: { collection: string; id: string | null; reason: string }[];
};
type PullResponse = { changes: Record<string, WireRecord[]>; cursor: number; hasMore: boolean };

type Options = {
  db: Database;
  api: ApiClient;
  collections: Collection[];
  // Runs before records are pushed (photo uploads, so the server has a photo before the records
  // that point at it). Returns problems to report; throws to end the run like a failed push.
  beforePush?: (userId: string) => Promise<string[]>;
  owner?: () => string | null;
  now?: () => Date;
};

export function createSyncEngine({
  db,
  api,
  collections,
  beforePush,
  owner,
  now = () => new Date(),
}: Options) {
  let status: SyncStatus = {
    syncing: false,
    pending: 0,
    offline: false,
    lastSyncedAt: null,
    problem: null,
  };
  let currentUser: string | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  function setStatus(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch };
    listeners.forEach((listener) => listener());
  }

  async function countPending(userId: string): Promise<number> {
    let total = 0;
    for (const c of collections) {
      const row = await db.first<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${c.name} WHERE user_id = ? AND dirty = 1`,
        [userId],
      );
      total += row?.n ?? 0;
    }
    return total;
  }

  async function pushAll(userId: string, check: () => void): Promise<string[]> {
    const problems: string[] = [];
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      check();
      const changes: Record<string, WireRecord[]> = {};
      let sent = 0;
      for (const c of collections) {
        const rows = await db.all<Record<string, unknown>>(
          `SELECT * FROM ${c.name} WHERE user_id = ? AND dirty = 1 LIMIT ${BATCH}`,
          [userId],
        );
        check();
        if (rows.length) changes[c.name] = rows.map((row) => toWire(c, row));
        sent += rows.length;
      }
      if (!sent) return problems;

      const response = await api.post<PushResponse>('/sync/push', {
        protocol: SYNC_PROTOCOL,
        changes,
      });
      check();
      const rejected = new Set(response.rejected.map((r) => `${r.collection}/${r.id}`));
      for (const r of response.rejected) problems.push(r.reason);

      await db.transaction(async (tx) => {
        check();
        for (const [name, records] of Object.entries(changes)) {
          for (const record of records) {
            check();
            if (rejected.has(`${name}/${record.id}`)) {
              // The server will never accept this version; stop resending it (see D17).
              await tx.run(
                `UPDATE ${name} SET dirty = 0 WHERE id = ? AND user_id = ? AND updated_at = ?`,
                [record.id, userId, record.updatedAt],
              );
            } else {
              // Applied, or ignored because the server already has a newer copy (it arrives in the
              // pull). Either way this edit is done, unless the row was edited again meanwhile.
              await tx.run(
                `UPDATE ${name} SET dirty = 0 WHERE id = ? AND user_id = ? AND updated_at = ?`,
                [record.id, userId, record.updatedAt],
              );
            }
          }
        }
        check();
      });
    }
    return problems;
  }

  async function applyRemote(
    tx: Sql,
    collection: Collection,
    userId: string,
    record: WireRecord,
    check: () => void,
  ) {
    const local = await tx.first<{ updated_at: string; dirty: number }>(
      `SELECT updated_at, dirty FROM ${collection.name} WHERE id = ?`,
      [record.id],
    );
    check();
    // A local edit newer than the server's copy wins; it goes up on the next push.
    if (local && local.dirty === 1 && local.updated_at > record.updatedAt) return;
    const { columns, values } = fromWire(collection, record);
    const assignments = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
    await tx.run(
      `INSERT INTO ${collection.name} (${columns.join(', ')}, user_id, dirty) VALUES (${columns.map(() => '?').join(', ')}, ?, 0)
       ON CONFLICT(id) DO UPDATE SET ${assignments.join(', ')}, dirty = 0 WHERE ${collection.name}.user_id = excluded.user_id`,
      [...values, userId],
    );
  }

  async function pullAll(userId: string, check: () => void) {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      check();
      const state = await db.first<{ cursor: number }>(
        'SELECT cursor FROM sync_state WHERE user_id = ?',
        [userId],
      );
      check();
      const since = state?.cursor ?? 0;
      const page = await api.get<PullResponse>(
        `/sync/pull?protocol=${SYNC_PROTOCOL}&since=${since}&limit=${BATCH}`,
      );
      check();
      await db.transaction(async (tx) => {
        check();
        for (const c of collections) {
          for (const record of page.changes[c.name] ?? []) {
            check();
            await applyRemote(tx, c, userId, record, check);
          }
        }
        // Saved with the rows, so a crash halfway through never skips or repeats a page.
        await tx.run(
          `INSERT INTO sync_state (user_id, cursor, last_synced_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET cursor = excluded.cursor, last_synced_at = excluded.last_synced_at`,
          [userId, page.cursor, now().toISOString()],
        );
        check();
      });
      if (!page.hasMore) return;
    }
  }

  // One run at a time. A request that arrives during a run (say, an edit made while syncing) gets
  // one more run afterwards, so its change is not left waiting for the next trigger.
  let running: Promise<void> | null = null;
  let again = false;
  function run(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await runOnce();
      } while (again && currentUser);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  async function runOnce() {
    const userId = currentUser;
    if (!userId) return;
    const epoch = generation;
    const owned = () =>
      epoch === generation && currentUser === userId && (!owner || owner() === userId);
    if (!owned()) return;
    try {
      const sessionCheck = api.captureSession(userId);
      const check = () => {
        if (!owned()) throw new ApiError(401, 'SESSION_CHANGED', 'Your sign-in changed.');
        sessionCheck();
      };
      check();
      setStatus({ syncing: true });
      await negotiateSync(api);
      check();
      const problems = beforePush ? await beforePush(userId) : [];
      check();
      problems.push(...(await pushAll(userId, check)));
      await pullAll(userId, check);
      check();
      const state = await db.first<{ last_synced_at: string | null }>(
        'SELECT last_synced_at FROM sync_state WHERE user_id = ?',
        [userId],
      );
      check();
      setStatus({
        offline: false,
        lastSyncedAt: state?.last_synced_at ?? null,
        problem: problems.length
          ? `Some entries were not saved to the server: ${problems[0]}`
          : null,
      });
    } catch (error) {
      if (!owned() || (error instanceof ApiError && error.code === 'SESSION_CHANGED')) return;
      if (isNetworkError(error)) setStatus({ offline: true });
      else setStatus({ problem: messageFor(error) });
    } finally {
      if (owned()) {
        const pending = await countPending(userId);
        if (owned()) setStatus({ syncing: false, pending });
      }
    }
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Which signed-in user's rows to sync; null when signed out.
    async setUser(userId: string | null) {
      const epoch = ++generation;
      currentUser = userId;
      setStatus({ syncing: false, pending: 0, offline: false, lastSyncedAt: null, problem: null });
      if (!userId) return;
      const state = await db.first<{ last_synced_at: string | null }>(
        'SELECT last_synced_at FROM sync_state WHERE user_id = ?',
        [userId],
      );
      if (epoch !== generation || currentUser !== userId) return;
      const pending = await countPending(userId);
      if (epoch !== generation || currentUser !== userId) return;
      setStatus({
        syncing: false,
        offline: false,
        pending,
        lastSyncedAt: state?.last_synced_at ?? null,
        problem: null,
      });
    },

    // Runs a sync now, or joins the one already running. Never throws: the status says how it went.
    sync: async () => {
      await run();
    },

    // Call after a local write so the pending count is right straight away, then sync.
    async noteLocalChange() {
      const userId = currentUser;
      const epoch = generation;
      if (userId) {
        const pending = await countPending(userId);
        if (epoch !== generation || currentUser !== userId) return;
        setStatus({ pending });
      }
      await run();
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
