import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { SyncRecoveryInput } from "../routes/recovery.schemas";

export async function syncCheckins(userId: string, input: SyncRecoveryInput) {
  const existing = await prisma.recoveryCheckin.findMany({
    where: { id: { in: input.checkins.map((c) => c.id) } },
    select: { id: true, userId: true },
  });
  const foreign = existing.find((r) => r.userId !== userId);
  if (foreign) {
    throw ApiError.conflict(
      `Check-in ${foreign.id} belongs to another user`,
      "ROW_OWNER_MISMATCH",
    );
  }

  for (const c of input.checkins) {
    const data = {
      userId,
      soreness: c.soreness,
      sleepQuality: c.sleepQuality,
      loggedAt: new Date(c.loggedAt),
    };
    await prisma.recoveryCheckin.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  return { synced: input.checkins.map((c) => c.id) };
}

/** Average soreness over the trailing week; null when no check-ins. */
export async function weeklySoreness(userId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.recoveryCheckin.findMany({
    where: { userId, loggedAt: { gte: cutoff } },
    select: { soreness: true },
  });
  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.soreness, 0) / rows.length;
}
