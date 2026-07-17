// Piece 1 "done when": querying the template set returns all 6, each
// resolving to real library exercises with valid movement-pattern/tier data;
// "easier variant of full push-up" resolves through the push ladder; creating
// a plan from a template persists a real plan via the standard path.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p1-templates-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

const TEMPLATE_IDS = [
  "gentle-start",
  "foundations-home",
  "foundations-gym",
  "fat-loss",
  "chest-arms-shoulders",
  "glutes-legs",
];

const PATTERNS = [
  "squat",
  "hinge",
  "push",
  "pull",
  "core",
  "carry",
  "cardio",
  "balance",
];

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "piece1-password", displayName: "P1" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Piece 1 — starter templates & progression ladders", () => {
  it("returns all 6 templates resolving to real exercises with valid pattern/tier", async () => {
    const res = await app
      .get("/plans/templates?context=home&experience=beginner")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const templates = res.body.templates;
    expect(templates.map((t: { id: string }) => t.id).sort()).toEqual(
      [...TEMPLATE_IDS].sort(),
    );

    for (const t of templates) {
      expect(t.disclaimer).toMatch(/not medical advice/);
      expect(t.days.length).toBeGreaterThan(0);
      for (const day of t.days) {
        expect(day.exercises.length).toBeGreaterThan(0);
        for (const e of day.exercises) {
          // resolved against the live library (server would 500 otherwise)
          expect(e.exercise.id).toBe(e.exerciseId);
          expect(e.exercise.name).toBeTruthy();
          expect(PATTERNS).toContain(e.exercise.movementPattern);
          expect(e.exercise.difficultyTier).toBeGreaterThanOrEqual(1);
          expect(e.exercise.difficultyTier).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it("beginner home resolution regresses to easier ladder rungs", async () => {
    const res = await app
      .get("/plans/templates?context=home&experience=beginner")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const foundations = res.body.templates.find(
      (t: { id: string }) => t.id === "foundations-home",
    );
    const ids = foundations.days.flatMap(
      (d: { exercises: { exerciseId: string }[] }) =>
        d.exercises.map((e) => e.exerciseId),
    );
    // full push-up regressed to incline push-up for beginners
    expect(ids).toContain("incline-push-up");
    expect(ids).not.toContain("pushups");
  });

  it("'easier variant of full push-up' resolves through the ladder", async () => {
    const pushups = await prisma.exercise.findUnique({
      where: { id: "pushups" },
    });
    expect(pushups?.movementPattern).toBe("push");
    expect(pushups?.easierVariantId).toBeTruthy();

    const easier = await prisma.exercise.findUnique({
      where: { id: pushups!.easierVariantId! },
    });
    expect(easier?.id).toBe("incline-push-up");
    expect(easier?.movementPattern).toBe("push");
    expect(easier?.difficultyTier).toBe(pushups!.difficultyTier! - 1);
    // ladder is bidirectional: the easier rung points back up
    expect(easier?.harderVariantId).toBe("pushups");
  });

  it("all 5 ladders chain correctly (pattern + adjacent tiers, symmetric links)", async () => {
    const laddered = await prisma.exercise.findMany({
      where: { easierVariantId: { not: null } },
    });
    expect(laddered.length).toBeGreaterThan(0);
    const all = new Map(
      (await prisma.exercise.findMany()).map((e) => [e.id, e]),
    );
    for (const e of laddered) {
      const easier = all.get(e.easierVariantId!);
      expect(easier, `${e.id} → ${e.easierVariantId} missing`).toBeTruthy();
      expect(easier!.movementPattern).toBe(e.movementPattern);
      expect(easier!.difficultyTier).toBe(e.difficultyTier! - 1);
      expect(easier!.harderVariantId).toBe(e.id);
    }
  });

  it("creating a plan from a template persists a real active plan", async () => {
    const res = await app
      .post("/plans/from-template")
      .set("Authorization", `Bearer ${token}`)
      .send({
        templateId: "glutes-legs",
        context: "home",
        experience: "beginner",
      })
      .expect(201);

    const plan = res.body.plan;
    expect(plan.name).toBe("Build Glutes & Legs");
    expect(plan.isActive).toBe(true);
    expect(plan.days.length).toBe(3);
    for (const day of plan.days) {
      for (const pe of day.exercises) {
        expect(pe.exercise.id).toBe(pe.exerciseId);
      }
    }
    // template cues carried through to the persisted plan
    const notes = plan.days.flatMap(
      (d: { exercises: { note: string | null }[] }) =>
        d.exercises.map((e) => e.note),
    );
    expect(notes.some((n: string | null) => n && n.length > 0)).toBe(true);

    const active = await app
      .get("/plans/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(active.body.plan.id).toBe(plan.id);
  });

  it("rejects unknown template and unsupported context", async () => {
    const bad = await app
      .post("/plans/from-template")
      .set("Authorization", `Bearer ${token}`)
      .send({ templateId: "nope", context: "home" })
      .expect(400);
    expect(bad.body.error.code).toBe("UNKNOWN_TEMPLATE");

    const ctx = await app
      .post("/plans/from-template")
      .set("Authorization", `Bearer ${token}`)
      .send({ templateId: "foundations-gym", context: "home" })
      .expect(400);
    expect(ctx.body.error.code).toBe("TEMPLATE_CONTEXT");
  });
});

describe("Piece 2 — onboarding flag", () => {
  it("new accounts start un-onboarded; PATCH /me marks (and can clear) it", async () => {
    const me = await app
      .get("/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.user.onboardedAt).toBeNull();

    const done = await app
      .patch("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ onboarded: true })
      .expect(200);
    expect(done.body.user.onboardedAt).toBeTruthy();

    const cleared = await app
      .patch("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ onboarded: false })
      .expect(200);
    expect(cleared.body.user.onboardedAt).toBeNull();
  });
});
