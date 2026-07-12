import { Router } from "express";
import * as profileController from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get("/", profileController.getMe);
profileRouter.patch("/", profileController.updateMe);
