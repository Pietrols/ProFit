// Group F: user-created workouts + public community library.
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { aiEnabled } from "../lib/aiJson";
import { assertImageOrNull } from "../lib/imageData";
import { logger } from "../lib/logger";
import { CreateUserWorkoutInput } from "../routes/userWorkouts.schemas";

/** Distinct reporters that auto-hide a public workout (AUDIT S6). */
const REPORT_HIDE_THRESHOLD = 3;

const workoutInclude = {
  exercises: {
    orderBy: { order: "asc" as const },
    include: { exercise: true },
  },
  // Creator identity for the public library, including the public profile
  // (Group G: avatar + bio) — surfaced ONLY here, via a shared public workout.
  user: {
    select: { id: true, displayName: true, avatar: true, publicBio: true },
  },
};

export async function createUserWorkout(
  userId: string,
  input: CreateUserWorkoutInput,
) {
  assertImageOrNull(input.coverImage); // AUDIT S6
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

/** Public community library — hidden (reported) workouts are excluded. */
export async function listPublic(limit = 50) {
  return prisma.userWorkout.findMany({
    where: { isPublic: true, hidden: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: workoutInclude,
  });
}

export async function getPublicWorkout(id: string) {
  const workout = await prisma.userWorkout.findFirst({
    where: { id, isPublic: true, hidden: false },
    include: workoutInclude,
  });
  if (!workout) throw ApiError.notFound("Workout not found", "WORKOUT_NOT_FOUND");
  return workout;
}

/**
 * Report a public workout (AUDIT S6). One report per user (replays update
 * the reason); at REPORT_HIDE_THRESHOLD distinct reporters the workout is
 * auto-hidden from the library pending owner review — reversible, unlike
 * deletion, so a brigade can't destroy content permanently.
 */
export async function reportWorkout(
  reporterId: string,
  workoutId: string,
  reason: string,
) {
  const workout = await prisma.userWorkout.findFirst({
    where: { id: workoutId, isPublic: true },
    select: { id: true, userId: true },
  });
  if (!workout) throw ApiError.notFound("Workout not found", "WORKOUT_NOT_FOUND");
  if (workout.userId === reporterId) {
    throw ApiError.badRequest("You can unshare your own workout instead.", "OWN_WORKOUT");
  }

  await prisma.workoutReport.upsert({
    where: { workoutId_reporterId: { workoutId, reporterId } },
    create: { workoutId, reporterId, reason },
    update: { reason },
  });
  const count = await prisma.workoutReport.count({ where: { workoutId } });
  if (count >= REPORT_HIDE_THRESHOLD) {
    await prisma.userWorkout.update({
      where: { id: workoutId },
      data: { hidden: true },
    });
    logger.warn(
      { event: "moderation.auto_hidden", workoutId, reports: count },
      "public workout auto-hidden",
    );
  }
  return { reported: true };
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
