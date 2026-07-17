import { Router } from "express";
import * as plansController from "../controllers/plans.controller";
import { requireAuth } from "../middleware/auth";

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.post("/", plansController.create);
plansRouter.post("/custom", plansController.createCustom);
plansRouter.get("/templates", plansController.listTemplates);
plansRouter.post("/from-template", plansController.createFromTemplate);
plansRouter.get("/active", plansController.getActive);
plansRouter.patch("/active/difficulty", plansController.setDifficulty);
