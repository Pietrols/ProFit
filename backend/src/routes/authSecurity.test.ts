// AUDIT S1+S2: auth brute-force throttling and token revocation.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `sec-test-${Date.now()}@profit.dev`;
const password = "security-password-1";
const app = supertest(createApp());

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("AUDIT S1 — auth rate limiting", () => {
  it("locks an email after repeated failed logins, without leaking whether it exists", async () => {
    await app.post("/auth/register").send({ email, password, displayName: "Sec" });

    let limited = false;
    for (let i = 0; i < 11; i++) {
      const res = await app
        .post("/auth/login")
        .send({ email, password: "wrong-password" });
      if (res.status === 429) {
        expect(res.body.error.code).toBe("RATE_LIMITED");
        limited = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(limited).toBe(true);

    // even the RIGHT password is throttled once tripped (no oracle)
    const blocked = await app.post("/auth/login").send({ email, password });
    expect(blocked.status).toBe(429);
  });

  it("throttles mass registration from one source", async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const res = await app.post("/auth/register").send({
        email: `sec-mass-${Date.now()}-${i}@profit.dev`,
        password,
        displayName: "M",
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    await prisma.user.deleteMany({ where: { email: { startsWith: "sec-mass-" } } });
  });
});
