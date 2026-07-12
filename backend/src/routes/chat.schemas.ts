import { z } from "zod";

export const sendChatSchema = z.object({
  message: z.string().min(1).max(2000),
});

export type SendChatInput = z.infer<typeof sendChatSchema>;
