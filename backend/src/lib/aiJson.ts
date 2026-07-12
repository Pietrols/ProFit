// The single gateway for all Anthropic calls (PROJECT.md §2): prompt + Zod
// schema in, validated JSON out. Validate → retry once with error feedback →
// deterministic fallback, so the app never blocks or errors because of the AI.
// AI output is untrusted input: nothing reaches a caller without Zod.
// Server-side only — the API key never leaves this process.
import Anthropic from "@anthropic-ai/sdk";
import { ZodType } from "zod";

/** Feature flag: AI is off unless explicitly enabled AND a key is present. */
export function aiEnabled(): boolean {
  return (
    process.env.AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/** Raw model text for a prompt. Injectable so tests run without a key. */
export type AiTransport = (prompt: string, system?: string) => Promise<string>;

let client: Anthropic | null = null;

const liveTransport: AiTransport = async (prompt, system) => {
  client ??= new Anthropic();
  const message = await client.messages.create({
    model: process.env.AI_MODEL ?? "claude-opus-4-8",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content.find((b) => b.type === "text");
  return text && "text" in text ? text.text : "";
};

/** Pull the first JSON object/array out of model text (tolerates fences/prose). */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/g, "");
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error("No JSON in response");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) throw new Error("Unbalanced JSON in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface AiJsonResult<T> {
  value: T;
  /** whether the value came from the model or the deterministic fallback */
  source: "ai" | "fallback";
}

export async function aiJson<T>(options: {
  prompt: string;
  system?: string;
  schema: ZodType<T>;
  fallback: () => T;
  transport?: AiTransport;
}): Promise<AiJsonResult<T>> {
  const transport = options.transport ?? (aiEnabled() ? liveTransport : null);
  if (!transport) return { value: options.fallback(), source: "fallback" };

  let prompt = options.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await transport(prompt, options.system);
      const parsed = options.schema.safeParse(extractJson(raw));
      if (parsed.success) return { value: parsed.data, source: "ai" };
      prompt = `${options.prompt}\n\nYour previous response was invalid: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}. Respond with ONLY valid JSON matching the schema.`;
    } catch {
      // network/model/JSON failure — retry once, then fall back
    }
  }
  return { value: options.fallback(), source: "fallback" };
}
