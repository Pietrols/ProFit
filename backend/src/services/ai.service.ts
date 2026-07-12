// Phase 6 AI capabilities: ability inference + next-session adjustment.
// Both run through aiJson() — validated, retried, and backed by the
// deterministic rules below, which ARE the behavior when AI_ENABLED=false.
// Prompts contain only the user's own plan, logs, and goal.
import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { AiTransport, aiJson } from "../lib/aiJson";
import { weeklySoreness } from "./recovery.service";

// ---------- shared session summary (the model's only input) ----------

async function recentSessions(userId: string, take = 8) {
  return prisma.workoutSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take,
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { sets: { orderBy: { setIndex: "asc" } } },
      },
    },
  });
}

type RecentSession = Awaited<ReturnType<typeof recentSessions>>[number];

function summarizeSessions(sessions: RecentSession[]) {
  return sessions.map((s) => ({
    startedAt: s.startedAt.toISOString(),
    dayName: s.dayName,
    category: s.category,
    durationMinutes: Math.round(s.durationSeconds / 60),
    delta: s.delta,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.actualExerciseId,
      skipped: e.skipped,
      sets: e.sets.map((set) => ({
        plannedReps: set.plannedReps,
        actualReps: set.actualReps,
        weightKg: set.weightKg,
        completed: set.completed,
      })),
    })),
  }));
}

// ---------- (a) ability inference ----------

export const abilitySchema = z.object({
  level: z.enum(["beginner", "intermediate", "advanced"]),
  rationale: z.string().max(300),
});
export type Ability = z.infer<typeof abilitySchema>;

/** Deterministic heuristic — also the AI-off behavior. */
export function abilityFallback(
  sessionCount: number,
  avgCompletionPct: number,
): Ability {
  if (sessionCount < 6 || avgCompletionPct < 50) {
    return {
      level: "beginner",
      rationale: `Based on ${sessionCount} logged sessions — keep building the habit.`,
    };
  }
  if (sessionCount < 24 || avgCompletionPct < 85) {
    return {
      level: "intermediate",
      rationale: `${sessionCount} sessions with ${Math.round(avgCompletionPct)}% average completion.`,
    };
  }
  return {
    level: "advanced",
    rationale: `${sessionCount} sessions with consistently high completion.`,
  };
}

function completionPct(s: RecentSession): number {
  const delta = s.delta as { plannedSetCount?: number; completedSetCount?: number };
  const planned = delta.plannedSetCount ?? 0;
  return planned > 0 ? ((delta.completedSetCount ?? 0) / planned) * 100 : 100;
}

export async function inferAbility(userId: string, transport?: AiTransport) {
  const sessions = await recentSessions(userId, 20);
  const sessionCount = await prisma.workoutSession.count({ where: { userId } });
  const avgCompletion =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + completionPct(s), 0) / sessions.length
      : 0;

  const result = await aiJson({
    system:
      "You are a strength coach classifying a lifter's ability level from their logged training only. Respond with JSON: {\"level\": \"beginner\"|\"intermediate\"|\"advanced\", \"rationale\": string (one sentence, encouraging, non-judgmental)}.",
    prompt: JSON.stringify({
      totalSessions: sessionCount,
      recentSessions: summarizeSessions(sessions),
    }),
    schema: abilitySchema,
    fallback: () => abilityFallback(sessionCount, avgCompletion),
    transport,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { abilityLevel: result.value.level },
  });
  return { ...result.value, source: result.source };
}

// ---------- (b) next-session adjustment ----------

