import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { Exercise } from "../generated/prisma/client";
import {
  CreateCustomPlanInput,
  CreatePlanInput,
} from "../routes/plans.schemas";
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

export async function getActivePlan(userId: string) {
  return prisma.plan.findFirst({
    where: { userId, isActive: true },
    include: planInclude,
  });
}
