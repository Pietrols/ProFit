import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { Exercise } from "../generated/prisma/client";
import {
  CreateCustomPlanInput,
  CreateFromTemplateInput,
  CreatePlanInput,
  ListTemplatesQuery,
  SetDifficultyInput,
} from "../routes/plans.schemas";
import {
  resolveTemplateDays,
  STARTER_TEMPLATES,
} from "./starterTemplates";
import {
  Category,
  DayTemplate,
  MAJOR_GROUPS,
  resolveDayTemplates,
  Slot,
} from "./planTemplates";

const HOME_EQUIPMENT = ["bodyweight", "dumbbell", "kettlebell", "bands"];

function allowedForContext(e: Exercise, context: "home" | "gym") {
  return (
    context === "gym" || e.equipment.some((t) => HOME_EQUIPMENT.includes(t))
  );
}

interface PickedExercise {
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

/**
 * Fill a slot with a concrete exercise for the context. Deterministic:
 * preferred ids first (swapped for their home alternative when the pick
 * doesn't fit the context), then muscle-matching candidates, avoiding
 * repeats within the plan until the pool is exhausted.
 */
function pickExercise(
  slot: Slot,
  category: Category,
  pool: Exercise[],
  context: "home" | "gym",
  usedInPlan: Set<string>,
): Exercise | null {
  const byId = new Map(pool.map((e) => [e.id, e]));

  for (const id of slot.prefer ?? []) {
    const direct = byId.get(id);
    if (!direct) continue;
    if (allowedForContext(direct, context)) return direct;
    const alt = direct.homeAlternativeId
      ? byId.get(direct.homeAlternativeId)
      : null;
    if (alt && allowedForContext(alt, context)) return alt;
  }

  const candidates = pool.filter(
    (e) =>
      allowedForContext(e, context) &&
      e.primaryMuscles.some((m) => slot.muscles.includes(m)),
  );
  if (candidates.length === 0) return null;

  // Same-category candidates first, then fresh picks before repeats.
  candidates.sort((a, b) => {
    const cat = Number(b.category === category) - Number(a.category === category);
    if (cat !== 0) return cat;
    const fresh = Number(usedInPlan.has(a.id)) - Number(usedInPlan.has(b.id));
    if (fresh !== 0) return fresh;
    return a.id.localeCompare(b.id);
  });
  return candidates[0];
}

interface GeneratedDay {
  name: string;
  category: Category;
  exercises: PickedExercise[];
}

export function generateDays(
  templates: DayTemplate[],
  pool: Exercise[],
  context: "home" | "gym",
): GeneratedDay[] {
  const used = new Set<string>();
  const days: GeneratedDay[] = templates.map((tpl) => {
    const exercises: PickedExercise[] = [];
    for (const slot of tpl.slots) {
      const pick = pickExercise(slot, tpl.category, pool, context, used);
      if (!pick) continue; // no exercise fits this slot in this context
      if (exercises.some((e) => e.exerciseId === pick.id)) continue; // no dupes within a day
      used.add(pick.id);
      exercises.push({
        exerciseId: pick.id,
        sets: slot.sets,
        reps: slot.reps,
        restSeconds: slot.restSeconds,
      });
    }
    return { name: tpl.name, category: tpl.category, exercises };
  });

  balanceMuscles(days, pool, context, used);
  return days;
}

/**
 * The "PPL×5 leaves legs behind" guard: if the week's strength days leave a
 * major muscle group untouched, append one exercise for it to the lightest
 * strength day.
 */
function balanceMuscles(
  days: GeneratedDay[],
  pool: Exercise[],
  context: "home" | "gym",
  used: Set<string>,
) {
  const strengthDays = days.filter(
    (d) => d.category === "bodybuilding" || d.category === "powerlifting",
  );
  if (strengthDays.length === 0) return;

  const byId = new Map(pool.map((e) => [e.id, e]));
  const weeklyMuscles = new Set(
    strengthDays.flatMap((d) =>
      d.exercises.flatMap((pe) => byId.get(pe.exerciseId)?.primaryMuscles ?? []),
    ),
  );

  for (const group of MAJOR_GROUPS) {
    if (group.some((m) => weeklyMuscles.has(m))) continue;
    const fix = pickExercise(
      { muscles: group, sets: 3, reps: "8-12", restSeconds: 90 },
      "bodybuilding",
      pool,
      context,
      used,
    );
    if (!fix) continue;
    const lightest = strengthDays.reduce((a, b) =>
      b.exercises.length < a.exercises.length ? b : a,
    );
    lightest.exercises.push({
      exerciseId: fix.id,
      sets: 3,
      reps: "8-12",
      restSeconds: 90,
    });
    used.add(fix.id);
    fix.primaryMuscles.forEach((m) => weeklyMuscles.add(m));
  }
}

const planInclude = {
  days: {
    orderBy: { dayIndex: "asc" as const },
    include: {
      exercises: {
        orderBy: { order: "asc" as const },
        include: { exercise: true },
      },
    },
  },
};

export async function createPlan(userId: string, input: CreatePlanInput) {
  const templates = resolveDayTemplates(input.days.map((d) => d.category));
  const pool = await prisma.exercise.findMany();
  const days = generateDays(templates, pool, input.context);

  if (days.some((d) => d.exercises.length === 0)) {
    throw new ApiError(
      422,
      "PLAN_UNFILLABLE",
      "Could not fill every training day for that context",
    );
  }

  const name =
    input.name ??
    `${input.days.length}-day ${new Set(input.days.map((d) => d.category)).size > 1 ? "custom" : input.days[0].category} plan`;

  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return tx.plan.create({
      data: {
        userId,
        name,
        context: input.context,
        days: {
          create: days.map((d, dayIndex) => ({
            dayIndex,
            name: d.name,
            category: d.category as never,
            exercises: {
              create: d.exercises.map((e, order) => ({ order, ...e })),
            },
          })),
        },
      },
      include: planInclude,
    });
  });
}

