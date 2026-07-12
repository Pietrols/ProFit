import { z } from "zod";

export const bodyweightEntrySchema = z.object({
  id: z.uuid(), // client-generated: the idempotency key
  weightKg: z.number().gt(0).lt(500),
  loggedAt: z.iso.datetime(),
});

export const syncBodyweightSchema = z.object({
  entries: z.array(bodyweightEntrySchema).min(1).max(200),
});

export type BodyweightEntryInput = z.infer<typeof bodyweightEntrySchema>;
export type SyncBodyweightInput = z.infer<typeof syncBodyweightSchema>;
