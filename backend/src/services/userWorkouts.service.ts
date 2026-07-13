// Group F: user-created workouts + public community library.
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { aiEnabled } from "../lib/aiJson";
import { CreateUserWorkoutInput } from "../routes/userWorkouts.schemas";

const workoutInclude = {
  exercises: {
    orderBy: { order: "asc" as const },
    include: { exercise: true },
  },
  // Creator identity for the public library. Group G extends this select with
  // bio/picture (surfaced only via a shared public workout).
  user: {
    select: { id: true, displayName: true },
  },
};

export async function createUserWorkout(
  userId: string,
  input: CreateUserWorkoutInput,
) {
  const ids = input.exercises.map((e) => e.exerciseId);
  const known = new Set(
    (
      await prisma.exercise.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw ApiError.badRequest(
      `Unknown exercise(s): ${missing.join(", ")}`,
      "UNKNOWN_EXERCISE",
    );
  }

  return prisma.userWorkout.create({
    data: {
      userId,
      name: input.name,
      isPublic: input.isPublic,
      coverImage: input.coverImage,
      exercises: {
        create: input.exercises.map((e, order) => ({
          order,
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          restSeconds: e.restSeconds,
          durationSeconds: e.durationSeconds,
        })),
      },
    },
    include: workoutInclude,
  });
}

export async function listMine(userId: string) {
  return prisma.userWorkout.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: workoutInclude,
  });
}

/** Public community library — every authenticated user sees all public
 * workouts. No moderation/reporting in this pass (flagged in DECISIONS). */
export async function listPublic(limit = 50) {
  return prisma.userWorkout.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: workoutInclude,
  });
}

export async function getPublicWorkout(id: string) {
  const workout = await prisma.userWorkout.findFirst({
    where: { id, isPublic: true },
    include: workoutInclude,
  });
  if (!workout) throw ApiError.notFound("Workout not found", "WORKOUT_NOT_FOUND");
  return workout;
}

/**
 * Copy a public workout into the user's own plans as a new active custom
 * plan (a single day named after the workout). Copy — not a live reference —
 * so the original creator's later edits never touch the copier's plan.
 */
export async function copyToPlans(userId: string, workoutId: string) {
  const workout = await getPublicWorkout(workoutId);

  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return tx.plan.create({
      data: {
        userId,
        name: workout.name,
        context: "gym",
        isCustom: true,
        autoAdvanceTimers: true,
        days: {
          create: [
            {
              dayIndex: 0,
              name: workout.name,
              category: workout.exercises[0]?.exercise.category ?? "bodybuilding",
              exercises: {
                create: workout.exercises.map((e) => ({
                  order: e.order,
                  exerciseId: e.exerciseId,
                  sets: e.sets,
                  reps: e.reps,
                  restSeconds: e.restSeconds,
                  durationSeconds: e.durationSeconds,
                })),
              },
            },
          ],
        },
      },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: { orderBy: { order: "asc" }, include: { exercise: true } },
          },
        },
      },
    });
  });
}

/**
 * AI cover-image suggestion — a genuinely separate image path, NOT routed
 * through aiJson() (which is text/JSON only). Gated behind AI_ENABLED.
 *
 * PRODUCT FINDING: Anthropic's API has no image-generation capability
 * (Claude is text-output only), so on ProFit's Anthropic-only stack there is
 * no first-party image source. This returns "unavailable" — the caller then
 * saves the workout with no image, which is the required non-blocking
 * behavior. Wiring a real generator means adding a third-party image vendor
 * (new key, cost, data-sharing disclosure) — a decision left to the owner.
 */
export async function suggestCoverImage(): Promise<{
  imageUrl: string | null;
  available: boolean;
  reason: string;
}> {
  if (!aiEnabled()) {
    return {
      imageUrl: null,
      available: false,
      reason: "AI is disabled.",
    };
  }
  return {
    imageUrl: null,
    available: false,
    reason:
      "Image generation is not available on the current AI provider. Add your own cover image.",
  };
}
