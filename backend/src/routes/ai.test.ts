// Phase 6 done-when: skipping half a session produces a sensibly adjusted
// (lighter) next session; everything works end to end with AI_ENABLED=false;
// malformed model output is caught by Zod and falls back cleanly.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import { adjustmentSchema, nextSessionAdjustment } from "../services/ai.service";

const email = `p6-test-${Date.now()}@profit.dev`;
let token: string;
let planDayId: string;
let planExercises: { exerciseId: string; sets: number }[] = [];
const app = supertest(createApp());

function halfSkippedSession() {
  // First exercise fully done with weights; the rest skipped — a rough day.
  const [first, ...rest] = planExercises;
  return {
    id: randomUUID(),
    planId: null,
    planDayId,
    dayName: "Push",
    category: "bodybuilding",
    context: "gym",
    startedAt: "2026-07-11T09:00:00.000Z",
    finishedAt: "2026-07-11T09:25:00.000Z",
    durationSeconds: 1500,
    delta: {
      plannedExerciseCount: planExercises.length,
      completedExerciseCount: 1,
      plannedSetCount: planExercises.reduce((n, e) => n + e.sets, 0),
      completedSetCount: first.sets,
      skippedExercises: rest.map((e) => ({ exerciseId: e.exerciseId, name: e.exerciseId })),
      swappedExercises: [],
      cutShort: true,
    },
    exercises: [
      {
        id: randomUUID(),
        order: 0,
        plannedExerciseId: first.exerciseId,
        actualExerciseId: first.exerciseId,
        skipped: false,
        sets: Array.from({ length: first.sets }, (_, i) => ({
          id: randomUUID(),
          setIndex: i,
          plannedReps: "8-12",
          plannedWeightKg: null,
          actualReps: 10,
          weightKg: 40,
          completed: true,
        })),
      },
      ...rest.map((e, i) => ({
        id: randomUUID(),
        order: i + 1,
        plannedExerciseId: e.exerciseId,
        actualExerciseId: e.exerciseId,
        skipped: true,
        sets: [],
      })),
    ],
  };
}

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase6-password", displayName: "P6" });
  token = reg.body.token;

  const plan = await app
    .post("/plans")
    .set("Authorization", `Bearer ${token}`)
    .send({ context: "gym", days: [{ category: "bodybuilding" }, { category: "bodybuilding" }] });
  const day = plan.body.plan.days[0];
  planDayId = day.id;
  planExercises = day.exercises.map((pe: { exerciseId: string; sets: number }) => ({
    exerciseId: pe.exerciseId,
    sets: pe.sets,
  }));

  await app
    .post("/workouts/sync")
    .set("Authorization", `Bearer ${token}`)
    .send({ sessions: [halfSkippedSession()] })
    .expect(200);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 6 — AI layer (AI_ENABLED=false → deterministic fallbacks)", () => {
  it("skipping half a session produces a sensibly lighter next session", async () => {
    const res = await app
      .get(`/ai/next-session/${planDayId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.source).toBe("fallback"); // AI off — app still fully works
    const byId = new Map(
      res.body.adjustments.map((a: { exerciseId: string }) => [a.exerciseId, a]),
    );
    // every planned exercise gets an adjustment
    expect(byId.size).toBe(planExercises.length);

    // the completed exercise: session was cut short, so volume trims even there
    const first = byId.get(planExercises[0].exerciseId) as { sets: number; plannedWeightKg: number | null };
    expect(first.sets).toBeLessThanOrEqual(planExercises[0].sets);
    expect(first.plannedWeightKg).not.toBeNull(); // loads now prescribed

    // a skipped exercise: fewer sets than planned
    const skipped = byId.get(planExercises[1].exerciseId) as { sets: number };
    expect(skipped.sets).toBeLessThan(planExercises[1].sets);

    // a consistency nudge, short and actionable
    expect(res.body.nudges.length).toBeGreaterThan(0);
    expect(res.body.nudges[0].length).toBeLessThanOrEqual(200);
  });

  it("ability inference works with AI off and persists to the profile", async () => {
    const res = await app
      .get("/ai/ability")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.level).toBe("beginner"); // 1 session logged
    expect(res.body.source).toBe("fallback");

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.abilityLevel).toBe("beginner");
  });

  it("a malformed model response is caught by Zod and falls back cleanly", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const result = await nextSessionAdjustment(
      user!.id,
      planDayId,
      async () => '{"adjustments": "definitely not an array", "nudges": 42}',
    );
    expect(result.source).toBe("fallback");
    expect(adjustmentSchema.safeParse(result).success).toBe(true);
  });

  it("an AI response referencing unknown exercises is sanitized", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const result = await nextSessionAdjustment(
      user!.id,
      planDayId,
      async () =>
        JSON.stringify({
          adjustments: [
            { exerciseId: "totally-made-up", sets: 3, reps: "8-12", plannedWeightKg: 500 },
          ],
          nudges: [],
        }),
    );
    // all-invalid AI output collapses to the deterministic fallback
    expect(result.source).toBe("fallback");
    expect(
      result.adjustments.every((a) =>
        planExercises.some((pe) => pe.exerciseId === a.exerciseId),
      ),
    ).toBe(true);
  });

  it("plannedWeightKg round-trips through workout sync", async () => {
    const sessionId = randomUUID();
    await app
      .post("/workouts/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sessions: [
          {
            ...halfSkippedSession(),
            id: sessionId,
            exercises: [
              {
                id: randomUUID(),
                order: 0,
                plannedExerciseId: planExercises[0].exerciseId,
                actualExerciseId: planExercises[0].exerciseId,
                skipped: false,
                sets: [
                  {
                    id: randomUUID(),
                    setIndex: 0,
                    plannedReps: "8-12",
                    plannedWeightKg: 41,
                    actualReps: 9,
                    weightKg: 41,
                    completed: true,
                  },
                ],
              },
            ],
          },
        ],
      })
      .expect(200);

    const stored = await prisma.workoutSet.findFirst({
      where: { sessionExercise: { sessionId } },
    });
    expect(stored?.plannedWeightKg).toBe(41);
  });
});
