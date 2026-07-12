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

export const mealLogSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  portion: z.string().min(1).max(80),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  loggedAt: z.iso.datetime(),
});

export const syncMealLogsSchema = z.object({
  meals: z.array(mealLogSchema).min(1).max(200),
});

export type SyncMealProfileInput = z.infer<typeof syncMealProfileSchema>;
export type SyncMealLogsInput = z.infer<typeof syncMealLogsSchema>;
