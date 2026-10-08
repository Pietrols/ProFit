import type { Sql } from '../../lib/db/database';
import { uuidv5 } from '../../lib/uuid';

// Reading and writing the body-weight log on the phone. Every write marks the row dirty so the
// sync engine sends it; the caller then asks the engine to sync.

// Fixed namespace for body-weight ids. Changing it would split every existing entry from its copy
// on other phones, so it never changes.
const WEIGHT_NAMESPACE = '6f1c2a60-9a52-4c8e-9a0b-3b6f4f2d7c11';

export type WeightEntry = { id: string; date: string; weightKg: number; note: string | null; updatedAt: string };

// One weigh-in per user per day: every phone derives the same id for the same day, so two phones
// that both log 7 October end up with one entry (the later edit wins) instead of two.
export function weightEntryId(userId: string, date: string): string {
  return uuidv5(`${userId}/${date}`, WEIGHT_NAMESPACE);
}

export async function saveWeight(db: Sql, userId: string, entry: { date: string; weightKg: number; note?: string | null }, now: Date): Promise<string> {
  const id = weightEntryId(userId, entry.date);
  const note = entry.note?.trim() ? entry.note.trim().slice(0, 200) : null;
  await db.run(
    `INSERT INTO weight_entries (id, user_id, date, weight_kg, note, updated_at, deleted_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 1)
     ON CONFLICT(id) DO UPDATE SET weight_kg = excluded.weight_kg, note = excluded.note,
       updated_at = excluded.updated_at, deleted_at = NULL, dirty = 1`,
    [id, userId, entry.date, entry.weightKg, note, now.toISOString()],
  );
  return id;
}

export async function deleteWeight(db: Sql, userId: string, date: string, now: Date): Promise<void> {
  const at = now.toISOString();
  await db.run('UPDATE weight_entries SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ?', [
    at,
    at,
    weightEntryId(userId, date),
    userId,
  ]);
}

type Row = { id: string; date: string; weight_kg: number; note: string | null; updated_at: string };
const toEntry = (r: Row): WeightEntry => ({ id: r.id, date: r.date, weightKg: r.weight_kg, note: r.note, updatedAt: r.updated_at });

// Newest day first, deleted entries left out.
export async function listWeights(db: Sql, userId: string, limit = 30): Promise<WeightEntry[]> {
  const rows = await db.all<Row>(
    'SELECT id, date, weight_kg, note, updated_at FROM weight_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map(toEntry);
}

export async function weightOn(db: Sql, userId: string, date: string): Promise<WeightEntry | null> {
  const row = await db.first<Row>('SELECT id, date, weight_kg, note, updated_at FROM weight_entries WHERE id = ? AND deleted_at IS NULL', [
    weightEntryId(userId, date),
  ]);
  return row ? toEntry(row) : null;
}
