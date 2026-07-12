import { Router } from "express";
import * as recoveryController from "../controllers/recovery.controller";
import { requireAuth } from "../middleware/auth";

export const recoveryRouter = Router();

recoveryRouter.use(requireAuth);
recoveryRouter.post("/sync", recoveryController.sync);
