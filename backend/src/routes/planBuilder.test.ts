// Piece 3 "done when": the builder converses (asks onboarding-category
// questions), proposes only from the template set / library, never writes a
// plan itself, and degrades to AI_UNAVAILABLE exactly like the chat coach —
// including when the model persistently invents exercises.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import { resetRateLimit } from "../services/chat.service";
import { planBuilderTurn } from "../services/planBuilder.service";

const email = `p3b-test-${Date.now()}@profit.dev`;
let token: string;
let userId: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "piece3-password", displayName: "P3B" });
  token = reg.body.token;
  userId = reg.body.user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  resetRateLimit();
});

describe("Piece 3 — conversational plan builder", () => {
  it("AI_ENABLED=false degrades to the same coach-unavailable state as chat", async () => {
    const res = await app
      .post("/ai/plan-builder")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "build me a plan" }] })
      .expect(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });

  it("asks a follow-up question when the model does", async () => {
    const reply = await planBuilderTurn(
      userId,
      [{ role: "user", content: "I want a plan" }],
      async () =>
        JSON.stringify({
          action: "ask",
          question: "Are you brand new to training, or getting back into it?",
        }),
    );
    expect(reply).toEqual({
      action: "ask",
      question: "Are you brand new to training, or getting back into it?",
    });
  });

  it("the system prompt is grounded in the template set and library boundary", async () => {
    let system: string | undefined;
    await planBuilderTurn(
      userId,
      [{ role: "user", content: "hi" }],
      async (_prompt, sys) => {
        system = sys;
        return JSON.stringify({ action: "ask", question: "Home or gym?" });
      },
    );
    // template catalog + library + ladder logic + disclaimer language present
    for (const needle of [
      "gentle-start",
      "glutes-legs",
      "EXERCISE LIBRARY",
      "Progression ladders",
      "not medical advice",
      "Never infer or assume a goal",
    ]) {
      expect(system, `system prompt missing: ${needle}`).toContain(needle);
    }
  });

  it("accepts a template proposal and writes NOTHING", async () => {
    const before = await prisma.plan.count({ where: { userId } });
    const reply = await planBuilderTurn(
      userId,
      [{ role: "user", content: "beginner, home, glutes please" }],
      async () =>
        JSON.stringify({
          action: "propose",
          summary: "Glutes-focused full-body starter for training at home.",
          proposal: {
            kind: "template",
            templateId: "glutes-legs",
            context: "home",
            experience: "beginner",
          },
        }),
    );
    expect(reply.action).toBe("propose");
    if (reply.action === "propose") {
      expect(reply.proposal).toMatchObject({ templateId: "glutes-legs" });
    }
    expect(await prisma.plan.count({ where: { userId } })).toBe(before); // no silent writes
  });

  it("accepts a custom arrangement only from real library exercises", async () => {
    const reply = await planBuilderTurn(
      userId,
      [{ role: "user", content: "just two short days" }],
      async () =>
        JSON.stringify({
          action: "propose",
          summary: "Two compact full-body days from the library.",
          proposal: {
            kind: "custom",
            name: "Compact Duo",
            context: "home",
            days: [
              {
                name: "Day 1",
                category: "bodybuilding",
                exercises: [
                  { exerciseId: "pushups", sets: 3, reps: "10-15", restSeconds: 75 },
                  { exerciseId: "bodyweight-squat", sets: 3, reps: "10-15", restSeconds: 75 },
                ],
              },
            ],
          },
        }),
    );
    expect(reply.action).toBe("propose");
  });

  it("a model that keeps inventing exercises degrades to AI_UNAVAILABLE (never reaches the client)", async () => {
    const attempts: string[] = [];
    await expect(
      planBuilderTurn(
        userId,
        [{ role: "user", content: "plan please" }],
        async (prompt) => {
          attempts.push(prompt);
          return JSON.stringify({
            action: "propose",
            summary: "Made this up.",
            proposal: {
              kind: "custom",
              name: "Invented",
              context: "gym",
              days: [
                {
                  name: "Day 1",
                  category: "bodybuilding",
                  exercises: [
                    { exerciseId: "quantum-flex-press", sets: 3, reps: "8", restSeconds: 90 },
                  ],
                },
              ],
            },
          });
        },
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(attempts.length).toBe(2); // validate → retry with feedback → give up
    expect(attempts[1]).toContain("not an exercise in the library");
  });

  it("rejects unknown template ids the same way", async () => {
    await expect(
      planBuilderTurn(userId, [{ role: "user", content: "plan" }], async () =>
        JSON.stringify({
          action: "propose",
          summary: "x",
          proposal: {
            kind: "template",
            templateId: "super-shred-3000",
            context: "gym",
            experience: "beginner",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
