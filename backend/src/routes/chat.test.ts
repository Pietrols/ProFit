// Phase 8 done-when: the home-equipment swap question gets an answer whose
// context honors the user's equipment tags; AI_ENABLED=false (or a model
// error) degrades to a clear "coach unavailable" state, never a crash.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import {
  buildContext,
  getHistory,
  resetRateLimit,
  sendMessage,
} from "../services/chat.service";

const email = `p8-test-${Date.now()}@profit.dev`;
let token: string;
let userId: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase8-password", displayName: "P8" });
  token = reg.body.token;
  userId = reg.body.user.id;

  await app
    .patch("/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ defaultContext: "home", injuryNotes: "knees; recovering ankle sprain" });
  await app
    .post("/plans")
    .set("Authorization", `Bearer ${token}`)
    .send({ context: "home", days: [{ category: "bodybuilding" }, { category: "bodybuilding" }, { category: "bodybuilding" }] });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  resetRateLimit();
});

describe("Phase 8 — chat companion", () => {
  it("AI_ENABLED=false degrades to a clear coach-unavailable state", async () => {
    const res = await app
      .post("/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "what can I swap for lat pulldown at home?" })
      .expect(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    // the unanswered message is not persisted
    expect(await getHistory(userId)).toHaveLength(0);
  });

  it("the model receives the user's real context: home setting + equipment tags", async () => {
    const context = await buildContext(userId);
    const parsed = JSON.parse(context);
    expect(parsed.profile.trainingContext).toBe("home");
    // AUDIT U4: injury considerations reach the model as a standing constraint
    expect(parsed.profile.injuryConsiderations).toBe("knees; recovering ankle sprain");
    // the plan's exercises carry equipment tags the model must respect
    const allEquipment = parsed.activePlan.days.flatMap(
      (d: { exercises: { equipment: string[] }[] }) =>
        d.exercises.flatMap((e) => e.equipment),
    );
    expect(allEquipment.length).toBeGreaterThan(0);
    // a home-context plan is entirely home-friendly equipment
    const HOME = ["bodyweight", "dumbbell", "kettlebell", "bands"];
    expect(allEquipment.every((e: string) => HOME.includes(e))).toBe(true);
  });

  it("answers the swap question via the model and persists both turns", async () => {
    const prompts: { prompt: string; system?: string }[] = [];
    const { reply } = await sendMessage(
      userId,
      "what can I swap for lat pulldown at home?",
      async (prompt, system) => {
        prompts.push({ prompt, system });
        return "Pull-ups are your best lat pulldown swap at home — same lats focus, bodyweight only. No bar? Bent-over dumbbell rows hit the same muscles.";
      },
    );
    expect(reply.role).toBe("assistant");
    expect(reply.content).toContain("Pull-ups");

    // the model saw the user's context and the question
    expect(prompts[0].prompt).toContain('"trainingContext":"home"');
    expect(prompts[0].prompt).toContain("lat pulldown");
    expect(prompts[0].system).toContain("equipment");

    const history = await getHistory(userId);
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("a model failure mid-conversation is coach-unavailable, not a 500", async () => {
    const before = (await getHistory(userId)).length;
    await expect(
      sendMessage(userId, "hello?", async () => {
        throw new Error("model exploded");
      }),
    ).rejects.toMatchObject({ status: 503, code: "AI_UNAVAILABLE" });
    expect((await getHistory(userId)).length).toBe(before);
  });

  it("history endpoint returns persisted messages for offline caching", async () => {
    const res = await app
      .get("/chat")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.messages.length).toBe(2);
  });

  it("rate limit trips after 20 sends in the window", async () => {
    resetRateLimit();
    const fake = async () => "ok";
    for (let i = 0; i < 20; i++) {
      await sendMessage(userId, `msg ${i}`, fake);
    }
    await expect(sendMessage(userId, "one too many", fake)).rejects.toMatchObject({
      status: 429,
      code: "CHAT_RATE_LIMITED",
    });
  });
});
