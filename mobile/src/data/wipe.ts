// Local data wipe (AUDIT S5): after account deletion, nothing personal stays
// on the device. The exercise catalog is server-owned reference data and is
// kept; meta is cleared because it holds the cached plan, sync cursors, and
// onboarding answers.
import { DbLike } from './types';

const USER_TABLES = [
  'workout_sessions',
  'bodyweight_entries',
  'meal_profile_items',
  'meal_logs',
  'chat_messages',
  'recovery_checkins',
  'meta',
];

export async function wipeAllLocalData(db: DbLike): Promise<void> {
  for (const table of USER_TABLES) {
    await db.execAsync(`DELETE FROM ${table}`);
  }
}
