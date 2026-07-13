// Offline-first nutrition data layer — same replay-safe queue contract as
// workouts and bodyweight: INSERT OR REPLACE on client UUIDs, synced flag
// flipped only after the server acks.
import { DbLike } from './types';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MacroField = 'protein' | 'carbs' | 'fat' | 'calories';
export const MACRO_FIELDS: MacroField[] = ['protein', 'carbs', 'fat', 'calories'];

export interface MealProfileItem {
  id: string;
  name: string;
  typicalPortion: string;
  deletedAt: string | null;
}

export interface MealLog {
  id: string;
  name: string;
  portion: string;
  mealType: MealType;
  loggedAt: string;
  // Macros: null = unknown. estimatedFields flags AI-estimated values.
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  calories: number | null;
  estimatedFields: MacroField[];
}

interface MealRow {
  id: string;
  name: string;
  portion: string;
  meal_type: string;
  logged_at: string;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  calories: number | null;
  estimated_fields: string | null;
}

function rowToMeal(r: MealRow): MealLog {
  return {
    id: r.id,
    name: r.name,
    portion: r.portion,
    mealType: r.meal_type as MealType,
    loggedAt: r.logged_at,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    calories: r.calories,
    estimatedFields: r.estimated_fields ? JSON.parse(r.estimated_fields) : [],
  };
}

const keepSynced = (table: string) =>
  `COALESCE((SELECT synced FROM ${table} WHERE id = ?), 0)`;

export async function saveProfileItemLocal(
  db: DbLike,
  item: MealProfileItem,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO meal_profile_items
     (id, name, typical_portion, deleted_at, synced)
     VALUES (?,?,?,?,0)`,
    [item.id, item.name, item.typicalPortion, item.deletedAt],
  );
}

export async function listProfileLocal(db: DbLike): Promise<MealProfileItem[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    typical_portion: string;
    deleted_at: string | null;
  }>(
    'SELECT * FROM meal_profile_items WHERE deleted_at IS NULL ORDER BY name ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    typicalPortion: r.typical_portion,
    deletedAt: r.deleted_at,
  }));
}

export async function saveMealLocal(db: DbLike, meal: MealLog): Promise<void> {
  // Re-saving (e.g. after macro estimation fills fields) resets synced to 0
  // so the enriched row re-syncs — the same idempotent-upsert contract.
  await db.runAsync(
    `INSERT OR REPLACE INTO meal_logs
     (id, name, portion, meal_type, logged_at, protein, carbs, fat, calories, estimated_fields, synced)
     VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
    [
      meal.id,
      meal.name,
      meal.portion,
      meal.mealType,
      meal.loggedAt,
      meal.protein,
      meal.carbs,
      meal.fat,
      meal.calories,
      JSON.stringify(meal.estimatedFields),
    ],
  );
}

export async function listMealsLocal(
  db: DbLike,
  sinceIso?: string,
): Promise<MealLog[]> {
  const rows = await db.getAllAsync<MealRow>(
    sinceIso
      ? 'SELECT * FROM meal_logs WHERE logged_at >= ? ORDER BY logged_at ASC'
      : 'SELECT * FROM meal_logs ORDER BY logged_at ASC',
    sinceIso ? [sinceIso] : [],
  );
  return rows.map(rowToMeal);
}

type Poster<T> = (rows: T[]) => Promise<{ synced: string[] }>;

async function pushTable<T extends { id: string }>(
  db: DbLike,
  table: string,
  rowsOf: () => Promise<T[]>,
  post: Poster<T>,
): Promise<{ pushed: number }> {
  const pending = await rowsOf();
  if (pending.length === 0) return { pushed: 0 };
  const { synced } = await post(pending);
  for (const id of synced) {
    await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [id]);
  }
  return { pushed: synced.length };
}

export async function pushMealProfile(db: DbLike, post: Poster<MealProfileItem>) {
  return pushTable(db, 'meal_profile_items', async () => {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      typical_portion: string;
      deleted_at: string | null;
    }>('SELECT * FROM meal_profile_items WHERE synced = 0');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      typicalPortion: r.typical_portion,
      deletedAt: r.deleted_at,
    }));
  }, post);
}

export async function pushMeals(db: DbLike, post: Poster<MealLog>) {
  return pushTable(db, 'meal_logs', () => listUnsyncedMeals(db), post);
}

async function listUnsyncedMeals(db: DbLike): Promise<MealLog[]> {
  const rows = await db.getAllAsync<MealRow>(
    'SELECT * FROM meal_logs WHERE synced = 0 ORDER BY logged_at ASC',
  );
  return rows.map(rowToMeal);
}
