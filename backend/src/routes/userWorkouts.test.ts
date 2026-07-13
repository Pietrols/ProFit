// Group F done-when: a user marks a workout public, a SECOND account finds
// it in the library and copies it into their plans, and creating a workout
// with no image (and an unavailable AI suggestion) still saves.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const emailA = `f-creator-${Date.now()}@profit.dev`;
const emailB = `f-browser-${Date.now()}@profit.dev`;
let tokenA: string;
let tokenB: string;
let publicId: string;
const app = supertest(createApp());

beforeAll(async () => {
  const a = await app.post("/auth/register").send({ email: emailA, password: "group-f-passwordA", displayName: "Creator" });
  tokenA = a.body.token;
  const b = await app.post("/auth/register").send({ email: emailB, password: "group-f-passwordB", displayName: "Browser" });
  tokenB = b.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
  await prisma.$disconnect();
});

const workout = (overrides: Record<string, unknown> = {}) => ({
  name: "Push Blaster",
  isPublic: true,
  coverImage: null,
  exercises: [
    { exerciseId: "barbell-bench-press-medium-grip", sets: 4, reps: "6-8", restSeconds: 150, durationSeconds: null },
    { exerciseId: "dumbbell-shoulder-press", sets: 3, reps: "10-12", restSeconds: 90, durationSeconds: null },
  ],
  ...overrides,
});

describe("Group F — user workouts + public library", () => {
  it("account A creates a public workout", async () => {
    const res = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(workout())
      .expect(201);
    expect(res.body.workout.isPublic).toBe(true);
    expect(res.body.workout.exercises).toHaveLength(2);
    publicId = res.body.workout.id;
  });

  it("account B finds A's workout in the public library with creator name", async () => {
    const res = await app
      .get("/workout-library/public")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    const found = res.body.workouts.find((w: { id: string }) => w.id === publicId);
    expect(found).toBeTruthy();
    expect(found.user.displayName).toBe("Creator");
  });

  it("account B copies it into their own plans (a copy, not a reference)", async () => {
    const res = await app
      .post(`/workout-library/${publicId}/copy`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(201);
    expect(res.body.plan.name).toBe("Push Blaster");
    expect(res.body.plan.days[0].exercises).toHaveLength(2);

    // B now has an active plan; it belongs to B, not A
    const active = await app.get("/plans/active").set("Authorization", `Bearer ${tokenB}`).expect(200);
    expect(active.body.plan.name).toBe("Push Blaster");
    const bPlanCount = await prisma.plan.count({ where: { user: { email: emailB } } });
    expect(bPlanCount).toBe(1);
  });

  it("a private workout is NOT visible to other users", async () => {
    const priv = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(workout({ name: "Secret", isPublic: false }))
      .expect(201);
    const res = await app.get("/workout-library/public").set("Authorization", `Bearer ${tokenB}`).expect(200);
    expect(res.body.workouts.find((w: { id: string }) => w.id === priv.body.workout.id)).toBeUndefined();
    // and a direct fetch 404s for non-owners
    await app.get(`/workout-library/${priv.body.workout.id}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  });

  it("creating a workout with NO image still saves (AI suggestion unavailable)", async () => {
    const suggest = await app
      .post("/workout-library/suggest-image")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Push Blaster" })
      .expect(200);
    expect(suggest.body.available).toBe(false); // no image generation on this stack
    expect(suggest.body.imageUrl).toBeNull();

    // user rejects/ignores the (absent) suggestion → save with no image
    const res = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(workout({ name: "No Image Workout", coverImage: null }))
      .expect(201);
    expect(res.body.workout.coverImage).toBeNull();
  });

  it("rejects a workout referencing an unknown exercise", async () => {
    const res = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(workout({ exercises: [{ exerciseId: "nope", sets: 3, reps: "8", restSeconds: 60, durationSeconds: null }] }))
      .expect(400);
    expect(res.body.error.code).toBe("UNKNOWN_EXERCISE");
  });
});
