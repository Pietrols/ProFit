import type { Sql } from '../../lib/db/database';
import { randomId } from '../../lib/randomId';
import type { Category, Equipment, Exercise, Muscle, Tracking } from './types';

// The user's own exercises on the phone. Writes mark the row dirty for the sync engine.

export type CustomExerciseInput = {
  name: string;
  category: Category;
  equipment: Equipment | null;
  primary: Muscle[];
  secondary: Muscle[];
  tracking: Tracking;
  instructions: string;
  photoId: string | null;
};

type Row = {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment | null;
  primary_muscles: string;
  secondary_muscles: string;
  tracking: Tracking;
  instructions: string | null;
  photo_id: string | null;
};

const parseList = (text: string): Muscle[] => {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? (value as Muscle[]) : [];
  } catch {
    return [];
  }
};

// The same shape as built-in exercises, so lists, search and detail screens treat them alike.
function toExercise(row: Row): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    equipment: row.equipment,
    level: null,
    force: null,
    mechanic: null,
    primary: parseList(row.primary_muscles),
    secondary: parseList(row.secondary_muscles),
    instructions: (row.instructions ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    tracking: row.tracking,
    common: false,
    popularity: null,
    origin: 'custom',
    photoId: row.photo_id,
  };
}

// Checks the form before saving, with the same limits as the API.
export function validateCustomExercise(input: CustomExerciseInput): Partial<Record<'name' | 'primary' | 'secondary' | 'instructions', string>> {
  const errors: Partial<Record<'name' | 'primary' | 'secondary' | 'instructions', string>> = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Give the exercise a name.';
  else if (name.length > 80) errors.name = 'Keep the name to 80 characters.';
  if (input.primary.length === 0) errors.primary = 'Pick the main muscle it works.';
  else if (input.primary.length > 4) errors.primary = 'Pick up to 4 main muscles.';
  if (input.secondary.length > 6) errors.secondary = 'Pick up to 6 other muscles.';
  if (input.instructions.trim().length > 2000) errors.instructions = 'Keep the steps to 2000 characters.';
  return errors;
}

// Creates the exercise, or updates it when an id is given. Returns its id.
export async function saveCustomExercise(db: Sql, userId: string, input: CustomExerciseInput, now: Date, id: string = randomId()): Promise<string> {
  const secondary = input.secondary.filter((m) => !input.primary.includes(m));
  await db.run(
    `INSERT INTO custom_exercises (id, user_id, name, category, equipment, primary_muscles, secondary_muscles, tracking, instructions, photo_id, updated_at, deleted_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, equipment = excluded.equipment,
       primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles, tracking = excluded.tracking,
       instructions = excluded.instructions, photo_id = excluded.photo_id, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 1
     WHERE custom_exercises.user_id = excluded.user_id`,
    [
      id,
      userId,
      input.name.trim().slice(0, 80),
      input.category,
      input.equipment,
      JSON.stringify(input.primary),
      JSON.stringify(secondary),
      input.tracking,
      input.instructions.trim() || null,
      input.photoId,
      now.toISOString(),
    ],
  );
  return id;
}

export async function deleteCustomExercise(db: Sql, userId: string, id: string, now: Date): Promise<void> {
  const at = now.toISOString();
  await db.run('UPDATE custom_exercises SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ?', [at, at, id, userId]);
}

const COLUMNS = 'id, name, category, equipment, primary_muscles, secondary_muscles, tracking, instructions, photo_id';

export async function listCustomExercises(db: Sql, userId: string): Promise<Exercise[]> {
  const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM custom_exercises WHERE user_id = ? AND deleted_at IS NULL ORDER BY name`, [userId]);
  return rows.map(toExercise);
}

export async function getCustomExercise(db: Sql, userId: string, id: string): Promise<Exercise | null> {
  const row = await db.first<Row>(`SELECT ${COLUMNS} FROM custom_exercises WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [id, userId]);
  return row ? toExercise(row) : null;
}
