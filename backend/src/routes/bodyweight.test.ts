// Phase 5: bodyweight log sync — same idempotency contract as workouts.
import { randomUUID } from "node:crypto";
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p5-bw-${Date.now()}@profit.dev`;
let token: string;
const app = supertest(createApp());

beforeAll(async () => {
  const reg = await app
    .post("/auth/register")
    .send({ email, password: "phase5-password", displayName: "P5" });
  token = reg.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 5 — bodyweight sync", () => {
  it("re-sending the same batch never duplicates; corrections converge", async () => {
    const entry = {
      id: randomUUID(),
      weightKg: 82.4,
      loggedAt: "2026-07-10T07:30:00.000Z",
    };

    await app
      .post("/bodyweight/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ entries: [entry] })
      .expect(200);
    await app
      .post("/bodyweight/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ entries: [entry] })
      .expect(200);

    entry.weightKg = 82.1; // corrected on device
    await app
      .post("/bodyweight/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ entries: [entry] })
      .expect(200);

    const list = await app
      .get("/bodyweight")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.entries).toHaveLength(1);
    expect(list.body.entries[0].weightKg).toBe(82.1);
  });

  it("rejects nonsense weights", async () => {
    const res = await app
      .post("/bodyweight/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ entries: [{ id: randomUUID(), weightKg: -3, loggedAt: "2026-07-10T07:30:00.000Z" }] })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
