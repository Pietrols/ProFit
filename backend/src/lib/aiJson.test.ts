// Phase 6 done-when (aiJson core): a forced malformed model response is
// caught by Zod and falls back cleanly; with AI disabled everything still
// works via fallbacks; a valid retry is used.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiJson, extractJson } from "./aiJson";

const schema = z.object({ level: z.enum(["beginner", "intermediate", "advanced"]) });
const fallback = () => ({ level: "beginner" as const });

describe("aiJson", () => {
  it("returns validated AI output", async () => {
    const res = await aiJson({
      prompt: "p",
      schema,
      fallback,
      transport: async () => '{"level": "intermediate"}',
    });
    expect(res).toEqual({ value: { level: "intermediate" }, source: "ai" });
  });

  it("retries once with error feedback, then uses the valid answer", async () => {
    const prompts: string[] = [];
    const res = await aiJson({
      prompt: "p",
      schema,
      fallback,
      transport: async (prompt) => {
        prompts.push(prompt);
        return prompts.length === 1
          ? '{"level": "superhuman"}' // invalid enum
          : '{"level": "advanced"}';
      },
    });
    expect(res.source).toBe("ai");
    expect(res.value.level).toBe("advanced");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("previous response was invalid");
  });

  it("falls back cleanly after two malformed responses — never throws", async () => {
    const res = await aiJson({
      prompt: "p",
      schema,
      fallback,
      transport: async () => "I cannot answer in JSON, sorry!",
    });
    expect(res).toEqual({ value: { level: "beginner" }, source: "fallback" });
  });

  it("falls back when the transport itself fails (network/model error)", async () => {
    const res = await aiJson({
      prompt: "p",
      schema,
      fallback,
      transport: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(res.source).toBe("fallback");
  });

  it("uses the fallback immediately when AI_ENABLED is off", async () => {
    // no transport injected and AI_ENABLED unset in the test env
    const res = await aiJson({ prompt: "p", schema, fallback });
    expect(res).toEqual({ value: { level: "beginner" }, source: "fallback" });
  });

  it("extractJson tolerates fences and prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```\nDone!')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });
});
