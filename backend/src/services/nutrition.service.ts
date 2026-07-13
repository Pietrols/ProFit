// Phase 7: meal profile + logging (idempotent UUID sync, same contract as
// workouts/bodyweight) and the AI swap suggestion vs the user's goal.
import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { AiTransport, aiJson } from "../lib/aiJson";
import {
  EstimateMacrosInput,
  MACRO_FIELDS,
  MacroField,
  SyncMealLogsInput,
  SyncMealProfileInput,
} from "../routes/nutrition.schemas";

async function guardOwnership(
  table: "mealProfileItem" | "mealLog",
  ids: string[],
  userId: string,
) {
  const rows =
    table === "mealProfileItem"
      ? await prisma.mealProfileItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, userId: true },
        })
      : await prisma.mealLog.findMany({
          where: { id: { in: ids } },
          select: { id: true, userId: true },
        });
  const foreign = rows.find((r) => r.userId !== userId);
  if (foreign) {
    throw ApiError.conflict(
      `Row ${foreign.id} belongs to another user`,
      "ROW_OWNER_MISMATCH",
    );
  }
}

export async function syncProfile(userId: string, input: SyncMealProfileInput) {
  await guardOwnership("mealProfileItem", input.items.map((i) => i.id), userId);
  for (const item of input.items) {
    const data = {
      userId,
      name: item.name,
      typicalPortion: item.typicalPortion,
      deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
    };
    await prisma.mealProfileItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...data },
      update: data,
    });
  }
  return { synced: input.items.map((i) => i.id) };
}

export async function syncMeals(userId: string, input: SyncMealLogsInput) {
  await guardOwnership("mealLog", input.meals.map((m) => m.id), userId);
  for (const meal of input.meals) {
    const data = {
      userId,
      name: meal.name,
      portion: meal.portion,
      mealType: meal.mealType as never,
      loggedAt: new Date(meal.loggedAt),
      proteinG: meal.protein,
      carbsG: meal.carbs,
      fatG: meal.fat,
      calories: meal.calories,
      estimatedFields: meal.estimatedFields,
    };
    await prisma.mealLog.upsert({
      where: { id: meal.id },
      create: { id: meal.id, ...data },
      update: data,
    });
  }
  return { synced: input.meals.map((m) => m.id) };
}

export async function getProfile(userId: string) {
  return prisma.mealProfileItem.findMany({
    where: { userId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function listMeals(userId: string, since?: string) {
  return prisma.mealLog.findMany({
    where: {
      userId,
      ...(since ? { loggedAt: { gte: new Date(since) } } : {}),
    },
    orderBy: { loggedAt: "desc" },
    take: 200,
  });
}

// ---------- AI swap suggestion ----------

export const suggestionSchema = z.object({
  suggestion: z.string().min(10).max(300),
  targetMeal: z.string().max(120).nullable(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

interface LoggedMeal {
  name: string;
  portion: string;
  mealType: string;
}

/** Goal-aligned, non-preachy deterministic fallback — the AI-off behavior. */
export function suggestionFallback(
  goal: string,
  todaysMeals: LoggedMeal[],
): Suggestion {
  if (todaysMeals.length === 0) {
    return {
      suggestion:
        "Nothing logged yet today — jot down your next meal and suggestions will show up here.",
      targetMeal: null,
    };
  }
  const last = todaysMeals[todaysMeals.length - 1];
  switch (goal) {
    case "cutting":
      return {
        suggestion: `Nice logging. If you fancy an easy win, a slightly smaller portion of ${last.name} (or a protein-forward swap) keeps the day on track without feeling like a diet.`,
        targetMeal: last.name,
      };
    case "bulking":
      return {
        suggestion: `Solid day so far. Adding a protein-rich snack alongside ${last.name} — yogurt, eggs, a shake — is the easiest way to bank extra quality calories.`,
        targetMeal: last.name,
      };
    default:
      return {
        suggestion: `Looks balanced. Keeping portions like today's ${last.name} steady is exactly what maintaining looks like — nothing to change.`,
        targetMeal: last.name,
      };
  }
}

// ---------- AI macro estimation ----------

export const macroEstimateSchema = z.object({
  protein: z.number().min(0).max(500).optional(),
  carbs: z.number().min(0).max(1000).optional(),
  fat: z.number().min(0).max(500).optional(),
  calories: z.number().min(0).max(10000).optional(),
});
export type MacroEstimate = z.infer<typeof macroEstimateSchema>;

/**
 * Estimate ONLY the macro fields the user left unknown, from the food name +
 * whatever they did enter. AI off / model failure → empty estimates (the
 * unknown fields stay null; we never present a fabricated number as real).
 */
export async function estimateMacros(
  input: EstimateMacrosInput,
  transport?: AiTransport,
): Promise<{ estimates: MacroEstimate; source: "ai" | "fallback" }> {
  const unknown = MACRO_FIELDS.filter((f) => input.known[f] == null);
  if (unknown.length === 0) return { estimates: {}, source: "fallback" };

  const result = await aiJson<MacroEstimate>({
    system:
      "You are a nutrition database. Estimate the macronutrients of the named food at the given portion. Protein, carbs, and fat are in grams; calories in kcal. Estimate ONLY the requested fields; be realistic for a typical portion. Respond with JSON containing just those numeric fields.",
    prompt: JSON.stringify({
      food: input.name,
      portion: input.portion,
      alreadyKnown: input.known,
      estimateOnly: unknown,
    }),
    schema: macroEstimateSchema,
    fallback: () => ({}), // honest "don't know" — no fabricated numbers
    transport,
  });

  // Safety: keep only the fields that were actually unknown, so AI output can
  // never overwrite a value the user entered themselves.
  const estimates: MacroEstimate = {};
  for (const f of unknown as MacroField[]) {
    const v = result.value[f];
    if (typeof v === "number") estimates[f] = v;
  }
  return {
    estimates,
    source: Object.keys(estimates).length > 0 ? result.source : "fallback",
  };
}

export async function mealSuggestion(userId: string, transport?: AiTransport) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [todaysMeals, profile] = await Promise.all([
    prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: dayStart } },
      orderBy: { loggedAt: "asc" },
    }),
    getProfile(userId),
  ]);

  const meals: LoggedMeal[] = todaysMeals.map((m) => ({
    name: m.name,
    portion: m.portion,
    mealType: m.mealType,
  }));

  const result = await aiJson({
    system:
      'You are a pragmatic nutrition coach. Given what the user actually ate today, their usual foods, and their goal, offer exactly ONE practical swap or portion adjustment. Work with their real eating habits — never prescribe a meal plan, calorie target, or lecture. Friendly, specific, zero guilt. Respond with JSON: {"suggestion": string (1-2 sentences), "targetMeal": string|null (the logged meal it refers to)}.',
    prompt: JSON.stringify({
      goal: user?.goal,
      todaysMeals: meals,
      usualFoods: profile.map((p) => ({ name: p.name, typicalPortion: p.typicalPortion })),
    }),
    schema: suggestionSchema,
    fallback: () => suggestionFallback(user?.goal ?? "maintaining", meals),
    transport,
  });
  return { ...result.value, source: result.source };
}
