// Phase 9 done-when: a simulated week of high soreness produces a lighter,
// deload-flavored next-session adjustment.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p9-test-${Date.now()}@profit.dev`;
let token: string;
let planDayId: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase9-password", displayName: "P9" });
  token = reg.body.token;

  const plan = await app
    .post("/plans")
    .set("Authorization", `Bearer ${token}`)
    .send({ context: "gym", days: [{ category: "bodybuilding" }, { category: "bodybuilding" }] });
  planDayId = plan.body.plan.days[0].id;

  // one strong logged session so the baseline (no soreness) would progress
  const exercises = plan.body.plan.days[0].exercises.map(
    (pe: { exerciseId: string; sets: number }, order: number) => ({
      id: randomUUID(),
      order,
      plannedExerciseId: pe.exerciseId,
      actualExerciseId: pe.exerciseId,
      skipped: false,
      sets: Array.from({ length: pe.sets }, (_, i) => ({
        id: randomUUID(),
        setIndex: i,
        plannedReps: "8-12",
        plannedWeightKg: null,
        actualReps: 10,
        weightKg: 50,
        completed: true,
      })),
    }),
  );
  await app
    .post("/workouts/sync")
    .set("Authorization", `Bearer ${token}`)
    .send({
      sessions: [
        {
          id: randomUUID(),
          planId: null,
          planDayId,
          dayName: "Push",
          category: "bodybuilding",
          context: "gym",
          startedAt: "2026-07-10T09:00:00.000Z",
          finishedAt: "2026-07-10T10:00:00.000Z",
          durationSeconds: 3600,
          delta: {
            plannedExerciseCount: exercises.length,
            completedExerciseCount: exercises.length,
            plannedSetCount: exercises.reduce((n: number, e: { sets: unknown[] }) => n + e.sets.length, 0),
            completedSetCount: exercises.reduce((n: number, e: { sets: unknown[] }) => n + e.sets.length, 0),
            skippedExercises: [],
            swappedExercises: [],
            cutShort: false,
          },
          exercises,
        },
      ],
    })
    .expect(200);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 9 — recovery + deload", () => {
  it("without soreness data, a strong session progresses the load", async () => {
    const res = await app
      .get(`/ai/next-session/${planDayId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const weighted = res.body.adjustments.find(
      (a: { plannedWeightKg: number | null }) => a.plannedWeightKg !== null,
    );
    expect(weighted.plannedWeightKg).toBeGreaterThan(50); // +2.5% progression
  });

  it("check-ins sync idempotently and reject nonsense", async () => {
    const checkin = {
      id: randomUUID(),
      soreness: 5,
      sleepQuality: 2,
      loggedAt: new Date().toISOString(),
    };
    await app
      .post("/recovery/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ checkins: [checkin] })
      .expect(200);
    await app
      .post("/recovery/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ checkins: [checkin] })
      .expect(200);
    expect(await prisma.recoveryCheckin.count({ where: { user: { email } } })).toBe(1);

    const bad = await app
      .post("/recovery/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ checkins: [{ id: randomUUID(), soreness: 9, sleepQuality: 0, loggedAt: "yesterday" }] })
      .expect(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("a week of high soreness produces a lighter deload session", async () => {
    // simulate the rest of a rough week
    const week = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID(),
      soreness: 5,
      sleepQuality: 2,
      loggedAt: new Date(Date.now() - (i + 1) * 86400_000).toISOString(),
    }));
    await app
      .post("/recovery/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ checkins: week })
      .expect(200);

    const res = await app
      .get(`/ai/next-session/${planDayId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const weighted = res.body.adjustments.find(
      (a: { plannedWeightKg: number | null }) => a.plannedWeightKg !== null,
    );
    // deload overrides progression: ~80% of the 50kg baseline, not 51+
    expect(weighted.plannedWeightKg).toBeLessThan(50);
    expect(weighted.plannedWeightKg).toBeCloseTo(40, 0);
    expect(res.body.nudges.join(" ")).toMatch(/deload/i);
  });
});
