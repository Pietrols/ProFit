import { Router } from "express";
import * as plansController from "../controllers/plans.controller";
import { requireAuth } from "../middleware/auth";

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.post("/", plansController.create);
plansRouter.get("/active", plansController.getActive);