/**
 * Fully-custom plan (Group D): named days with hand-picked exercises. No
 * template generation — the user's exact structure is persisted, with
 * plan-level timer settings. Every referenced exercise must exist.
 */
export async function createCustomPlan(
  userId: string,
  input: CreateCustomPlanInput,
) {
  const referenced = new Set(
    input.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
  );
  const known = new Set(
    (
      await prisma.exercise.findMany({
        where: { id: { in: [...referenced] } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  const missing = [...referenced].filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw ApiError.badRequest(
      `Unknown exercise(s): ${missing.join(", ")}`,
      "UNKNOWN_EXERCISE",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return tx.plan.create({
      data: {
        userId,
        name: input.name,
        context: input.context,
        isCustom: true,
        defaultRestSeconds: input.timers.defaultRestSeconds,
        workIntervalSeconds: input.timers.workIntervalSeconds,
        autoAdvanceTimers: input.timers.autoAdvance,
        days: {
          create: input.days.map((d, dayIndex) => ({
            dayIndex,
            name: d.name,
            category: d.category as never,
            isDaily: d.isDaily,
            exercises: {
              create: d.exercises.map((e, order) => ({
                order,
                exerciseId: e.exerciseId,
                sets: e.sets,
                reps: e.reps,
                restSeconds: e.restSeconds,
                durationSeconds: e.durationSeconds,
              })),
            },
          })),
        },
      },
      include: planInclude,
    });
  });
}

/**
 * Starter templates (Piece 1), resolved for a context + experience. Every
 * template resolves against the live library — a template referencing an
 * unknown slug is a seed/integrity bug and fails loudly rather than shipping
 * an unfillable plan. Templates not supporting the requested context resolve
 * in their own supported context (so the full set of 6 is always returned).
 */
export async function listStarterTemplates(query: ListTemplatesQuery) {
  const resolved = STARTER_TEMPLATES.map((t) => {
    const context = t.contexts.includes(query.context)
      ? query.context
      : t.contexts[0];
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      disclaimer: t.disclaimer,
      goal: t.goal,
      gentle: t.gentle,
      contexts: t.contexts,
      context,
      days: resolveTemplateDays(t, context, query.experience),
    };
  });

  const referenced = new Set(
    resolved.flatMap((t) =>
      t.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
    ),
  );
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: [...referenced] } },
  });
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const missing = [...referenced].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      500,
      "TEMPLATE_INTEGRITY",
      `Starter template references unknown exercise(s): ${missing.join(", ")}`,
    );
  }

  return resolved.map((t) => ({
    ...t,
    days: t.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        const ex = byId.get(e.exerciseId)!;
        return {
          ...e,
          exercise: {
            id: ex.id,
            name: ex.name,
            equipment: ex.equipment,
            movementPattern: ex.movementPattern,
            difficultyTier: ex.difficultyTier,
          },
        };
      }),
    })),
  }));
}

/**
 * Create a real plan from a starter template (Piece 1). Reuses the standard
 * plan-creation shape: deactivate the previous active plan, persist the
 * template's exact structure (with per-exercise notes/cues).
 */
export async function createPlanFromTemplate(
  userId: string,
  input: CreateFromTemplateInput,
) {
  const template = STARTER_TEMPLATES.find((t) => t.id === input.templateId);
  if (!template) {
    throw ApiError.badRequest(
      `Unknown template: ${input.templateId}`,
      "UNKNOWN_TEMPLATE",
    );
  }
  if (!template.contexts.includes(input.context)) {
    throw ApiError.badRequest(
      `Template ${template.id} does not support the ${input.context} context`,
      "TEMPLATE_CONTEXT",
    );
  }

  const days = resolveTemplateDays(template, input.context, input.experience);
  const referenced = new Set(
    days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
  );
  const known = new Set(
    (
      await prisma.exercise.findMany({
        where: { id: { in: [...referenced] } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  const missing = [...referenced].filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      500,
      "TEMPLATE_INTEGRITY",
      `Starter template references unknown exercise(s): ${missing.join(", ")}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return tx.plan.create({
      data: {
        userId,
        name: template.title,
        context: input.context,
        defaultRestSeconds: template.defaultRestSeconds,
        days: {
          create: days.map((d, dayIndex) => ({
            dayIndex,
            name: d.name,
            category: d.category as never,
            exercises: {
              create: d.exercises.map((e, order) => ({
                order,
                exerciseId: e.exerciseId,
                sets: e.sets,
                reps: e.reps,
                restSeconds: e.restSeconds,
                durationSeconds: e.durationSeconds,
                note: e.note,
              })),
            },
          })),
        },
      },
      include: planInclude,
    });
  });
}

export async function getActivePlan(userId: string) {
  return prisma.plan.findFirst({
    where: { userId, isActive: true },
    include: planInclude,
  });
}

// ---- Per-plan difficulty baseline (Piece 4) ----

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
 * get more rest when gentler, less when harder. The shift is relative to the
 * plan's current difficulty, and ladder links are symmetric, so switching
 * back restores the original rungs.
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
