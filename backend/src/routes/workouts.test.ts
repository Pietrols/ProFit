// Phase 4 "done when": a session logged offline syncs cleanly on reconnect —
// re-sending the same batch produces no duplicates and the delta survives.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p4-test-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

function buildSession() {
  const sessionId = randomUUID();
  return {
    id: sessionId,
    planId: null,
    planDayId: null,
    dayName: "Push",
    category: "bodybuilding",
    context: "gym",
    startedAt: "2026-07-12T09:00:00.000Z",
    finishedAt: "2026-07-12T09:48:30.000Z",
    durationSeconds: 2910,
    delta: {
      plannedExerciseCount: 3,
      completedExerciseCount: 2,
      plannedSetCount: 9,
      completedSetCount: 7,
      skippedExercises: [{ exerciseId: "side-lateral-raise", name: "Side Lateral Raise" }],
      swappedExercises: [
        {
          fromExerciseId: "barbell-bench-press-medium-grip",
          toExerciseId: "dumbbell-bench-press",
          reason: "equipment",
        },
      ],
      cutShort: true,
    },
    exercises: [
      {
        id: randomUUID(),
        order: 0,
        plannedExerciseId: "barbell-bench-press-medium-grip",
        actualExerciseId: "dumbbell-bench-press", // swapped
        skipped: false,
        sets: [
          { id: randomUUID(), setIndex: 0, plannedReps: "8-12", actualReps: 10, weightKg: 30, completed: true },
          { id: randomUUID(), setIndex: 1, plannedReps: "8-12", actualReps: 8, weightKg: 30, completed: true },
          { id: randomUUID(), setIndex: 2, plannedReps: "8-12", actualReps: null, weightKg: null, completed: false },
        ],
      },
      {
        id: randomUUID(),
        order: 1,
        plannedExerciseId: "dumbbell-shoulder-press",
        actualExerciseId: "dumbbell-shoulder-press",
        skipped: false,
        sets: [
          { id: randomUUID(), setIndex: 0, plannedReps: "8-12", actualReps: 12, weightKg: 18, completed: true },
          { id: randomUUID(), setIndex: 1, plannedReps: "8-12", actualReps: 11, weightKg: 18, completed: true },
        ],
      },
      {
        id: randomUUID(),
        order: 2,
        plannedExerciseId: "side-lateral-raise",
        actualExerciseId: "side-lateral-raise",
        skipped: true,
        sets: [],
      },
    ],
  };
}

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase4-password", displayName: "P4" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 4 — workout sync", () => {
  it("syncing the same session twice creates no duplicates and preserves the delta", async () => {
    const session = buildSession();

    const first = await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(200);
    expect(first.body.synced).toEqual([session.id]);

    // The retry a flaky connection would produce
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(200);

    const sessions = await prisma.workoutSession.findMany({
      where: { user: { email } },
      include: { exercises: { include: { sets: true } } },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exercises).toHaveLength(3);
    expect(sessions[0].exercises.flatMap((e) => e.sets)).toHaveLength(5);

    // Delta preserved verbatim, in the AI-consumable shape
    expect(sessions[0].delta).toMatchObject({
      plannedSetCount: 9,
      completedSetCount: 7,
      cutShort: true,
      swappedExercises: [
        {
          fromExerciseId: "barbell-bench-press-medium-grip",
          toExerciseId: "dumbbell-bench-press",
          reason: "equipment",
        },
      ],
    });
  });

  it("a re-send with corrected data converges instead of appending", async () => {
    const session = buildSession();
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(200);

    session.exercises[1].sets[1].actualReps = 9; // corrected on device
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(200);

    const stored = await prisma.workoutSessionExercise.findUnique({
      where: { id: session.exercises[1].id },
      include: { sets: { orderBy: { setIndex: "asc" } } },
    });
    expect(stored?.sets).toHaveLength(2);
    expect(stored?.sets[1].actualReps).toBe(9);
  });

  it("rejects sessions referencing unknown exercises", async () => {
    const session = buildSession();
    session.exercises[0].actualExerciseId = "does-not-exist";
    const res = await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(400);
    expect(res.body.error.code).toBe("UNKNOWN_EXERCISE");
  });

  it("rejects a malformed delta", async () => {
    const session = buildSession() as { delta: unknown };
    session.delta = { nope: true };
    const res = await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessions: [session] })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists synced sessions with nested detail", async () => {
    const res = await app
      .get("/workouts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.sessions[0].exercises[0].actualExercise.name).toBeTruthy();
  });
});
