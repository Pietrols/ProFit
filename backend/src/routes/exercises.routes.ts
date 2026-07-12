import { Router } from "express";
import * as exercisesController from "../controllers/exercises.controller";
import { requireAuth } from "../middleware/auth";

export const exercisesRouter = Router();

exercisesRouter.use(requireAuth);
exercisesRouter.get("/", exercisesController.list);
