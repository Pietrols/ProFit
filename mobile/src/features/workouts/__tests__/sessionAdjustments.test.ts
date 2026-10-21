import { expect, it } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { adjustSession } from '../sessionAdjustments';
import { readStructuredWorkout } from '../structureReads';
import { saveSet } from '../workouts';
import { at, other, session, sessionId, set, user } from './fixtures';

async function fixture() {
  const db = await testDatabase();
  const original = session();
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [
      sessionId,
      user,
      user,
      other,
      original.localDate,
      original.startedAt,
      JSON.stringify(original.snapshot),
      original.startedAt,
    ],
  );
  await saveSet(db, user, set(), at(1));
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  return { db, detail, item: detail.itemView.items[0]! };
}

it('materializes only the changed planned item and preserves the session and its performed results', async () => {
  const { db, detail, item } = await fixture();
  await db.run('DELETE FROM workout_history_dirty');
  const sessionBefore = await db.first('SELECT * FROM workout_sessions');
  const logsBefore = await db.all('SELECT * FROM set_logs');
  await adjustSession(
    db,
    user,
    sessionId,
    { kind: 'change', item, change: { kind: 'state', state: 'skipped', reason: 'Busy bench' } },
    at(2),
  );
  const saved = (await readStructuredWorkout(db, user, sessionId))!;
  expect(saved.itemRecords).toHaveLength(1);
  expect(saved.itemView.items[0]).toMatchObject({ id: item.id, state: 'skipped' });
  expect(saved.resultView.results).toEqual(detail.resultView.results);
  expect(await db.first('SELECT * FROM workout_sessions')).toEqual(sessionBefore);
  expect(await db.all('SELECT * FROM set_logs')).toEqual(logsBefore);
  expect(await db.first('SELECT dirty FROM session_items')).toEqual({ dirty: 1 });
  expect(await db.first('SELECT session_id FROM workout_history_dirty')).toEqual({
    session_id: sessionId,
  });
  await expect(
    adjustSession(
      db,
      user,
      sessionId,
      { kind: 'change', item, change: { kind: 'state', state: 'active', reason: null } },
      at(3),
    ),
  ).rejects.toThrow('changed');
  await expect(
    adjustSession(
      db,
      other,
      sessionId,
      { kind: 'change', item, change: { kind: 'state', state: 'active', reason: null } },
      at(3),
    ),
  ).rejects.toThrow('available');
});

it('rolls back item rows and history invalidation on failure, then safely retries', async () => {
  const { db, item } = await fixture();
  await db.run('DELETE FROM workout_history_dirty');
  const failing: Database = {
    ...db,
    transaction: (action) =>
      db.transaction((tx) =>
        action({
          ...tx,
          run: async (sql, params) => {
            const written = await tx.run(sql, params);
            if (sql.startsWith('INSERT INTO session_items')) throw new Error('Disk unavailable');
            return written;
          },
        }),
      ),
  };
  const command = {
    kind: 'change' as const,
    item,
    change: { kind: 'state' as const, state: 'removed' as const, reason: null },
  };
  await expect(adjustSession(failing, user, sessionId, command, at(2))).rejects.toThrow('Disk');
  expect(await db.all('SELECT * FROM session_items')).toEqual([]);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  await adjustSession(db, user, sessionId, command, at(2));
  expect((await readStructuredWorkout(db, user, sessionId))!.itemRecords).toHaveLength(1);
});
