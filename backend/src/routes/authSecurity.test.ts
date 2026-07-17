// AUDIT S1+S2: auth brute-force throttling and token revocation.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import { resetAllRateLimits } from "../middleware/rateLimit";

beforeEach(() => resetAllRateLimits());

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

describe("AUDIT S2 — token revocation", () => {
  it("logout revokes the token server-side; a fresh login works again", async () => {
    const em = `sec-revoke-${Date.now()}@profit.dev`;
    const reg = await app
      .post("/auth/register")
      .send({ email: em, password, displayName: "R" })
      .expect(201);
    const token = reg.body.token;

    await app.get("/me").set("Authorization", `Bearer ${token}`).expect(200);
    await app.post("/auth/logout").set("Authorization", `Bearer ${token}`).expect(200);

    // the old token is dead everywhere, not just deleted locally
    const dead = await app.get("/me").set("Authorization", `Bearer ${token}`);
    expect(dead.status).toBe(401);
    expect(dead.body.error.code).toBe("BAD_TOKEN");

    const relogin = await app.post("/auth/login").send({ email: em, password });
    expect(relogin.status).toBe(200);
    await app
      .get("/me")
      .set("Authorization", `Bearer ${relogin.body.token}`)
      .expect(200);
    await prisma.user.deleteMany({ where: { email: em } });
  });
});
