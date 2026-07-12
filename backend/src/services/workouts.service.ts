import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { SyncWorkoutsInput, WorkoutSessionInput } from "../routes/workouts.schemas";

/**
 * Idempotent batch sync. Each session is keyed on its client-generated UUID:
 * replaying a batch (retry after a dropped response, double-tap, crash
 * between server write and device ack) rewrites the same rows instead of
 * duplicating. Nested rows are delete-and-recreated inside the transaction
 * so a re-send with corrected data also converges.
 */
export async function syncSessions(userId: string, input: SyncWorkoutsInput) {
  const exerciseIds = new Set(
    (await prisma.exercise.findMany({ select: { id: true } })).map((e) => e.id),
  );
  for (const s of input.sessions) {
    for (const e of s.exercises) {
      if (!exerciseIds.has(e.actualExerciseId)) {
        throw ApiError.badRequest(
          `Unknown exercise '${e.actualExerciseId}' in session ${s.id}`,
          "UNKNOWN_EXERCISE",
        );
      }
    }
  }

  const synced: string[] = [];
  for (const session of input.sessions) {
    await upsertSession(userId, session);
    synced.push(session.id);
  }
  return { synced };
}

async function upsertSession(userId: string, s: WorkoutSessionInput) {
  // A session id belongs to the device/user that created it.
  const existing = await prisma.workoutSession.findUnique({
    where: { id: s.id },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw ApiError.conflict(
      `Session ${s.id} belongs to another user`,
      "SESSION_OWNER_MISMATCH",
    );
  }

  const core = {
    userId,
    planId: s.planId,
    planDayId: s.planDayId,
    dayName: s.dayName,
    category: s.category as never,
    context: s.context as never,
    startedAt: new Date(s.startedAt),
    finishedAt: new Date(s.finishedAt),
    durationSeconds: s.durationSeconds,
    delta: s.delta,
  };

  await prisma.$transaction(async (tx) => {
    await tx.workoutSession.upsert({
      where: { id: s.id },
      create: { id: s.id, ...core },
      update: core,
    });
    await tx.workoutSessionExercise.deleteMany({ where: { sessionId: s.id } });
    for (const e of s.exercises) {
      await tx.workoutSessionExercise.create({
        data: {
          id: e.id,
          sessionId: s.id,
          order: e.order,
          plannedExerciseId: e.plannedExerciseId,
          actualExerciseId: e.actualExerciseId,
          skipped: e.skipped,
          sets: {
            create: e.sets.map((set) => ({
              id: set.id,
              setIndex: set.setIndex,
              plannedReps: set.plannedReps,
              plannedWeightKg: set.plannedWeightKg,
              actualReps: set.actualReps,
              weightKg: set.weightKg,
              completed: set.completed,
            })),
          },
        },
      });
    }
  });
}

export async function listSessions(userId: string) {
  return prisma.workoutSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { sets: { orderBy: { setIndex: "asc" } }, actualExercise: true },
      },
    },
  });
}
