import { Router } from "express";
import * as aiController from "../controllers/ai.controller";
import { requireAuth } from "../middleware/auth";

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.get("/ability", aiController.ability);
aiRouter.post("/plan-builder", aiController.planBuilder);
aiRouter.get("/next-session/:planDayId", aiController.nextSession);
