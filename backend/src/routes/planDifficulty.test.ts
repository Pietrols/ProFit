// Piece 4 "done when" (per-plan half): setting the plan to Gentle swaps
// bodyweight exercises one ladder tier down persistently; setting it back to
// Standard restores the original rungs; loaded exercises trade rest instead.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p4-diff-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

interface PlanExerciseView {
  id: string;
  exerciseId: string;
  restSeconds: number;
  exercise: {
    equipment: string[];
    movementPattern: string | null;
    easierVariantId: string | null;
    harderVariantId: string | null;
  };
}

function isLaddered(e: PlanExerciseView) {
  return Boolean(
    e.exercise.movementPattern &&
      (e.exercise.easierVariantId || e.exercise.harderVariantId),
  );
}
interface PlanView {
  difficulty: string;
  days: { category: string; exercises: PlanExerciseView[] }[];
}

function flat(plan: PlanView) {
  return plan.days.flatMap((d) =>
    d.exercises.map((e) => ({ ...e, dayCategory: d.category })),
  );
}

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "piece4-password", displayName: "P4" });
  token = reg.body.token;
  // Foundations Home at standard resolution: mixes bodyweight (pushups,
  // bodyweight-squat, plank…) and loaded (dumbbell rows) exercises.
  await app
    .post("/plans/from-template")
    .set("Authorization", `Bearer ${token}`)
    .send({ templateId: "foundations-home", context: "home", experience: "intermediate" })
    .expect(201);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Piece 4 — per-plan difficulty baseline", () => {
  let originalIds: Record<string, string>; // planExercise.id → exerciseId
  let originalRest: Record<string, number>;

  it("gentle swaps bodyweight exercises one tier down, persistently", async () => {
    const before = (
      await app.get("/plans/active").set("Authorization", `Bearer ${token}`)
    ).body.plan as PlanView;
    originalIds = Object.fromEntries(flat(before).map((e) => [e.id, e.exerciseId]));
    originalRest = Object.fromEntries(flat(before).map((e) => [e.id, e.restSeconds]));

    const res = await app
      .patch("/plans/active/difficulty")
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: "gentle" })
      .expect(200);
    const after = res.body.plan as PlanView;
    expect(after.difficulty).toBe("gentle");

    let swapped = 0;
    let restAdjusted = 0;
    for (const e of flat(after)) {
      const beforeEx = flat(before).find((b) => b.id === e.id)!;
      if (isLaddered(beforeEx)) {
        // one tier down along the ladder (bottom rungs stay put)
        expect(e.exerciseId).toBe(
          beforeEx.exercise.easierVariantId ?? beforeEx.exerciseId,
        );
        if (beforeEx.exercise.easierVariantId) swapped++;
      } else if (e.dayCategory !== "cardio") {
        expect(e.restSeconds).toBe(beforeEx.restSeconds + 30); // more rest
        restAdjusted++;
      }
    }
    expect(swapped).toBeGreaterThan(0);
    expect(restAdjusted).toBeGreaterThan(0);
    // done-when: a bodyweight exercise went down one tier, persisted below
    const bodyweightSwaps = flat(before).filter(
      (b) =>
        b.exercise.equipment.includes("bodyweight") &&
        b.exercise.easierVariantId,
    );
    expect(bodyweightSwaps.length).toBeGreaterThan(0);

    // persisted: a fresh fetch shows the same gentle plan
    const fresh = (
      await app.get("/plans/active").set("Authorization", `Bearer ${token}`)
    ).body.plan as PlanView;
    expect(fresh.difficulty).toBe("gentle");
    expect(flat(fresh).map((e) => e.exerciseId)).toEqual(
      flat(after).map((e) => e.exerciseId),
    );
  });

  it("setting back to standard restores the original exercises and rest", async () => {
    const res = await app
      .patch("/plans/active/difficulty")
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: "standard" })
      .expect(200);
    const restored = res.body.plan as PlanView;
    expect(restored.difficulty).toBe("standard");
    for (const e of flat(restored)) {
      expect(e.exerciseId).toBe(originalIds[e.id]);
      expect(e.restSeconds).toBe(originalRest[e.id]);
    }
  });

  it("gentle → challenging resolves from the standard baseline, not two steps down-up", async () => {
    await app
      .patch("/plans/active/difficulty")
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: "gentle" })
      .expect(200);
    const res = await app
      .patch("/plans/active/difficulty")
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: "challenging" })
      .expect(200);
    const challenging = res.body.plan as PlanView;

    const originals = await prisma.exercise.findMany({
      where: { id: { in: Object.values(originalIds) } },
    });
    const origById = new Map(originals.map((e) => [e.id, e]));
    for (const e of flat(challenging)) {
      const base = origById.get(originalIds[e.id])!;
      if (base.movementPattern && (base.easierVariantId || base.harderVariantId)) {
        // exactly one tier up from the ORIGINAL rung (or the top rung itself)
        expect(e.exerciseId).toBe(base.harderVariantId ?? base.id);
      } else if (e.dayCategory !== "cardio") {
        expect(e.restSeconds).toBe(originalRest[e.id] - 30); // less rest
      }
    }

    // and returning to standard restores the originals once more
    const back = (
      await app
        .patch("/plans/active/difficulty")
        .set("Authorization", `Bearer ${token}`)
        .send({ difficulty: "standard" })
        .expect(200)
    ).body.plan as PlanView;
    for (const e of flat(back)) {
      expect(e.exerciseId).toBe(originalIds[e.id]);
      expect(e.restSeconds).toBe(originalRest[e.id]);
    }
  });

  it("no-op when already at the requested difficulty", async () => {
    const res = await app
      .patch("/plans/active/difficulty")
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: "standard" })
      .expect(200);
    expect(res.body.plan.difficulty).toBe("standard");
  });
});
