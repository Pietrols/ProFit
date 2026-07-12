import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { SyncBodyweightInput } from "../routes/bodyweight.schemas";

/** Idempotent batch sync, same contract as workout sync: upsert on client UUID. */
export async function syncEntries(userId: string, input: SyncBodyweightInput) {
  const synced: string[] = [];
  for (const entry of input.entries) {
    const existing = await prisma.bodyweightEntry.findUnique({
      where: { id: entry.id },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw ApiError.conflict(
        `Entry ${entry.id} belongs to another user`,
        "ENTRY_OWNER_MISMATCH",
      );
    }
    const data = {
      userId,
      weightKg: entry.weightKg,
      loggedAt: new Date(entry.loggedAt),
    };
    await prisma.bodyweightEntry.upsert({
      where: { id: entry.id },
      create: { id: entry.id, ...data },
      update: data,
    });
    synced.push(entry.id);
  }
  return { synced };
}

export async function listEntries(userId: string) {
  return prisma.bodyweightEntry.findMany({
    where: { userId },
    orderBy: { loggedAt: "asc" },
  });
}
