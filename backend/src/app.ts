import cors from "cors";
import express from "express";
import helmet from "helmet";
import { prisma } from "./db";
import { errorHandler } from "./middleware/error";
import { aiRouter } from "./routes/ai.routes";
import { authRouter } from "./routes/auth.routes";
import { bodyweightRouter } from "./routes/bodyweight.routes";
import { chatRouter } from "./routes/chat.routes";
import { exercisesRouter } from "./routes/exercises.routes";
import { nutritionRouter } from "./routes/nutrition.routes";
import { plansRouter } from "./routes/plans.routes";
import { recoveryRouter } from "./routes/recovery.routes";
import { userWorkoutsRouter } from "./routes/userWorkouts.routes";
import { workoutsRouter } from "./routes/workouts.routes";
import { profileRouter } from "./routes/profile.routes";

export function createApp() {
  const app = express();
  // Behind a TLS-terminating proxy in production (AUDIT S4): trust it so
  // req.ip is the real client (rate limiting) and HSTS applies end-to-end.
  app.set("trust proxy", 1);
  app.use(helmet());
  // CORS allowlist (AUDIT S7): native apps send no Origin and are unaffected;
  // browsers are denied unless the origin is explicitly listed.
  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length > 0 ? origins : false }));
  // Raised from the 100kb default to accommodate inline workout cover images
  // and profile avatars (data URIs). See DECISIONS (Group F/G).
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "up" });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  app.use("/auth", authRouter);
  app.use("/me", profileRouter);
  app.use("/exercises", exercisesRouter);
  app.use("/plans", plansRouter);
  app.use("/workouts", workoutsRouter);
  app.use("/bodyweight", bodyweightRouter);
  app.use("/ai", aiRouter);
  app.use("/nutrition", nutritionRouter);
  app.use("/chat", chatRouter);
  app.use("/recovery", recoveryRouter);
  app.use("/workout-library", userWorkoutsRouter);

  app.use(errorHandler);
  return app;
}
