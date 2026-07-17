import { z } from "zod";

// Plan builder (Piece 3): the client sends the builder transcript each turn.
export const planBuilderSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
});

export type PlanBuilderInput = z.infer<typeof planBuilderSchema>;
