import { Router } from "express";
import * as workoutsController from "../controllers/workouts.controller";
import { requireAuth } from "../middleware/auth";

export const workoutsRouter = Router();

workoutsRouter.use(requireAuth);
workoutsRouter.post("/sync", workoutsController.sync);
workoutsRouter.get("/", workoutsController.list);
