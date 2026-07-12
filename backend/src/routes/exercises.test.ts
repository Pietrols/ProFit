// Phase 2 backend half: seeded library is served with a sync cursor, and
// goblet squat carries a demo image plus a home-equipment alternative.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p2-test-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase2-password", displayName: "P2" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 2 — exercise library", () => {
  it("requires auth", async () => {
    await app.get("/exercises").expect(401);
  });

  it("serves the seeded library with demo media and sync cursor", async () => {
    const res = await app
      .get("/exercises")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.serverTime).toBeTruthy();
    expect(res.body.exercises.length).toBeGreaterThanOrEqual(60);

    const goblet = res.body.exercises.find(
      (e: { id: string }) => e.id === "goblet-squat",
    );
    expect(goblet).toBeTruthy();
    expect(goblet.demoUrl).toMatch(/^https:\/\//);
    expect(goblet.category).toBe("bodybuilding");
    expect(goblet.homeAlternativeId).toBe("bodyweight-squat");

    // The home alternative exists and is genuinely home-equipment
    const alt = res.body.exercises.find(
      (e: { id: string }) => e.id === goblet.homeAlternativeId,
    );
    expect(alt.equipment).toContain("bodyweight");
  });

  it("updatedSince returns only newer rows (incremental sync)", async () => {
    const first = await app
      .get("/exercises")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const second = await app
      .get(`/exercises?updatedSince=${encodeURIComponent(first.body.serverTime)}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(second.body.exercises).toHaveLength(0);

    await prisma.exercise.update({
      where: { id: "goblet-squat" },
      data: { name: "Goblet Squat" }, // no-op change bumps updated_at
    });
    const third = await app
      .get(`/exercises?updatedSince=${encodeURIComponent(first.body.serverTime)}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(third.body.exercises.map((e: { id: string }) => e.id)).toEqual([
      "goblet-squat",
    ]);
  });

  it("rejects a malformed cursor", async () => {
    const res = await app
      .get("/exercises?updatedSince=yesterday")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
