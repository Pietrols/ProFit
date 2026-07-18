// Per-plan difficulty baseline (Piece 4), split out of plans.service (AUDIT
// C1): plan generation, starter templates, and difficulty shifting are three
// different concerns; this module owns the ladder-walking one.
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { Exercise } from "../generated/prisma/client";
import { SetDifficultyInput } from "../routes/plans.schemas";
import { planInclude } from "./plans.service";

const DIFFICULTY_RANK = { gentle: -1, standard: 0, challenging: 1 } as const;
/** Rest delta per step DOWN for loaded exercises (more rest when gentler). */
const REST_STEP_SECONDS = 30;

/** Walk an exercise `steps` rungs along its ladder (negative = easier). */
export function walkLadder(
  exerciseId: string,
  steps: number,
  byId: Map<string, Exercise>,
): string {
  let current = exerciseId;
  for (let i = 0; i < Math.abs(steps); i++) {
    const ex = byId.get(current);
    const next = steps < 0 ? ex?.easierVariantId : ex?.harderVariantId;
    if (!next || !byId.has(next)) break; // end of ladder — keep the best rung
    current = next;
  }
  return current;
}

/**
 * On a progression ladder at all (pattern-tiered with a sibling link). The
 * ladders are bodyweight-centred but deliberately include loaded rungs
 * (goblet squat, dumbbell row) as top/bottom tiers — branching on ladder
 * membership rather than equipment keeps every shift reversible.
 */
function isLaddered(ex: Exercise | undefined): boolean {
  return Boolean(
    ex?.movementPattern && (ex.easierVariantId || ex.harderVariantId),
  );
}

/**
 * Set the active plan's difficulty baseline. Laddered (bodyweight-family)
 * exercises walk the progression ladder by the rank delta (Gentle = one tier
 * down from Standard, Challenging = one up); non-laddered loaded exercises
 * get more rest when gentler, less when harder. Shifts always resolve from
 * the recorded standard baseline, so every round-trip is exact.
 */
export async function setPlanDifficulty(
  userId: string,
  input: SetDifficultyInput,
) {
  const plan = await prisma.plan.findFirst({
    where: { userId, isActive: true },
    include: planInclude,
  });
  if (!plan) {
    throw new ApiError(404, "NO_ACTIVE_PLAN", "No active plan to adjust");
  }

  if (input.difficulty === plan.difficulty) return plan;
  const rank = DIFFICULTY_RANK[input.difficulty];

  const byId = new Map(
    (await prisma.exercise.findMany()).map((e) => [e.id, e]),
  );

  const updates: {
    id: string;
    exerciseId?: string;
    baselineExerciseId?: string | null;
    restSeconds?: number;
    baselineRestSeconds?: number | null;
  }[] = [];
  for (const day of plan.days) {
    for (const pe of day.exercises) {
      // At standard, current values ARE the baseline; away from it, the
      // recorded baseline anchors every further shift.
      const baseExerciseId =
        plan.difficulty === "standard"
          ? pe.exerciseId
          : (pe.baselineExerciseId ?? pe.exerciseId);
      const baseRest =
        plan.difficulty === "standard"
          ? pe.restSeconds
          : (pe.baselineRestSeconds ?? pe.restSeconds);

      if (isLaddered(byId.get(baseExerciseId))) {
        updates.push({
          id: pe.id,
          exerciseId: walkLadder(baseExerciseId, rank, byId),
          baselineExerciseId: rank === 0 ? null : baseExerciseId,
        });
      } else if (day.category !== "cardio") {
        updates.push({
          id: pe.id,
          restSeconds: Math.max(15, baseRest - rank * REST_STEP_SECONDS),
          baselineRestSeconds: rank === 0 ? null : baseRest,
        });
      }
    }
  }

  await prisma.$transaction([
    ...updates.map(({ id, ...data }) =>
      prisma.planExercise.update({ where: { id }, data }),
    ),
    prisma.plan.update({
      where: { id: plan.id },
      data: { difficulty: input.difficulty },
    }),
  ]);

  return prisma.plan.findUniqueOrThrow({
    where: { id: plan.id },
    include: planInclude,
  });
}
