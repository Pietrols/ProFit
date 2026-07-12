import cors from "cors";
import express from "express";
import { prisma } from "./db";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth.routes";
import { exercisesRouter } from "./routes/exercises.routes";
import { profileRouter } from "./routes/profile.routes";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

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

  app.use(errorHandler);
  return app;
}
