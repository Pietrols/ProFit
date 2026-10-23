import { describe, expect, it } from 'vitest';
import type { SqlValue } from '../../../lib/db/database';
import { setLogId } from '../identity';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { readWorkoutHistory } from '../workoutHistory';
import { readWorkoutPage } from '../workoutReads';
import { at, other, session, snapshot, user } from './fixtures';

const id = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`;
async function fixture() {
  const db = await testDatabase();
  for (let n = 0; n < 32; n += 1) {
    const original = snapshot();
    original.planName = n === 0 ? '100% routine' : 'My routine';
    original.restDay = n === 1;
    if (original.restDay) original.exercises = [];
    await db.run(
      `INSERT INTO workout_sessions
      (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?)`,
      [
        id(n),
        n === 31 ? other : user,
        n === 2 ? other : user,
        other,
        session().localDate,
        at(n).toISOString(),
        n === 30 ? null : at(n + 1).toISOString(),
        n === 30 ? 'active' : n === 3 ? 'abandoned' : 'completed',
        JSON.stringify(original),
        at(n).toISOString(),
      ],
    );
  }
  return db;
}

describe('filtered offline workout history', () => {
  it('paginates saved sessions without duplicates when a newer session arrives', async () => {
    const db = await fixture();
    const first = await readWorkoutHistory(db, user, {});
    expect(first.entries).toHaveLength(25);
    expect(first.entries.every((entry) => entry.session.status !== 'active')).toBe(true);
    await db.run(
      "UPDATE workout_sessions SET started_at = ?, ended_at = ?, status = 'completed' WHERE id = ?",
      [at(100).toISOString(), at(101).toISOString(), id(30)],
    );
    const second = await readWorkoutHistory(db, user, {}, first.next);
    expect(second.entries).toHaveLength(5);
    expect(
      new Set([...first.entries, ...second.entries].map((entry) => entry.session.id)).size,
    ).toBe(30);
    expect(second.next).toBeNull();
    expect(
      (await readWorkoutHistory(db, other, {})).entries.map((entry) => entry.session.id),
    ).toEqual([id(31)]);
  });

  it('filters original names, exact plans, abandoned sessions and rest days', async () => {
    const db = await fixture();
    expect(
      (await readWorkoutPage(db, user, null, { planName: '100%' })).sessions.map((row) => row.id),
    ).toEqual([id(0)]);
    expect(
      (await readWorkoutPage(db, user, null, { planId: other })).sessions.map((row) => row.id),
    ).toEqual([id(2)]);
    expect(
      (await readWorkoutPage(db, user, null, { status: 'abandoned' })).sessions.map(
        (row) => row.id,
      ),
    ).toEqual([id(3)]);
    expect(
      (await readWorkoutPage(db, user, null, { status: 'rest' })).sessions.map((row) => row.id),
    ).toEqual([id(1)]);
    expect(
      (await readWorkoutPage(db, user, null, { exerciseName: 'bench' })).sessions,
    ).toHaveLength(25);
    expect((await readWorkoutPage(db, user, null, { exerciseId: 'Missing' })).sessions).toEqual([]);
    await db.run('UPDATE workout_sessions SET deleted_at = ? WHERE id = ?', [
      at(40).toISOString(),
      id(0),
    ]);
    expect((await readWorkoutHistory(db, user, { planName: '100%' })).entries).toEqual([]);
  });

  it('finds added/replacement exercises through owned session items, including retained removals', async () => {
    const db = await fixture();
    await db.run(
      `INSERT INTO session_items
      (id, user_id, session_id, origin, original_position, replaces_item_id, position, state, reason, exercise, updated_at)
      VALUES (?, ?, ?, 'added', NULL, NULL, 1, 'removed', 'Changed', ?, ?)`,
      [
        id(50),
        user,
        id(0),
        JSON.stringify({ ...snapshot().exercises[0], exerciseId: 'Added_row', name: 'Added rows' }),
        at(1).toISOString(),
      ],
    );
    expect(
      (await readWorkoutHistory(db, user, { exerciseId: 'Added_row' })).entries.map(
        (row) => row.session.id,
      ),
    ).toEqual([id(0)]);
    expect(
      (await readWorkoutHistory(db, user, { exerciseName: 'Added rows' })).entries,
    ).toHaveLength(1);
    expect((await readWorkoutHistory(db, other, { exerciseName: 'Added rows' })).entries).toEqual(
      [],
    );
  });

  it('counts saved results for one page in one aggregate query without loading their values', async () => {
    const db = await fixture();
    for (let n = 0; n < 4; n += 1) {
      await db.run(
        `INSERT INTO set_logs
        (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at, deleted_at)
        VALUES (?, ?, ?, 0, ?, ?, '[]', ?, ?, ?)`,
        [
          n === 3 ? id(73) : setLogId(id(29), 0, n),
          n === 3 ? other : user,
          id(29),
          n,
          at(29).toISOString(),
          JSON.stringify({ reps: 8, done: n !== 1 }),
          at(29).toISOString(),
          n === 2 ? at(30).toISOString() : null,
        ],
      );
    }
    const transaction = db.transaction;
    const queries: string[] = [];
    db.transaction = (action) =>
      transaction((tx) =>
        action({
          ...tx,
          all: <T>(sql: string, params?: SqlValue[]) => {
            queries.push(sql);
            return tx.all<T>(sql, params);
          },
        }),
      );
    const page = await readWorkoutHistory(db, user, {});
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain('COUNT(*)');
    expect(queries[1]).not.toContain('values_json');
    expect(page.entries.find((entry) => entry.session.id === id(29))?.savedResults).toBe(2);
  });

  it('rejects malformed cursors and filters rather than interpolating them into SQL', async () => {
    const db = await fixture();
    await expect(readWorkoutPage(db, user, null, { planId: 'bad' })).rejects.toThrow('valid plan');
    await expect(readWorkoutHistory(db, user, { exerciseName: 'x'.repeat(201) })).rejects.toThrow(
      '200',
    );
    expect((await readWorkoutHistory(db, user, { planName: "' OR 1=1 --" })).entries).toEqual([]);
  });
});
