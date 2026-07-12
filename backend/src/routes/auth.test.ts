// Phase 1 "done when": account created via the API persists in Postgres and
// the issued token keeps working across a fresh app instance (the backend
// half of create account → force-quit → reopen → still logged in).
import "dotenv/config";
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const email = `p1-test-${Date.now()}@profit.dev`;
const password = "correct-horse-battery";

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Phase 1 — auth + profile", () => {
  it("registers, logs in, and reads the profile with the token", async () => {
    const app = supertest(createApp());

    const reg = await app
      .post("/auth/register")
      .send({ email, password, displayName: "Phase One" })
      .expect(201);
    expect(reg.body.token).toBeTruthy();
    expect(reg.body.user.email).toBe(email);

    const login = await app.post("/auth/login").send({ email, password }).expect(200);
    const token = login.body.token as string;

    const me = await app
      .get("/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.user.displayName).toBe("Phase One");

    // Profile update persists to Postgres
    await app
      .patch("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ goal: "bulking", trainingDays: 4, defaultContext: "home", units: "lb" })
      .expect(200);

    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser).toMatchObject({
      goal: "bulking",
      trainingDays: 4,
      defaultContext: "home",
      units: "lb",
    });

    // Session survives a "restart": a brand-new app instance (fresh process
    // state) still accepts the stored token.
    const reopened = supertest(createApp());
    const meAgain = await reopened
      .get("/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(meAgain.body.user.goal).toBe("bulking");
  });

  it("rejects duplicates, bad credentials, bad tokens, and bad input", async () => {
    const app = supertest(createApp());

    const dup = await app
      .post("/auth/register")
      .send({ email, password, displayName: "Dup" })
      .expect(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");

    const bad = await app.post("/auth/login").send({ email, password: "nope-wrong" }).expect(401);
    expect(bad.body.error.code).toBe("BAD_CREDENTIALS");

    const noTok = await app.get("/me").expect(401);
    expect(noTok.body.error.code).toBe("NO_TOKEN");

    const badBody = await app
      .post("/auth/register")
      .send({ email: "not-an-email", password: "short" })
      .expect(400);
    expect(badBody.body.error.code).toBe("VALIDATION_ERROR");

    const badDays = await app
      .patch("/me")
      .set("Authorization", `Bearer ${(await app.post("/auth/login").send({ email, password })).body.token}`)
      .send({ trainingDays: 9 })
      .expect(400);
    expect(badDays.body.error.code).toBe("VALIDATION_ERROR");
  });
});
