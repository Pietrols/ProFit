import { prisma } from "../db";

/**
 * Full or incremental exercise list for device sync. Returns serverTime so the
 * client can store it as its next `updatedSince` cursor without clock skew.
 */
export async function listExercises(updatedSince?: string) {
  const serverTime = new Date().toISOString();
  const exercises = await prisma.exercise.findMany({
    where: updatedSince ? { updatedAt: { gt: new Date(updatedSince) } } : undefined,
    orderBy: { name: "asc" },
  });
  return { serverTime, exercises };
}
