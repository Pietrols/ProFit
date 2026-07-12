// Phase 7: meal profile + logging (idempotent UUID sync, same contract as
// workouts/bodyweight) and the AI swap suggestion vs the user's goal.
import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { AiTransport, aiJson } from "../lib/aiJson";
import {
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
