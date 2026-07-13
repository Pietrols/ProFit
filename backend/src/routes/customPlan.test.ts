// Group D done-when (backend half): a fully custom 3-day plan with named
// days, hand-picked exercises with per-exercise sets/reps, and custom rest
// timers persists and reloads via /plans/active.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `d-custom-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "group-d-password", displayName: "D" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

const customPlan = {
  name: "My Split",
  context: "gym" as const,
  timers: { defaultRestSeconds: 120, workIntervalSeconds: 40, autoAdvance: false },
  days: [
    {
      name: "Chest Day",
      category: "bodybuilding" as const,
      exercises: [
        { exerciseId: "barbell-bench-press-medium-grip", sets: 4, reps: "6-8", restSeconds: 150, durationSeconds: null },
        { exerciseId: "dumbbell-flyes", sets: 3, reps: "10-12", restSeconds: 90, durationSeconds: null },
      ],
    },
    {
      name: "Back Day",
      category: "bodybuilding" as const,
      exercises: [
        { exerciseId: "wide-grip-lat-pulldown", sets: 4, reps: "8-10", restSeconds: 120, durationSeconds: null },
      ],
    },
    {
      name: "Core Finisher",
      category: "bodybuilding" as const,
      exercises: [
        { exerciseId: "plank", sets: 3, reps: "hold", restSeconds: 60, durationSeconds: 45 },
      ],
    },
  ],
};

describe("Group D — custom plan builder", () => {
  it("creates a fully custom 3-day plan and returns the exact structure", async () => {
    const res = await app
      .post("/plans/custom")
      .set("Authorization", `Bearer ${token}`)
      .send(customPlan)
      .expect(201);

    const plan = res.body.plan;
    expect(plan.name).toBe("My Split");
    expect(plan.isCustom).toBe(true);
    expect(plan.defaultRestSeconds).toBe(120);
    expect(plan.workIntervalSeconds).toBe(40);
    expect(plan.autoAdvanceTimers).toBe(false);
    expect(plan.days.map((d: { name: string }) => d.name)).toEqual([
      "Chest Day",
      "Back Day",
      "Core Finisher",
    ]);
    // exact hand-picked exercises with per-exercise sets/reps/rest
    const chest = plan.days[0];
    expect(chest.exercises[0]).toMatchObject({
      exerciseId: "barbell-bench-press-medium-grip",
      sets: 4,
      reps: "6-8",
      restSeconds: 150,
    });
    // duration-based item preserved
    expect(plan.days[2].exercises[0].durationSeconds).toBe(45);
  });

  it("reloads the custom plan intact via /plans/active", async () => {
    const res = await app
      .get("/plans/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.plan.name).toBe("My Split");
    expect(res.body.plan.isCustom).toBe(true);
    expect(res.body.plan.days).toHaveLength(3);
    expect(res.body.plan.days[0].exercises[0].exercise.name).toBeTruthy();
  });

  it("rejects a plan referencing an unknown exercise", async () => {
    const res = await app
      .post("/plans/custom")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...customPlan,
        days: [
          {
            name: "Bad Day",
            category: "bodybuilding",
            exercises: [{ exerciseId: "does-not-exist", sets: 3, reps: "8", restSeconds: 60, durationSeconds: null }],
          },
        ],
      })
      .expect(400);
    expect(res.body.error.code).toBe("UNKNOWN_EXERCISE");
  });

  it("deactivates the previous plan (one active plan invariant holds)", async () => {
    const count = await prisma.plan.count({
      where: { user: { email }, isActive: true },
    });
    expect(count).toBe(1);
  });
});