export const adjustmentSchema = z.object({
  adjustments: z.array(
    z.object({
      exerciseId: z.string(),
      sets: z.int().min(1).max(10),
      reps: z.string().min(1).max(40),
      plannedWeightKg: z.number().gt(0).lt(1000).nullable(),
      note: z.string().max(200).optional(),
    }),
  ),
  nudges: z.array(z.string().max(200)).max(3),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

interface PlanDayForAdjustment {
  exercises: {
    exerciseId: string;
    sets: number;
    reps: string;
    exercise: { name: string };
  }[];
}

/**
 * Deterministic progression/regression rules — also the AI-off behavior.
 * - full completion last time → +2.5% load (or hold if bodyweight)
 * - under 60% of sets completed, or skipped → one set fewer, -10% load
 * - last session cut short → trim one set from every exercise
 * - avg soreness ≥ 4 over the trailing week → DELOAD: -20% load, -1 set,
 *   overriding progression (a plan that never backs off is a bug)
 */
export function adjustmentFallback(
  day: PlanDayForAdjustment,
  history: RecentSession[],
  avgSoreness: number | null = null,
): Adjustment {
  const last = history[0];
  const lastDelta = (last?.delta ?? null) as {
    cutShort?: boolean;
    completedSetCount?: number;
    plannedSetCount?: number;
  } | null;
  const cutShort = Boolean(lastDelta?.cutShort);
  const deload = avgSoreness !== null && avgSoreness >= 4;

  const nudges: string[] = [];
  if (deload) {
    nudges.push(
      "You've been sore all week — this is a deload session. Lighter on purpose; recovery is where the growth happens.",
    );
  } else if (cutShort) {
    nudges.push(
      "Last session ran out of steam — volume trimmed so you can finish strong.",
    );
  }

  const adjustments = day.exercises.map((pe) => {
    // most recent performance of this exercise across recent sessions
    let perf: { completedAll: boolean; skippedOrPoor: boolean; topWeight: number | null } | null =
      null;
    for (const s of history) {
      const e = s.exercises.find((x) => x.actualExerciseId === pe.exerciseId);
      if (!e) continue;
      const completed = e.sets.filter((set) => set.completed);
      const weights = completed
        .map((set) => set.weightKg)
        .filter((w): w is number => w !== null);
      perf = {
        completedAll: !e.skipped && e.sets.length > 0 && completed.length === e.sets.length,
        skippedOrPoor:
          e.skipped || (e.sets.length > 0 && completed.length / e.sets.length < 0.6),
        topWeight: weights.length ? Math.max(...weights) : null,
      };
      break;
    }

    let sets = pe.sets;
    let weight = perf?.topWeight ?? null;
    let note: string | undefined;

    if (deload) {
      sets = Math.max(2, sets - 1);
      if (weight !== null) weight = round05(weight * 0.8);
      note = "Deload — around 80% of your usual load, crisp reps.";
    } else if (perf?.skippedOrPoor) {
      sets = Math.max(2, sets - 1);
      if (weight !== null) weight = round05(weight * 0.9);
      note = "Scaled back after a tough last outing — nail every set.";
    } else if (perf?.completedAll && weight !== null) {
      weight = round05(weight * 1.025);
      note = "All sets done last time — small load bump.";
    }
    if (cutShort && !deload) sets = Math.max(2, sets - 1);

    return {
      exerciseId: pe.exerciseId,
      sets,
      reps: pe.reps,
      plannedWeightKg: weight,
      ...(note ? { note } : {}),
    };
  });

  // consistency nudge from repeated skips
  const skipCounts = new Map<string, number>();
  for (const s of history) {
    const d = s.delta as { skippedExercises?: { name: string }[] };
    for (const sk of d.skippedExercises ?? []) {
      skipCounts.set(sk.name, (skipCounts.get(sk.name) ?? 0) + 1);
    }
  }
  const repeatSkip = [...skipCounts.entries()].find(([, n]) => n >= 2);
  if (repeatSkip && nudges.length < 3) {
    nudges.push(
      `${repeatSkip[0]} keeps getting skipped — try it first while you're fresh.`,
    );
  }

  return { adjustments, nudges };
}

const round05 = (n: number) => Math.round(n * 2) / 2;

export async function nextSessionAdjustment(
  userId: string,
  planDayId: string,
  transport?: AiTransport,
) {
  const day = await prisma.planDay.findFirst({
    where: { id: planDayId, plan: { userId } },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: { name: true } } },
      },
    },
  });
  if (!day) throw ApiError.notFound("Plan day not found", "PLAN_DAY_NOT_FOUND");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const history = await recentSessions(userId, 5);
  const avgSoreness = await weeklySoreness(userId);

  const result = await aiJson({
    system:
      'You are a strength coach adjusting the next session from planned-vs-actual history and recovery check-ins. Keep changes conservative (±1 set, ±2.5-10% load); if average weekly soreness is 4+, program a deload (~-20% load, -1 set). Nudges are short, actionable, and encouraging — never lectures. Respond with JSON: {"adjustments": [{"exerciseId", "sets", "reps", "plannedWeightKg" (kg, null if unknown), "note"?}], "nudges": [string, max 3]}. Include every planned exercise exactly once, using the given exerciseIds.',
    prompt: JSON.stringify({
      goal: user?.goal,
      abilityLevel: user?.abilityLevel,
      avgWeeklySoreness: avgSoreness,
      plannedDay: {
        name: day.name,
        category: day.category,
        exercises: day.exercises.map((pe) => ({
          exerciseId: pe.exerciseId,
          name: pe.exercise.name,
          sets: pe.sets,
          reps: pe.reps,
        })),
      },
      recentSessions: summarizeSessions(history),
    }),
    schema: adjustmentSchema,
    fallback: () => adjustmentFallback(day, history, avgSoreness),
    transport,
  });

  // Belt and braces: even AI-sourced output must cover only known exercises.
  const known = new Set(day.exercises.map((pe) => pe.exerciseId));
  const safe = {
    ...result.value,
    adjustments: result.value.adjustments.filter((a) => known.has(a.exerciseId)),
  };
  if (safe.adjustments.length === 0 && day.exercises.length > 0) {
    return {
      ...adjustmentFallback(day, history, avgSoreness),
      source: "fallback" as const,
    };
  }
  return { ...safe, source: result.source };
}
