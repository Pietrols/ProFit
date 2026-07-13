import { z } from "zod";

export const mealProfileItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  typicalPortion: z.string().min(1).max(80),
  deletedAt: z.iso.datetime().nullable().default(null),
});

export const syncMealProfileSchema = z.object({
  items: z.array(mealProfileItemSchema).min(1).max(100),
});

export const MACRO_FIELDS = ["protein", "carbs", "fat", "calories"] as const;
export type MacroField = (typeof MACRO_FIELDS)[number];

export const mealLogSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  portion: z.string().min(1).max(80),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  loggedAt: z.iso.datetime(),
  // Macros: null = unknown ("I don't know"). estimatedFields flags which are
  // AI-estimated. Optional/defaulted so older clients keep working.
  protein: z.number().min(0).max(500).nullable().default(null),
  carbs: z.number().min(0).max(1000).nullable().default(null),
  fat: z.number().min(0).max(500).nullable().default(null),
  calories: z.number().min(0).max(10000).nullable().default(null),
  estimatedFields: z.array(z.enum(MACRO_FIELDS)).default([]),
});

export const syncMealLogsSchema = z.object({
  meals: z.array(mealLogSchema).min(1).max(200),
});

// Macro estimation request (Group B): the meal name + portion + whatever the
// user already entered. The AI fills only the fields left null.
export const estimateMacrosSchema = z.object({
  name: z.string().min(1).max(120),
  portion: z.string().min(1).max(80).default("1 serving"),
  known: z.object({
    protein: z.number().min(0).nullable().default(null),
    carbs: z.number().min(0).nullable().default(null),
    fat: z.number().min(0).nullable().default(null),
    calories: z.number().min(0).nullable().default(null),
  }),
});

export type SyncMealProfileInput = z.infer<typeof syncMealProfileSchema>;
export type SyncMealLogsInput = z.infer<typeof syncMealLogsSchema>;
export type EstimateMacrosInput = z.infer<typeof estimateMacrosSchema>;
