import { describe, expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { readExercisePerformances } from '../exercisePerformances';
import { setLogId } from '../identity';
import { at, other, session, set, user } from './fixtures';

const id = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`;
const exerciseId = 'Barbell_Bench_Press';
async function fixture() {
  const db = await testDatabase();
  for (let n = 0; n < 32; n += 1) {
    const current = session();
    await db.run(
      `INSERT INTO workout_sessions
      (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?)`,
      [
        id(n),
        n === 31 ? other : user,
        current.planId,
        current.dayId,
        current.localDate,
        at(n * 10).toISOString(),
        n === 30 ? null : at(n * 10 + 5).toISOString(),
        n === 30 ? 'active' : 'completed',
        JSON.stringify(current.snapshot),
        at(n * 10).toISOString(),
      ],
    );
    for (let index = 0; index < 2; index += 1)
      await db.run(
        `INSERT INTO set_logs
      (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          setLogId(id(n), 0, index),
          n === 31 ? other : user,
          id(n),
          index,
          at(n * 10 + 1).toISOString(),
          JSON.stringify(set().logFields),
          JSON.stringify({ reps: 8, weight: n }),
          at(n * 10 + 1).toISOString(),
        ],
      );
  }
  return db;
}

describe('recent comparable exercise performances', () => {
  it('paginates by performance time and id, including ties, without active or foreign results', async () => {
    const db = await fixture();
    const first = await readExercisePerformances(db, user, exerciseId);
    const second = await readExercisePerformances(db, user, exerciseId, first.next);
    const third = await readExercisePerformances(db, user, exerciseId, second.next);
    expect([first.entries.length, second.entries.length, third.entries.length]).toEqual([
      25, 25, 10,
    ]);
    const entries = [...first.entries, ...second.entries, ...third.entries];
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(60);
    expect(entries[0]!.sessionId).toBe(id(29));
    expect(entries.at(-1)!.log.values.weight).toBe(0);
    expect(entries.every((entry) => entry.sessionId !== id(30) && entry.sessionId !== id(31))).toBe(
      true,
    );
    expect(third.next).toBeNull();
    expect((await readExercisePerformances(db, other, exerciseId)).entries).toHaveLength(2);
    expect((await readExercisePerformances(db, user, 'Missing')).entries).toEqual([]);
  });

  it('repairs corrections and deletions before returning a recent performance', async () => {
    const db = await fixture();
    await readExercisePerformances(db, user, exerciseId);
    const first = setLogId(id(29), 0, 0);
    const second = setLogId(id(29), 0, 1);
    await db.run('UPDATE set_logs SET values_json = ?, updated_at = ? WHERE id = ?', [
      '{"reps":10,"weight":0}',
      at(400).toISOString(),
      first,
    ]);
    await db.run('UPDATE set_logs SET deleted_at = ? WHERE id = ?', [
      at(400).toISOString(),
      second,
    ]);
    const page = await readExercisePerformances(db, user, exerciseId);
    expect(page.entries.find((entry) => entry.id === first)?.log.values).toEqual({
      reps: 10,
      weight: 0,
    });
    expect(page.entries.some((entry) => entry.id === second)).toBe(false);
    expect(page.entries.find((entry) => entry.id === first)?.loggedMs).toBe(at(291).getTime());
    await db.run('UPDATE workout_sessions SET deleted_at = ? WHERE id = ?', [
      at(400).toISOString(),
      id(29),
    ]);
    expect(
      (await readExercisePerformances(db, user, exerciseId)).entries.some(
        (entry) => entry.sessionId === id(29),
      ),
    ).toBe(false);
  });

  it('refuses malformed selectors and cursors', async () => {
    const db = await fixture();
    expect(() => readExercisePerformances(db, user, '')).toThrow('valid exercise');
    expect(() =>
      readExercisePerformances(db, user, exerciseId, { id: 'bad', loggedMs: 1 }),
    ).toThrow('invalid');
    expect(() =>
      readExercisePerformances(db, user, exerciseId, { id: setLogId(id(0), 0, 0), loggedMs: NaN }),
    ).toThrow('invalid');
  });
});
