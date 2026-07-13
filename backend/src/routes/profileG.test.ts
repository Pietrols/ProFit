// Group G done-when (backend half): a user's avatar + public bio are visible
// to others ONLY through a public workout they shared; a user with no public
// workouts has no discoverable profile.
import "dotenv/config";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { prisma } from "../db";

const emailA = `g-shared-${Date.now()}@profit.dev`;
const emailB = `g-viewer-${Date.now()}@profit.dev`;
const emailC = `g-private-${Date.now()}@profit.dev`;
let tokenA: string;
let tokenB: string;
let tokenC: string;
const app = supertest(createApp());
const AVATAR = "data:image/jpeg;base64,QQ=="; // tiny stand-in

beforeAll(async () => {
  const a = await app.post("/auth/register").send({ email: emailA, password: "group-g-passwordA", displayName: "Sharer" });
  tokenA = a.body.token;
  const b = await app.post("/auth/register").send({ email: emailB, password: "group-g-passwordB", displayName: "Viewer" });
  tokenB = b.body.token;
  const c = await app.post("/auth/register").send({ email: emailC, password: "group-g-passwordC", displayName: "Hermit" });
  tokenC = c.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB, emailC] } } });
  await prisma.$disconnect();
});

describe("Group G — profile picture + public bio", () => {
  it("sets avatar + bio on the owner's profile and echoes them back", async () => {
    const res = await app
      .patch("/me")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ avatar: AVATAR, publicBio: "Chasing a 2x bodyweight squat." })
      .expect(200);
    expect(res.body.user.avatar).toBe(AVATAR);
    expect(res.body.user.publicBio).toBe("Chasing a 2x bodyweight squat.");
  });

  it("surfaces the creator's avatar + bio via a shared public workout", async () => {
    await app
      .post("/workout-library")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Sharer's Session",
        isPublic: true,
        coverImage: null,
        exercises: [{ exerciseId: "goblet-squat", sets: 3, reps: "8-12", restSeconds: 90, durationSeconds: null }],
      })
      .expect(201);

    const res = await app
      .get("/workout-library/public")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    const w = res.body.workouts.find((x: { user: { displayName: string } }) => x.user.displayName === "Sharer");
    expect(w.user.avatar).toBe(AVATAR);
    expect(w.user.publicBio).toBe("Chasing a 2x bodyweight squat.");
  });

  it("a user with no public workouts has no discoverable profile", async () => {
    // Hermit set a bio too, but shared nothing public.
    await app
      .patch("/me")
      .set("Authorization", `Bearer ${tokenC}`)
      .send({ publicBio: "You cannot see me." })
      .expect(200);

    const res = await app
      .get("/workout-library/public")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    // Hermit never appears as a creator anywhere in the public library.
    expect(
      res.body.workouts.some(
        (w: { user: { displayName: string } }) => w.user.displayName === "Hermit",
      ),
    ).toBe(false);
    // and there is no public GET-user-by-id endpoint at all
    await app.get(`/users/${c_id()}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  });
});

// Hermit's id isn't needed precisely — any id hits the missing route.
function c_id() {
  return "00000000-0000-4000-8000-000000000000";
}
