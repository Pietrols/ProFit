// Phase 7 done-when: log a normal day of meals → one useful, goal-aligned
// swap suggestion; logging and history work fully with AI_ENABLED=false.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import {
  mealSuggestion,
  suggestionSchema,
} from "../services/nutrition.service";

const email = `p7-test-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

const today = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase7-password", displayName: "P7" });
  token = reg.body.token;
  await app
    .patch("/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ goal: "cutting" });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 7 — nutrition (AI_ENABLED=false)", () => {
  it("meal profile onboarding syncs idempotently", async () => {
    const item = {
      id: randomUUID(),
      name: "Porridge with banana",
      typicalPortion: "1 bowl",
      deletedAt: null,
    };
    await app
      .post("/nutrition/profile/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [item] })
      .expect(200);
    await app
      .post("/nutrition/profile/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [item] })
      .expect(200);

    const res = await app
      .get("/nutrition/profile")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("a normal day of meals logs, replays without duplicates, and lists", async () => {
    const meals = [
      { id: randomUUID(), name: "Porridge with banana", portion: "1 bowl", mealType: "breakfast", loggedAt: today(8) },
      { id: randomUUID(), name: "Chicken wrap", portion: "1 wrap", mealType: "lunch", loggedAt: today(13) },
      { id: randomUUID(), name: "Spaghetti bolognese", portion: "large plate", mealType: "dinner", loggedAt: today(19) },
    ];
    await app
      .post("/nutrition/meals/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ meals })
      .expect(200);
    await app
      .post("/nutrition/meals/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ meals })
      .expect(200); // replay

    const res = await app
      .get("/nutrition/meals")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.meals).toHaveLength(3);
  });

  it("returns one useful, goal-aligned suggestion with AI off", async () => {
    const res = await app
      .get("/nutrition/suggestion")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe("fallback");
    // goal-aligned: references the actual logged dinner, cutting-flavored
    expect(res.body.targetMeal).toBe("Spaghetti bolognese");
    expect(res.body.suggestion).toMatch(/smaller portion|protein/i);
    expect(res.body.suggestion.length).toBeLessThanOrEqual(300);
  });

  it("a malformed AI suggestion falls back cleanly", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const result = await mealSuggestion(user!.id, async () => "eat less lol");
    expect(result.source).toBe("fallback");
    expect(suggestionSchema.safeParse(result).success).toBe(true);
  });

  it("rejects malformed meal input", async () => {
    const res = await app
      .post("/nutrition/meals/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ meals: [{ id: "not-a-uuid", name: "", portion: "", mealType: "brunch", loggedAt: "now" }] })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
