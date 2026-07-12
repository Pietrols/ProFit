import { DbLike, Exercise, HOME_EQUIPMENT, SqlParam } from './types';

interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: string;
  demo_url: string;
  instructions: string;
  home_alternative_id: string | null;
  updated_at: string;
}

function rowToExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Exercise['category'],
    primaryMuscles: JSON.parse(r.primary_muscles),
    secondaryMuscles: JSON.parse(r.secondary_muscles),
    equipment: JSON.parse(r.equipment),
    demoUrl: r.demo_url,
    instructions: JSON.parse(r.instructions),
    homeAlternativeId: r.home_alternative_id,
    updatedAt: r.updated_at,
  };
}

/** Idempotent: INSERT OR REPLACE keyed on the server's stable slug id. */
export async function upsertExercises(
  db: DbLike,
  exercises: Exercise[],
): Promise<void> {
  for (const e of exercises) {
    await db.runAsync(
      `INSERT OR REPLACE INTO exercises
       (id, name, category, primary_muscles, secondary_muscles, equipment,
        demo_url, instructions, home_alternative_id, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        e.id,
        e.name,
        e.category,
        JSON.stringify(e.primaryMuscles),
        JSON.stringify(e.secondaryMuscles),
        JSON.stringify(e.equipment),
        e.demoUrl,
        JSON.stringify(e.instructions),
        e.homeAlternativeId,
        e.updatedAt,
      ],
    );
  }
}

export interface ExerciseFilter {
  query?: string;
  category?: string;
  equipment?: string;
  homeOnly?: boolean;
}

export async function searchExercises(
  db: DbLike,
  filter: ExerciseFilter = {},
): Promise<Exercise[]> {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filter.query?.trim()) {
    where.push('name LIKE ?');
    params.push(`%${filter.query.trim()}%`);
  }
  if (filter.category) {
    where.push('category = ?');
    params.push(filter.category);
  }
  if (filter.equipment) {
    where.push('equipment LIKE ?');
    params.push(`%"${filter.equipment}"%`);
  }
  if (filter.homeOnly) {
    where.push(`(${HOME_EQUIPMENT.map(() => 'equipment LIKE ?').join(' OR ')})`);
    params.push(...HOME_EQUIPMENT.map((e) => `%"${e}"%`));
  }
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT * FROM exercises
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY name ASC`,
    params,
  );
  return rows.map(rowToExercise);
}

export async function getExercise(
  db: DbLike,
  id: string,
): Promise<Exercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE id = ?',
    [id],
  );
  return row ? rowToExercise(row) : null;
}

export async function countExercises(db: DbLike): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM exercises',
  );
  return row?.n ?? 0;
}

/**
 * Substitution engine (Phase 9): candidates that train the same primary
 * muscle and fit the context's equipment. The curated home alternative
 * ranks first, then same-category picks. Injury/equipment/preference swaps
 * all draw from this list.
 */
export async function findSubstitutes(
  db: DbLike,
  exercise: Exercise,
  context: 'home' | 'gym',
  limit = 6,
): Promise<Exercise[]> {
  const pool = await searchExercises(
    db,
    context === 'home' ? { homeOnly: true } : {},
  );
  return pool
    .filter(
      (e) =>
        e.id !== exercise.id &&
        e.primaryMuscles.some((m) => exercise.primaryMuscles.includes(m)),
    )
    .sort((a, b) => {
      const alt =
        Number(b.id === exercise.homeAlternativeId) -
        Number(a.id === exercise.homeAlternativeId);
      if (alt !== 0) return alt;
      const cat =
        Number(b.category === exercise.category) -
        Number(a.category === exercise.category);
      if (cat !== 0) return cat;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export async function getMeta(db: DbLike, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(
  db: DbLike,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)', [
    key,
    value,
  ]);
}
