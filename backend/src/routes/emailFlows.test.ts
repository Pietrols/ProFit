// AUDIT S3: email verification + password reset. The test transport captures
// codes instead of sending mail; responses never reveal account existence.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";
import { Mail, setMailTransport } from "../lib/mailer";
import { resetAllRateLimits } from "../middleware/rateLimit";

const email = `flows-${Date.now()}@profit.dev`;
const password = "flows-password-1";
const app = supertest(createApp());

const sent: Mail[] = [];
setMailTransport(async (mail) => {
  sent.push(mail);
});
const lastCode = () => /\b(\d{6})\b/.exec(sent[sent.length - 1].text)![1];

beforeEach(() => resetAllRateLimits());

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("AUDIT S3 — email verification", () => {
  it("register sends a code; verifying marks the account", async () => {
    const reg = await app
      .post("/auth/register")
      .send({ email, password, displayName: "F" })
      .expect(201);
    expect(reg.body.user.emailVerifiedAt).toBeNull();
    // register responds before the send — wait for the background mail
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.length).toBe(1);

    await app
      .post("/auth/verify-email")
      .send({ email, code: lastCode() })
      .expect(200);
    const me = await app
      .get("/me")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .expect(200);
    expect(me.body.user.emailVerifiedAt).toBeTruthy();
  });

  it("wrong codes fail and burn attempts; unknown emails get identical responses", async () => {
    const bad = await app
      .post("/auth/verify-email")
      .send({ email, code: "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("BAD_CODE");

    // no enumeration: nonexistent account looks exactly like a used account
    await app
      .post("/auth/resend-verification")
      .send({ email: "nobody@profit.dev" })
      .expect(200);
    await app.post("/auth/resend-verification").send({ email }).expect(200);
  });
});

describe("AUDIT S3 — password reset", () => {
  it("full reset: old password + old tokens die, new password works", async () => {
    const login = await app.post("/auth/login").send({ email, password }).expect(200);
    const oldToken = login.body.token;

    await app.post("/auth/forgot-password").send({ email }).expect(200);
    const code = lastCode();
    const newPassword = "brand-new-password-2";

    await app
      .post("/auth/reset-password")
      .send({ email, code, newPassword })
      .expect(200);

    // the code burns on use
    await app
      .post("/auth/reset-password")
      .send({ email, code, newPassword: "another-pass-3" })
      .expect(400);
    // outstanding sessions are revoked (S2)
    await app.get("/me").set("Authorization", `Bearer ${oldToken}`).expect(401);
    // old password dead, new password live
    await app.post("/auth/login").send({ email, password }).expect(401);
    await app.post("/auth/login").send({ email, password: newPassword }).expect(200);
  });

  it("forgot-password for an unknown email responds identically", async () => {
    const before = sent.length;
    await app
      .post("/auth/forgot-password")
      .send({ email: "ghost@profit.dev" })
      .expect(200);
    expect(sent.length).toBe(before); // nothing sent, same response
  });
});
