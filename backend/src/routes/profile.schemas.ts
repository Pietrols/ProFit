import { z } from "zod";

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    goal: z.enum(["bulking", "cutting", "maintaining"]),
    trainingDays: z.int().min(2).max(7),
    defaultContext: z.enum(["home", "gym"]),
    units: z.enum(["kg", "lb"]),
    // Public profile (Group G). null clears. avatar is an inline data URI.
    avatar: z.string().max(900_000).nullable(),
    publicBio: z.string().max(280).nullable(),
    // Injury considerations (AUDIT U4): null clears.
    injuryNotes: z.string().max(500).nullable(),
    // Onboarding (Piece 2): true stamps onboardedAt now, false clears it
    // (used by "revisit setup" only in the sense of re-completing; the wizard
    // itself is reopened client-side).
    onboarded: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// Account deletion (AUDIT S5): password re-confirmation required.
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
