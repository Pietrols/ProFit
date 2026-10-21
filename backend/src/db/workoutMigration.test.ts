import { readFile } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { openTestDatabase } from '../test/db.js';

const database = openTestDatabase();
afterAll(() => database.close());

it('preserves populated legacy results and tombstones when allowing null original positions', async () => {
  const migration = await readFile(
    new URL('../../drizzle/0006_workout_nullable_positions.sql', import.meta.url),
    'utf8',
  );
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    // Exercise the real migration against an isolated copy with the preceding constraint.
    await client.query('CREATE TEMP TABLE set_logs (LIKE public.set_logs INCLUDING ALL)');
    await client.query('ALTER TABLE set_logs ALTER COLUMN exercise_position SET NOT NULL');
    await client.query(`INSERT INTO set_logs
      (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields,
       values, updated_at, deleted_at, version)
      SELECT id::uuid, '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002', 0, slot,
        '2026-10-09T09:01:00Z', ARRAY['weight', 'reps'], '{"weight":0,"reps":8}',
        '2026-10-09T09:02:00Z', deleted::timestamptz, slot + 1
      FROM (VALUES
        ('00000000-0000-4000-8000-000000000003', 0, NULL),
        ('00000000-0000-4000-8000-000000000004', 1, '2026-10-09T09:02:00Z')
      ) AS fixture(id, slot, deleted)`);
    const before = (await client.query('SELECT * FROM set_logs ORDER BY id')).rows;
    await client.query(migration);
    expect((await client.query('SELECT * FROM set_logs ORDER BY id')).rows).toEqual(before);
    expect(before.every((row) => row.item_id === null && row.targets_at_performance === null)).toBe(
      true,
    );
    await client.query('UPDATE set_logs SET exercise_position = NULL WHERE set_index = 0');
    expect(
      (await client.query('SELECT exercise_position FROM set_logs WHERE set_index = 0')).rows,
    ).toEqual([{ exercise_position: null }]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
