import { DbLike } from './types';

export interface RecoveryCheckin {
  id: string;
  soreness: number; // 1 (fresh) – 5 (wrecked)
  sleepQuality: number; // 1 (awful) – 5 (great)
  loggedAt: string;
}

export async function saveCheckinLocal(
  db: DbLike,
  checkin: RecoveryCheckin,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO recovery_checkins
     (id, soreness, sleep_quality, logged_at, synced)
     VALUES (?,?,?,?,COALESCE((SELECT synced FROM recovery_checkins WHERE id = ?), 0))`,
    [checkin.id, checkin.soreness, checkin.sleepQuality, checkin.loggedAt, checkin.id],
  );
}

export async function pushCheckins(
  db: DbLike,
  post: (rows: RecoveryCheckin[]) => Promise<{ synced: string[] }>,
): Promise<{ pushed: number }> {
  const rows = await db.getAllAsync<{
    id: string;
    soreness: number;
    sleep_quality: number;
    logged_at: string;
  }>('SELECT * FROM recovery_checkins WHERE synced = 0');
  if (rows.length === 0) return { pushed: 0 };
  const pending = rows.map((r) => ({
    id: r.id,
    soreness: r.soreness,
    sleepQuality: r.sleep_quality,
    loggedAt: r.logged_at,
  }));
  const { synced } = await post(pending);
  for (const id of synced) {
    await db.runAsync('UPDATE recovery_checkins SET synced = 1 WHERE id = ?', [id]);
  }
  return { pushed: synced.length };
}

/** Most recent check-in, if any (feeds the day suggestion, AUDIT M3). */
export async function latestCheckin(db: DbLike): Promise<RecoveryCheckin | null> {
  const r = await db.getFirstAsync<{
    id: string;
    soreness: number;
    sleep_quality: number;
    logged_at: string;
  }>('SELECT * FROM recovery_checkins ORDER BY logged_at DESC LIMIT 1');
  return r
    ? { id: r.id, soreness: r.soreness, sleepQuality: r.sleep_quality, loggedAt: r.logged_at }
    : null;
}

/** Whether a check-in was already logged today (skip the prompt). */
export async function hasCheckinToday(db: DbLike): Promise<boolean> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM recovery_checkins WHERE logged_at >= ?',
    [dayStart.toISOString()],
  );
  return (row?.n ?? 0) > 0;
}
