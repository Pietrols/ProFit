// Phase 3 "done when": a 4-day custom plan (3 bodybuilding + 1 cardio)
// renders with real exercises for the user's context — verified for both
// contexts, plus the muscle-balance guard.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const HOME_EQUIPMENT = ["bodyweight", "dumbbell", "kettlebell", "bands"];
const email = `p3-test-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

const customFourDay = {
  days: [
    { category: "bodybuilding" },
    { category: "bodybuilding" },
    { category: "bodybuilding" },
    { category: "cardio" },
  ],
};

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase3-password", displayName: "P3" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 3 — plan builder", () => {
  it("builds the 4-day custom plan (3 BB + 1 cardio) with real gym exercises", async () => {
    const res = await app
      .post("/plans")
      .set("Authorization", `Bearer ${token}`)
      .send({ context: "gym", ...customFourDay })
      .expect(201);

    const plan = res.body.plan;
    expect(plan.days).toHaveLength(4);
    expect(plan.days.map((d: { category: string }) => d.category)).toEqual([
      "bodybuilding",
      "bodybuilding",
      "bodybuilding",
      "cardio",
    ]);
    // 3 BB days resolve to the PPL split
    expect(plan.days.map((d: { name: string }) => d.name)).toEqual([
      "Push",
      "Pull",
      "Legs",
      "Steady State",
    ]);

    for (const day of plan.days) {
      expect(day.exercises.length).toBeGreaterThan(0);
      for (const pe of day.exercises) {
        // real, seeded exercises with full detail joined in
        expect(pe.exercise.id).toBe(pe.exerciseId);
        expect(pe.exercise.demoUrl).toMatch(/^https:\/\//);
        expect(pe.sets).toBeGreaterThan(0);
        expect(pe.reps).toBeTruthy();
      }
    }

    // the cardio day prescribes an actual cardio exercise
    const cardioDay = plan.days[3];
    expect(cardioDay.exercises[0].exercise.category).toBe("cardio");
  });

  it("respects the home context: every exercise is home-equipment", async () => {
    const res = await app
      .post("/plans")
      .set("Authorization", `Bearer ${token}`)
      .send({ context: "home", ...customFourDay })
      .expect(201);

    for (const day of res.body.plan.days) {
      for (const pe of day.exercises) {
        expect(
          pe.exercise.equipment.some((t: string) => HOME_EQUIPMENT.includes(t)),
          `${pe.exercise.name} (${pe.exercise.equipment}) is not home-friendly`,
        ).toBe(true);
      }
    }
  });

  it("does not leave a major muscle group untrained for the week", async () => {
    const res = await app
      .post("/plans")
      .set("Authorization", `Bearer ${token}`)
      .send({ context: "gym", ...customFourDay })
      .expect(201);

    const muscles = new Set<string>(
      res.body.plan.days.flatMap((d: { exercises: { exercise: { primaryMuscles: string[] } }[] }) =>
        d.exercises.flatMap((pe) => pe.exercise.primaryMuscles),
      ),
    );
    for (const group of [
      ["chest"],
      ["lats", "middle back"],
      ["shoulders"],
      ["quadriceps"],
      ["hamstrings", "glutes"],
    ]) {
      expect(
        group.some((m) => muscles.has(m)),
        `nothing trains ${group.join("/")}`,
      ).toBe(true);
    }
  });

  it("creating a plan deactivates the previous one; /plans/active returns the newest", async () => {
    const active = await app
      .get("/plans/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(active.body.plan).toBeTruthy();

    const count = await prisma.plan.count({
      where: { user: { email }, isActive: true },
    });
    expect(count).toBe(1);
  });

  it("validates day count", async () => {
    const res = await app
      .post("/plans")
      .set("Authorization", `Bearer ${token}`)
      .send({ context: "gym", days: [{ category: "bodybuilding" }] })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
