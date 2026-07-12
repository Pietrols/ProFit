import { z } from "zod";

export const recoveryCheckinSchema = z.object({
  id: z.uuid(),
  soreness: z.int().min(1).max(5),
  sleepQuality: z.int().min(1).max(5),
  loggedAt: z.iso.datetime(),
});

export const syncRecoverySchema = z.object({
  checkins: z.array(recoveryCheckinSchema).min(1).max(100),
});

export type SyncRecoveryInput = z.infer<typeof syncRecoverySchema>;
