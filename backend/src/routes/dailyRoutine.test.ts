// Group E done-when (backend half): a plan day marked "do every day" persists
// and reloads with isDaily=true, and completing it produces its own workout
// session independent of the day-specific split's session.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `e-daily-${Date.now()}@profit.dev`;
let token: string;
let dailyDayId: string;
let splitDayId: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "group-e-password", displayName: "E" });
  token = reg.body.token;

  const res = await app
    .post("/plans/custom")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Split + Daily",
      context: "gym",
      timers: { defaultRestSeconds: 90, workIntervalSeconds: null, autoAdvance: true },
      days: [
        {
          name: "Daily Mobility",
          category: "bodybuilding",
          isDaily: true,
          exercises: [{ exerciseId: "plank", sets: 3, reps: "hold", restSeconds: 30, durationSeconds: 45 }],
        },
        {
          name: "Chest Day",
          category: "bodybuilding",
          exercises: [{ exerciseId: "dumbbell-flyes", sets: 3, reps: "10-12", restSeconds: 90, durationSeconds: null }],
        },
      ],
    })
    .expect(201);
  dailyDayId = res.body.plan.days.find((d: { isDaily: boolean }) => d.isDaily).id;
  splitDayId = res.body.plan.days.find((d: { isDaily: boolean }) => !d.isDaily).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

function session(planDayId: string, dayName: string) {
  return {
    id: randomUUID(),
    planId: null,
    planDayId,
    dayName,
    category: "bodybuilding",
    context: "gym",
    startedAt: "2026-07-13T09:00:00.000Z",
    finishedAt: "2026-07-13T09:20:00.000Z",
    durationSeconds: 1200,
    delta: {
      plannedExerciseCount: 1,
      completedExerciseCount: 1,
      plannedSetCount: 3,
      completedSetCount: 3,
      skippedExercises: [],
      swappedExercises: [],
      cutShort: false,
    },
    exercises: [
      {
        id: randomUUID(),
        order: 0,
        plannedExerciseId: "plank",
        actualExerciseId: "plank",
        skipped: false,
        sets: [{ id: randomUUID(), setIndex: 0, plannedReps: "hold", plannedWeightKg: null, actualReps: null, weightKg: null, completed: true }],
      },
    ],
  };
}

describe("Group E — mandatory daily routine", () => {
  it("the daily flag persists and reloads via /plans/active", async () => {
    const res = await app
      .get("/plans/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const days = res.body.plan.days;
    expect(days.find((d: { name: string }) => d.name === 'Daily Mobility').isDaily).toBe(true);
    expect(days.find((d: { name: string }) => d.name === 'Chest Day').isDaily).toBe(false);
  });

  it("routine and split sessions coexist as independent completions", async () => {
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session(dailyDayId, "Daily Mobility")] })
      .expect(200);
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session(splitDayId, "Chest Day")] })
      .expect(200);

    const sessions = await prisma.workoutSession.findMany({
      where: { user: { email } },
      select: { planDayId: true, dayName: true },
    });
    expect(sessions).toHaveLength(2);
    // two distinct planDay completions — neither overwrites the other
    expect(new Set(sessions.map((s) => s.planDayId))).toEqual(
      new Set([dailyDayId, splitDayId]),
    );
  });
});
