import { expect, it } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { logStableSet } from '../stableLogging';
import type { StablePerformanceInput } from '../stablePerformance';
import { readStructuredWorkout } from '../structureReads';
import { removeLoggedSet, undoLoggedSet } from '../setCorrections';
import type { SetRecord } from '../setChanges';
import { SetConflictError } from '../setChanges';
import type { SessionItem } from '../structureTypes';
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
      original.planId,
      original.dayId,
      original.localDate,
      original.startedAt,
      JSON.stringify(original.snapshot),
      original.startedAt,
    ],
  );
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  const input: StablePerformanceInput = {
    item: detail.itemView.items[0]!,
    setIndex: 0,
    values: { weight: 0, reps: 8 },
    difficulty: 'standard',
    easierToday: false,
  };
  return { db, input };
}

it('stores one stable planned result without materializing the original routine or allowing a second save', async () => {
  const { db, input } = await fixture();
  const id = await logStableSet(db, user, input, at(1));
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  expect(detail.resultView.results[0]!.log).toMatchObject({
    id,
    itemId: input.item.id,
    exercisePosition: 0,
    values: { weight: 0, reps: 8 },
    loggedAt: at(1).toISOString(),
    targetsAtPerformance: { targetReps: 8 },
  });
  expect(await db.all('SELECT * FROM session_items')).toEqual([]);
  expect(await db.first('SELECT dirty FROM set_logs')).toEqual({ dirty: 1 });
  const before = await db.first('SELECT * FROM set_logs');
  await expect(logStableSet(db, user, input, at(2))).rejects.toThrow('already has a result');
  await expect(logStableSet(db, other, input, at(2))).rejects.toThrow('available');
  expect(await db.first('SELECT * FROM set_logs')).toEqual(before);
});

it('does not replace pending legacy work and converts only an explicitly deleted slot to a fresh stable performance', async () => {
  const { db, input } = await fixture();
  await saveSet(db, user, set(), at(1));
  await expect(logStableSet(db, user, input, at(2))).rejects.toThrow('already has a result');
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  const target: SetRecord = { ...detail.resultRecords[0]!, deletedAt: null };
  const receipt = await removeLoggedSet(db, user, target, at(5));
  const id = await logStableSet(db, user, input, at(3));
  expect(id).toBe(target.id);
  const fresh = (await readStructuredWorkout(db, user, sessionId))!.resultView.results[0]!.log;
  expect(fresh.loggedAt).toBe(at(3).toISOString());
  expect(Date.parse(fresh.updatedAt)).toBe(at(5).getTime() + 1);
  expect('itemId' in fresh).toBe(true);
  await expect(undoLoggedSet(db, user, receipt, at(6))).rejects.toThrow(SetConflictError);
  expect(await db.first('SELECT COUNT(*) AS n FROM set_logs')).toEqual({ n: 1 });
});

it('rolls back both the result and its history invalidation when a write fails, then retries safely', async () => {
  const { db, input } = await fixture();
  await db.run('DELETE FROM workout_history_dirty');
  const failing: Database = {
    ...db,
    transaction: (action) =>
      db.transaction((tx) =>
        action({
          ...tx,
          run: async (sql, params) => {
            const result = await tx.run(sql, params);
            if (sql.startsWith('INSERT INTO set_logs')) throw new Error('disk unavailable');
            return result;
          },
        }),
      ),
  };
  await expect(logStableSet(failing, user, input, at(1))).rejects.toThrow('disk unavailable');
  expect(await db.all('SELECT * FROM set_logs')).toEqual([]);
  expect(await db.all('SELECT * FROM workout_history_dirty')).toEqual([]);
  await logStableSet(db, user, input, at(1));
  expect(await db.first('SELECT COUNT(*) AS n FROM workout_history_dirty')).toEqual({ n: 1 });
});

it('rejects stale target settings and foreign slot collisions without overwriting canonical data', async () => {
  const { db, input } = await fixture();
  await db.run('UPDATE workout_sessions SET easier_today = 1');
  await expect(logStableSet(db, user, input, at(1))).rejects.toThrow('changed');
  expect(await db.all('SELECT * FROM set_logs')).toEqual([]);
  await db.run('UPDATE workout_sessions SET easier_today = 0');
  await saveSet(db, user, set(), at(1));
  await db.run('UPDATE set_logs SET user_id = ?', [other]);
  const before = await db.first('SELECT * FROM set_logs');
  await expect(logStableSet(db, user, input, at(2))).rejects.toThrow('available');
  expect(await db.first('SELECT * FROM set_logs')).toEqual(before);
});

it('logs independent added occurrences with null original positions and rechecks their stored target revisions', async () => {
  const { db, input } = await fixture();
  const items: SessionItem[] = [other, user].map((id) => ({
    ...input.item,
    id,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 1,
    exercise: { ...input.item.exercise, exerciseId: 'Added_row' },
  }));
  for (const item of items)
    await db.run(
      `INSERT INTO session_items VALUES (?, ?, ?, 'added', NULL, NULL, 1, 'active', NULL, ?, ?, NULL, 1)`,
      [item.id, user, sessionId, JSON.stringify(item.exercise), item.updatedAt],
    );
  await db.run('UPDATE session_items SET exercise = ? WHERE id = ?', [
    JSON.stringify({ ...items[0]!.exercise, targetReps: 10 }),
    other,
  ]);
  await expect(logStableSet(db, user, { ...input, item: items[0]! }, at(1))).rejects.toThrow(
    'changed',
  );
  expect(await db.all('SELECT * FROM set_logs')).toEqual([]);
  const fresh = (await readStructuredWorkout(db, user, sessionId))!.itemView.items.find(
    (item) => item.id === other,
  )!;
  const first = await logStableSet(db, user, { ...input, item: fresh }, at(1));
  const second = await logStableSet(db, user, { ...input, item: items[1]! }, at(2));
  expect(first).not.toBe(second);
  const detail = (await readStructuredWorkout(db, user, sessionId))!;
  expect(detail.resultView.results.map((row) => row.log.exercisePosition)).toEqual([null, null]);
  expect(detail.resultView.results.map((row) => row.targetsAtPerformance!.targetReps)).toEqual([
    10, 8,
  ]);
  expect(detail.session.snapshot.exercises).toHaveLength(1);
});
