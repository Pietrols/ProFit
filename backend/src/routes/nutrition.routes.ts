import { Router } from "express";
import * as nutritionController from "../controllers/nutrition.controller";
import { requireAuth } from "../middleware/auth";

export const nutritionRouter = Router();

nutritionRouter.use(requireAuth);
nutritionRouter.post("/profile/sync", nutritionController.syncProfile);
nutritionRouter.get("/profile", nutritionController.getProfile);
nutritionRouter.post("/meals/sync", nutritionController.syncMeals);
nutritionRouter.get("/meals", nutritionController.listMeals);
nutritionRouter.get("/suggestion", nutritionController.suggestion);
nutritionRouter.post("/estimate-macros", nutritionController.estimateMacros);
