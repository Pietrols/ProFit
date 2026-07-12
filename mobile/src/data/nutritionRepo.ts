// Offline-first nutrition data layer — same replay-safe queue contract as
// workouts and bodyweight: INSERT OR REPLACE on client UUIDs, synced flag
// flipped only after the server acks.
import { DbLike } from './types';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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
  await db.runAsync(
    `INSERT OR REPLACE INTO meal_logs
     (id, name, portion, meal_type, logged_at, synced)
     VALUES (?,?,?,?,?,${keepSynced('meal_logs')})`,
    [meal.id, meal.name, meal.portion, meal.mealType, meal.loggedAt, meal.id],
  );
}

export async function listMealsLocal(
  db: DbLike,
  sinceIso?: string,
): Promise<MealLog[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    portion: string;
    meal_type: string;
    logged_at: string;
  }>(
    sinceIso
      ? 'SELECT * FROM meal_logs WHERE logged_at >= ? ORDER BY logged_at ASC'
      : 'SELECT * FROM meal_logs ORDER BY logged_at ASC',
    sinceIso ? [sinceIso] : [],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    portion: r.portion,
    mealType: r.meal_type as MealType,
    loggedAt: r.logged_at,
  }));
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
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    portion: string;
    meal_type: string;
    logged_at: string;
  }>('SELECT * FROM meal_logs WHERE synced = 0 ORDER BY logged_at ASC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    portion: r.portion,
    mealType: r.meal_type as MealType,
    loggedAt: r.logged_at,
  }));
}
