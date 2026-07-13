// Group B done-when: logging "shawarma" with protein=100 and the rest
// unknown produces flagged estimates for the unknown fields ONLY; with AI
// off the meal saves with those fields honestly null (no fake numbers).
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import { estimateMacros } from "../services/nutrition.service";

const email = `b-macros-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "group-b-password", displayName: "B" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Group B — meal macros", () => {
  it("estimates ONLY unknown fields, never overwriting user-entered values", async () => {
    // AI returns all four; the service must keep only carbs/fat/calories.
    const { estimates, source } = await estimateMacros(
      {
        name: "shawarma",
        portion: "1 wrap",
        known: { protein: 100, carbs: null, fat: null, calories: null },
      },
      async () =>
        JSON.stringify({ protein: 40, carbs: 45, fat: 30, calories: 650 }),
    );
    expect(source).toBe("ai");
    expect(estimates).toEqual({ carbs: 45, fat: 30, calories: 650 });
    expect(estimates).not.toHaveProperty("protein"); // user's 100 preserved
  });

  it("with AI off, returns no estimates (honest 'don't know')", async () => {
    const { estimates, source } = await estimateMacros({
      name: "shawarma",
      portion: "1 wrap",
      known: { protein: 100, carbs: null, fat: null, calories: null },
    }); // no transport, AI_ENABLED unset in test env
    expect(estimates).toEqual({});
    expect(source).toBe("fallback");
  });

  it("a malformed AI response falls back to no estimates", async () => {
    const { estimates, source } = await estimateMacros(
      { name: "shawarma", portion: "1 wrap", known: { protein: null, carbs: null, fat: null, calories: null } },
      async () => "roughly 600ish calories I think",
    );
    expect(estimates).toEqual({});
    expect(source).toBe("fallback");
  });

  it("persists macros + estimatedFields through meal sync", async () => {
    const id = randomUUID();
    await app
      .post("/nutrition/meals/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        meals: [
          {
            id,
            name: "shawarma",
            portion: "1 wrap",
            mealType: "dinner",
            loggedAt: new Date().toISOString(),
            protein: 100,
            carbs: 45,
            fat: 30,
            calories: 650,
            estimatedFields: ["carbs", "fat", "calories"],
          },
        ],
      })
      .expect(200);

    const stored = await prisma.mealLog.findUnique({ where: { id } });
    expect(stored).toMatchObject({
      proteinG: 100,
      carbsG: 45,
      fatG: 30,
      calories: 650,
      estimatedFields: ["carbs", "fat", "calories"],
    });
  });

  it("older-client meals without macros still sync (fields null)", async () => {
    const id = randomUUID();
    await app
      .post("/nutrition/meals/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        meals: [
          { id, name: "toast", portion: "2 slices", mealType: "breakfast", loggedAt: new Date().toISOString() },
        ],
      })
      .expect(200);
    const stored = await prisma.mealLog.findUnique({ where: { id } });
    expect(stored?.proteinG).toBeNull();
    expect(stored?.estimatedFields).toEqual([]);
  });
});
