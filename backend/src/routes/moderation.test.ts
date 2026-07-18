// AUDIT S6: community moderation — image validation, reporting, auto-hide.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const app = supertest(createApp());
const stamp = Date.now();
const tokens: string[] = [];
let ownerToken: string;
let workoutId: string;

// 1x1 transparent PNG
const REAL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeAll(async () => {
  for (let i = 0; i < 4; i++) {
    const reg = await app.post("/auth/register").send({
      email: `mod-${stamp}-${i}@profit.dev`,
      password: "moderation-pass-1",
      displayName: `M${i}`,
    });
    tokens.push(reg.body.token);
  }
  ownerToken = tokens[0];
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: `mod-${stamp}` } } });
  await prisma.$disconnect();
});

describe("AUDIT S6 — image validation", () => {
  it("rejects a fake data URI whose bytes are not an image", async () => {
    const res = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Fake image",
        isPublic: true,
        coverImage: `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`,
        exercises: [{ exerciseId: "pushups", sets: 3, reps: "10", restSeconds: 60 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_IMAGE");
  });

  it("accepts a genuine PNG data URI and https URLs; avatar path validated too", async () => {
    const res = await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Real image",
        isPublic: true,
        coverImage: REAL_PNG,
        exercises: [{ exerciseId: "pushups", sets: 3, reps: "10", restSeconds: 60 }],
      })
      .expect(201);
    workoutId = res.body.workout.id;

    const badAvatar = await app
      .patch("/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ avatar: "data:image/png;base64,bm90YW5pbWFnZQ==" });
    expect(badAvatar.status).toBe(400);
    expect(badAvatar.body.error.code).toBe("BAD_IMAGE");
  });
});

describe("AUDIT S6 — reporting & auto-hide", () => {
  it("owners cannot report their own workout", async () => {
    const res = await app
      .post(`/workout-library/${workoutId}/report`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "testing" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OWN_WORKOUT");
  });

  it("3 distinct reporters auto-hide the workout from the public library", async () => {
    for (const t of tokens.slice(1)) {
      await app
        .post(`/workout-library/${workoutId}/report`)
        .set("Authorization", `Bearer ${t}`)
        .send({ reason: "inappropriate content" })
        .expect(200);
    }

    const list = await app
      .get("/workout-library/public")
      .set("Authorization", `Bearer ${tokens[1]}`)
      .expect(200);
    expect(
      list.body.workouts.some((w: { id: string }) => w.id === workoutId),
    ).toBe(false);
    await app
      .get(`/workout-library/${workoutId}`)
      .set("Authorization", `Bearer ${tokens[1]}`)
      .expect(404);

    // the owner still sees it under "mine" (hidden, not destroyed)
    const mine = await app
      .get("/workout-library/mine")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(mine.body.workouts.some((w: { id: string }) => w.id === workoutId)).toBe(true);
  });
});
