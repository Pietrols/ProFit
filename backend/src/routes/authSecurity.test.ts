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
  // 11 bcrypt compares back-to-back — generous timeout (see AUDIT S9)
  it("locks an email after repeated failed logins, without leaking whether it exists", { timeout: 20_000 }, async () => {
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

describe("AUDIT S5 — account deletion", () => {
  it("wrong password refuses; right password erases the account and all data", async () => {
    const em = `sec-del-${Date.now()}@profit.dev`;
    const reg = await app
      .post("/auth/register")
      .send({ email: em, password, displayName: "D" })
      .expect(201);
    const token = reg.body.token;
    const userId = reg.body.user.id;

    // give the account some data that must cascade away
    await app
      .post("/bodyweight/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        entries: [
          { id: "11111111-1111-4111-8111-111111111111", weightKg: 80, loggedAt: new Date().toISOString() },
        ],
      })
      .expect(200);

    const wrong = await app
      .delete("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "not-the-password" });
    expect(wrong.status).toBe(401);

    await app
      .delete("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password })
      .expect(200);

    // account, token, and every cascaded row are gone
    await app.get("/me").set("Authorization", `Bearer ${token}`).expect(401);
    await app.post("/auth/login").send({ email: em, password }).expect(401);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(
      await prisma.bodyweightEntry.count({ where: { userId } }),
    ).toBe(0);
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
