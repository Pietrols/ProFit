import cors from "cors";
import express from "express";
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
  app.use(cors());
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
