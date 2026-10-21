import { describe, expect, it } from 'vitest';
import { createDatabase, migrate, type Driver, type SqlValue } from '../../../lib/db/database';
import { migrations } from '../../../lib/db/migrations';
import { nodeDriver } from '../../../lib/db/__tests__/nodeDriver';
import { timeSqlV1 } from '../../../lib/db/timeSql';
import { readWorkoutOverview, readWorkoutPage } from '../workoutReads';
import { setLogId } from '../identity';
import { readWorkout } from '../workouts';
import { readWorkoutDetail } from '../workoutDetail';
import { prefillFromSets, sessionResultsFromSets } from '../logic';
import { at, other, snapshot, user } from './fixtures';

const id = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`;
async function fixture(count: number, sets = 0, legacy = false) {
  const driver = nodeDriver();
  const reads: { sql: string; params: SqlValue[]; rows: number }[] = [];
  const traced: Driver = {
    ...driver,
    async all<T>(sql: string, params: SqlValue[]) {
      const rows = await driver.all<T>(sql, params);
      reads.push({ sql, params, rows: rows.length });
      return rows;
    },
  };
  const db = createDatabase(traced);
  await migrate(db, legacy ? migrations.filter((m) => m.version <= 4) : migrations);
  const original = snapshot();
  original.exercises[0]!.sets = 20;
  const insert = driver.raw.prepare(`INSERT INTO workout_sessions
    (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at, dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, 1)`);
  const log = driver.raw.prepare(`INSERT INTO set_logs
    (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`);
  driver.raw.exec('BEGIN');
  for (let n = 0; n < count; n += 1) {
    const start = at(n).toISOString();
    const active = n === count - 1;
    insert.run(
      id(n),
      user,
      user,
      other,
      start.slice(0, 10),
      start,
      active ? null : at(n + 1).toISOString(),
      active ? 'active' : 'completed',
      JSON.stringify(original),
      start,
    );
    for (let slot = 0; slot < sets; slot += 1) {
      log.run(
        setLogId(id(n), 0, slot),
        user,
        id(n),
        slot,
        start,
        JSON.stringify(original.exercises[0]!.logFields),
        '{"reps":8,"weight":45}',
        start,
      );
    }
  }
  driver.raw.exec('COMMIT');
  reads.length = 0;
  return { db, driver, reads };
}

describe('bounded workout reads', () => {
  it('keeps warm detail and exact comparison reads constant as history reaches 40,000 sets', async () => {
    for (const count of [50, 500, 2000]) {
      const { db, reads, driver } = await fixture(count, 20);
      await readWorkoutDetail(db, user, id(count - 1));
      reads.length = 0;
      const current = (await readWorkoutDetail(db, user, id(count - 1)))!;
      expect(reads).toHaveLength(5);
      expect(reads.reduce((n, q) => n + q.rows, 0)).toBeLessThanOrEqual(102);
      const exercise = current.session.snapshot.exercises[0]!;
      expect(prefillFromSets(exercise, exercise, current.previousSets)).toEqual({
        reps: 8,
        weight: 45,
      });
      const summary = sessionResultsFromSets(current.session, current.logs, current.previousSets);
      expect(summary.volumeKg).toBe(7200);
      expect(summary.records).toEqual([]);
      for (const query of reads.filter((q) => q.sql.startsWith('WITH previous'))) {
        const plan = await db.all<{ detail: string }>(
          `EXPLAIN QUERY PLAN ${query.sql}`,
          query.params,
        );
        const details = plan.map((row) => row.detail).join('\n');
        expect(details).not.toContain('MATERIALIZE previous');
        expect(details).toContain('SEARCH workout_history_index USING INDEX');
      }
      driver.raw.close();
    }
  });
  it('reads only the requested owned session and its sets, without a second parent query', async () => {
    for (const count of [50, 2000]) {
      const { db, reads } = await fixture(count, 20);
      const workout = await readWorkout(db, user, id(count - 1));
      expect(workout?.logs).toHaveLength(20);
      expect(reads).toHaveLength(2);
      expect(reads.map((q) => q.rows)).toEqual([1, 20]);
      expect(await readWorkout(db, other, id(count - 1))).toBeNull();
      await db.run('UPDATE workout_sessions SET deleted_at = ? WHERE id = ?', [
        at(3000).toISOString(),
        id(count - 1),
      ]);
      expect(await readWorkout(db, user, id(count - 1))).toBeNull();
    }
  });
  it('keeps query count and returned rows bounded with 40,000 saved sets', async () => {
    for (const count of [0, 50, 500, 2000]) {
      const { db, reads } = await fixture(count, 20);
      const overview = await readWorkoutOverview(db, user, user);
      const page = await readWorkoutPage(db, user);
      expect(reads).toHaveLength(3);
      expect(reads.every((q) => !q.sql.includes('set_logs'))).toBe(true);
      expect(reads.reduce((n, q) => n + q.rows, 0)).toBeLessThanOrEqual(53);
      expect(page.sessions).toHaveLength(Math.min(count, 25));
      expect(overview.active.map((s) => s.id)).toEqual(count ? [id(count - 1)] : []);
      expect(overview.latestCompletion?.id ?? null).toBe(count ? id(count - 2) : null);
      for (const query of [...reads]) {
        const plan = await db.all<{ detail: string }>(
          `EXPLAIN QUERY PLAN ${query.sql}`,
          query.params,
        );
        const details = plan.map((row) => row.detail).join('\n');
        expect(details).toContain('USING INDEX workout_sessions_');
        expect(details).not.toContain('TEMP B-TREE');
      }
    }
  });

  it('pages through equal instants and time-zone offsets without duplicates or omissions', async () => {
    const { db } = await fixture(60);
    for (let n = 0; n < 26; n += 1) {
      await db.run('UPDATE workout_sessions SET started_at = ?, ended_at = ? WHERE id = ?', [
        n % 2 ? '2026-10-09T12:00:00.000Z' : '2026-10-09T13:00:00.0009+01:00',
        '2026-10-09T12:01:00.000Z',
        id(n),
      ]);
    }
    let page = await readWorkoutPage(db, user);
    const seen = page.sessions.map((s) => s.id);
    while (page.next) {
      page = await readWorkoutPage(db, user, page.next);
      seen.push(...page.sessions.map((s) => s.id));
    }
    expect(seen).toEqual([
      ...Array.from({ length: 26 }, (_, n) => id(n)),
      ...Array.from({ length: 34 }, (_, n) => id(59 - n)),
    ]);
  });

  it('scopes completion by plan and owner, hides tombstones and exposes active overflow', async () => {
    const { db } = await fixture(60);
    await db.run('UPDATE workout_sessions SET user_id = ? WHERE id = ?', [other, id(58)]);
    await db.run('UPDATE workout_sessions SET deleted_at = ? WHERE id = ?', [
      at(80).toISOString(),
      id(57),
    ]);
    await db.run('UPDATE workout_sessions SET plan_id = ? WHERE id = ?', [other, id(56)]);
    expect((await readWorkoutOverview(db, user, user)).latestCompletion?.id).toBe(id(55));
    expect((await readWorkoutPage(db, other)).sessions.map((s) => s.id)).toEqual([id(58)]);
    await db.run(
      "UPDATE workout_sessions SET status = 'active', ended_at = NULL WHERE user_id = ?",
      [user],
    );
    const overview = await readWorkoutOverview(db, user, null);
    expect(overview.active).toHaveLength(25);
    expect(overview.hasMoreActive).toBe(true);
    expect(overview.latestCompletion).toBeNull();
  });

  it('adds indexes to populated legacy data without changing unsynced rows', async () => {
    const { db } = await fixture(50, 20, true);
    const before = await db.all('SELECT * FROM workout_sessions ORDER BY id');
    await migrate(db, migrations);
    expect(await db.all('SELECT * FROM workout_sessions ORDER BY id')).toEqual(before);
    expect((await readWorkoutPage(db, user)).sessions).toHaveLength(25);
    expect(await db.first('SELECT COUNT(*) AS n FROM set_logs')).toEqual({ n: 1000 });
  });

  it('rejects malformed continuation before reading storage', async () => {
    const { db, reads } = await fixture(0);
    await expect(readWorkoutPage(db, user, { startedAt: 'bad', id: id(0) })).rejects.toThrow(
      'invalid',
    );
    expect(reads).toHaveLength(0);
  });

  it('uses the same millisecond instants as the pure workout calculations', async () => {
    const { db } = await fixture(0);
    for (const time of [
      '2026-10-09T12:00:00Z',
      '2026-10-09T12:00:00.1Z',
      '2026-10-09T12:00:00.12Z',
      '2026-10-09T12:00:00.9999Z',
      '2026-10-09T12:00:00.0009+02:00',
      '2026-10-09T12:00:00.123-05:30',
      '2026-10-09T12:00:00+23:59',
      '1969-12-31T23:59:59.999Z',
    ]) {
      expect(
        await db.first(`SELECT ${timeSqlV1('started_at')} AS ms FROM (SELECT ? AS started_at)`, [
          time,
        ]),
      ).toEqual({ ms: Date.parse(time) });
    }
  });
});
